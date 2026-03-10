# Common Pitfalls

**Domain:** Dental SaaS — 3D web capture/viewer + React TypeScript codebase professionalization
**Researched:** 2026-03-10
**Confidence:** HIGH (grounded in codebase analysis + CONCERNS.md findings)

---

## Camera Stream Management

### Pitfall 1: Orphaned MediaStream on Component Unmount

**What goes wrong:** Camera stream obtained via `getUserMedia()` is not stopped when the component unmounts. Camera indicator light stays on; stream consumes memory; on iOS/Safari the mic/camera lock persists.

**Why it happens:** The existing `ScanSubmission.tsx` already has this bug — `streamRef.current?.getTracks().forEach(t => t.stop())` is called in some cleanup paths but not when async initialization fails mid-flight. If the user navigates away before `camera.play()` resolves, the track is never stopped.

**Warning signs:**
- Camera LED stays on after leaving capture pages
- Users report "camera in use" error when re-entering capture
- Memory usage climbs after repeated capture → navigate cycles

**Prevention:**
```typescript
useEffect(() => {
  let stream: MediaStream | null = null;
  let cancelled = false;

  navigator.mediaDevices.getUserMedia({ video: true })
    .then(s => {
      if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s;
      videoRef.current!.srcObject = s;
    });

  return () => {
    cancelled = true;
    stream?.getTracks().forEach(t => t.stop());
  };
}, []);
```

**Phase:** Fix in the professionalization phase (existing ScanSubmission.tsx + RecordResponse.tsx). Apply same pattern to `useThreeDCapture`.

---

### Pitfall 2: getUserMedia Fails Silently on HTTP (Non-Localhost)

**What goes wrong:** `getUserMedia()` throws `NotAllowedError` or `NotSupportedError` on non-HTTPS origins. In production behind a plain HTTP deployment, capture silently fails.

**Warning signs:** Works on localhost, fails on production staging URL.

**Prevention:** Enforce HTTPS in deployment config. Add an explicit permission-denied error state that explains the HTTPS requirement to users. Never swallow the `getUserMedia` rejection without a user-facing error.

**Phase:** Deployment configuration check before any capture feature goes to staging.

---

## Three.js / WebGL Memory Management

### Pitfall 3: WebGL Context Exhaustion (16-Context Browser Limit)

**What goes wrong:** Browsers enforce a limit of 8–16 simultaneous WebGL contexts. Each `<Canvas>` from @react-three/fiber creates one context. If multiple 3D components mount without unmounting (e.g., ThreeDCompare has 2 canvases; a patient list page has a thumbnail Canvas per scan), the browser silently kills the oldest contexts.

**Warning signs:** 3D viewers go black intermittently; "Too many active WebGL contexts" in browser console.

**Prevention:**
- `ThreeDCompare` is the maximum — 2 contexts. Never exceed 2 simultaneously.
- All `<Canvas>` components must be lazy-loaded and unmounted when not visible.
- Use a single `<Canvas>` with scene switching rather than multiple canvases for thumbnail previews. Use static PNG screenshots (from `gl.domElement.toBlob()`) as scan history thumbnails — not live canvases.

**Phase:** Architecture constraint to enforce during 3D feature build. Screenshot export serves double duty as the thumbnail source.

---

### Pitfall 4: Three.js Geometry and Material Memory Leaks

**What goes wrong:** Three.js objects (`BufferGeometry`, `Material`, `Texture`) are not garbage collected by JavaScript — they hold GPU memory. Navigating between 3D viewer pages without disposing these objects accumulates GPU memory until the browser tab crashes.

**Warning signs:** GPU memory climbs on every navigation to a 3D page; performance degrades over a session.

**Prevention:**
```typescript
useEffect(() => {
  return () => {
    // Called when MouthModelViewer unmounts
    useGLTF.clear(modelUrl); // Clears drei's internal cache
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  };
}, [modelUrl]);
```

**Phase:** `MouthModelViewer` component build — add disposal in the `useEffect` cleanup from day one.

---

## Supabase Storage — Large Binary Files

### Pitfall 5: Partial Frame Upload Corruption

**What goes wrong:** A sequential upload loop uploads 40 of 60 frames before a network hiccup causes the remaining 20 to fail. The `three_d_scans` row is inserted with `frame_count: 60` but only 40 frames exist in storage. The edge function receives an incomplete frame set and reconstruction silently fails or produces a broken model.

**Warning signs:** `process-3d-scan` completes but model appears deformed or missing sections; `frame_count` in DB doesn't match actual stored files.

**Prevention:**
- Upload with retry: wrap each frame upload in a retry loop (max 3 attempts with exponential backoff) before failing the entire capture.
- Track successful uploads client-side. Only insert the `three_d_scans` row and invoke the edge function after `successfulUploads === totalFrames`.
- Set `frame_count` to the actual number of successfully uploaded frames.

**Phase:** `useThreeDCapture` hook implementation.

---

### Pitfall 6: `.single()` Crashes on Missing Three-D Scan Records

**What goes wrong:** `supabase.from("three_d_scans").select().eq("id", id).single()` throws if the row doesn't exist (e.g., a patient navigates to `/patient/3d-view/:id` with a stale or guessed ID). The existing codebase already has 20+ instances of this bug pattern documented in CONCERNS.md.

**Warning signs:** White screen or uncaught error when loading a scan that doesn't exist.

**Prevention:** Use `.maybeSingle()` instead of `.single()` for any query where the row may not exist. Handle `null` data explicitly:
```typescript
const { data, error } = await supabase
  .from("three_d_scans")
  .select()
  .eq("id", scanId)
  .maybeSingle();

if (!data) { navigate("/patient"); return; }
```

**Phase:** All new 3D pages. Also fix existing instances across the codebase in the professionalization phase.

---

### Pitfall 7: Storing Signed URLs in the Database

**What goes wrong:** `three_d_scans.model_url` is set to the full Supabase signed URL (including the token query parameter). Signed URLs expire after 1 hour. After expiration, `useGLTF(signedUrl)` fetches a 403, renders a broken model with no error recovery path. Links shared between colleagues also expire.

**Prevention:** Store only the raw storage path (`3d-scans/{patient_id}/{scan_3d_id}/model.glb`). Generate a fresh signed URL at load time on the client. Set a renewal timer before expiry.

**Phase:** Database schema design (Step 1 of build order) — enforce this as a schema convention before any code is written.

---

## HIPAA Compliance

### Pitfall 8: PHI Routed to Non-BAA Third-Party Services

**What goes wrong:** Integrating a photogrammetry API (Luma AI, Polycam) that has not signed a Business Associate Agreement (BAA) means patient 3D scan frames — which contain facial/oral PHI — are transmitted to a non-covered entity. This is a HIPAA violation.

**Warning signs:** Any external API call that receives raw frame data or patient identifiers without a signed BAA.

**Prevention:**
- The stub reconstruction in v1 avoids this entirely (no external API called).
- Before wiring any real photogrammetry API: verify BAA availability, review terms of service for PHI handling, confirm data residency.
- If no BAA is available: frames must be de-identified before sending (remove metadata, avoid frames that capture patient face outside the oral cavity).
- Document the BAA status of every external API in a compliance register.

**Phase:** External API integration milestone (post-v1). The stub approach in this milestone is the correct HIPAA-safe choice.

---

### Pitfall 9: Missing RLS on `scan_annotations` Table

**What goes wrong:** If Row Level Security is not configured on `scan_annotations`, any authenticated user can read all doctors' clinical annotations on all patients. This is a HIPAA violation and a trust-destroying data leak.

**Warning signs:** `scan_annotations` query returns rows for unrelated patients.

**Prevention:** Apply RLS from day one of migration creation:
- Doctors: `SELECT` and `INSERT` on their own annotations (`doctor_id = auth.uid()`)
- Patients: `SELECT` on annotations for their own scans (join via `three_d_scans.patient_id`)
- Service role: unrestricted

Test RLS with a second user account before shipping. Follow the exact same RLS pattern as the existing `scans` and `scan-videos` tables.

**Phase:** Database foundation phase (Step 1). Cannot be deferred.

---

## React TypeScript Code Quality

### Pitfall 10: `any` Type Spreading into New 3D Interfaces

**What goes wrong:** The existing codebase has 102 instances of `any` type. When new 3D feature code queries `three_d_scans` or `scan_annotations` and assigns results to `any`, TypeScript provides no safety for the new pipeline. Bugs that would be caught at compile time become runtime crashes.

**Warning signs:** `const scan: any = data` in new files; `(detectionData as any).findings` in viewer components.

**Prevention:** Define proper interfaces for all new types before writing the first query:
```typescript
type ThreeDScanStatus = "uploading" | "processing" | "ready" | "error";

interface ThreeDScan {
  id: string;
  patient_id: string;
  scan_id: string | null;
  model_url: string | null;
  status: ThreeDScanStatus;
  frame_count: number;
  created_at: string;
}

interface ScanAnnotation {
  id: string;
  scan_3d_id: string;
  doctor_id: string;
  position_x: number;
  position_y: number;
  position_z: number;
  note: string;
  created_at: string;
}
```

**Phase:** New 3D feature code — enforce in code review. Do not accept PRs with `any` on new types.

---

### Pitfall 11: Excessive Re-renders from Three.js State in React State

**What goes wrong:** Camera rotation, mouse position, and raycaster intersection data are stored in React `useState`. Every frame update (60fps) triggers a React re-render, causing severe performance degradation.

**Warning signs:** Frame rate drops to <20fps during orbit controls use; React DevTools shows hundreds of re-renders per second.

**Prevention:**
- Camera state, orbit deltas, and raycaster hit data live in `useRef` or Three.js objects — never in `useState`.
- Only annotation data (persisted to DB, rarely changes) and processing status (changes once per scan) belong in React state.
- Use `useFrame` from @react-three/fiber for per-frame updates rather than React state setters.

**Phase:** `MouthModelViewer` build — establish this pattern before any state is added.

---

### Pitfall 12: Promise.all for Multi-Step 3D Data Loading

**What goes wrong:** Loading a 3D viewer requires: (1) query `three_d_scans`, (2) get signed URL, (3) query `scan_annotations`, (4) query `scans` for AI detection data. Using `Promise.all` means if annotation query fails (e.g., no annotations exist yet for a new scan), the entire viewer fails to load.

**Warning signs:** Doctor opens a new scan (no annotations yet) and gets an error page instead of the viewer.

**Prevention:** Use `Promise.allSettled()` for independent queries. Render the viewer with whatever data is available:
```typescript
const [scanResult, annotationsResult, detectionResult] = await Promise.allSettled([
  fetchThreeDScan(scanId),
  fetchAnnotations(scanId),
  fetchDetectionData(scanId),
]);

// Each result is { status: "fulfilled" | "rejected", value | reason }
// Render viewer with fulfilled data; show fallback for rejected
```

**Phase:** All three viewer pages. This directly addresses the bug pattern documented in CONCERNS.md for `PatientDetail.tsx` and `admin/Overview.tsx`.

---

### Pitfall 13: No Loading Lock on Capture Submit

**What goes wrong:** Patient taps "Submit Scan" twice. Two concurrent upload sequences run. Two `three_d_scans` rows are inserted. Two edge function invocations fire. Patient ends up with duplicate scans.

**Warning signs:** Duplicate rows in `three_d_scans` for the same patient + timestamp.

**Prevention:** Set a `isSubmitting` boolean flag on the first tap. Disable (and visually grey out) the submit button while `isSubmitting === true`. Reset to false only on success or error. Add a unique constraint on `(patient_id, created_at)` in the migration as a DB-level safety net.

**Phase:** `ThreeDScanCapture` page implementation.

---

### Pitfall 14: React Query Over-Caching Stale Clinical Data

**What goes wrong:** React Query is configured with a default stale time. A doctor reviews a scan, the query result is cached. Another doctor updates the scan status. The first doctor's UI still shows the old status from cache.

**Warning signs:** Scan status shows "processing" after it has completed; annotations appear stale after another session adds them.

**Prevention:** Set appropriate stale times per query type:
- `three_d_scans` status queries: `staleTime: 0` (always fresh — status changes are critical)
- `scan_annotations`: `staleTime: 30_000` (30s — annotations change infrequently during a session)
- Patient profiles: `staleTime: 300_000` (5min — rarely changes)

Use `queryClient.invalidateQueries()` on the `three_d_scans` key after the Realtime subscription fires a status update.

**Phase:** All viewer pages that use React Query for 3D scan data.

---

## Summary: Phase Mapping

| Pitfall | Phase |
|---------|-------|
| Camera stream leak (Pitfall 1) | Professionalization — fix ScanSubmission + RecordResponse; apply to useThreeDCapture |
| getUserMedia HTTPS requirement (Pitfall 2) | Deployment config before staging |
| WebGL context exhaustion (Pitfall 3) | Architecture constraint — enforce during 3D feature build |
| Three.js memory leaks (Pitfall 4) | MouthModelViewer build (Step 5) |
| Partial frame upload corruption (Pitfall 5) | useThreeDCapture hook (Step 3) |
| .single() crashes (Pitfall 6) | All new 3D pages + professionalization sweep of existing pages |
| Signed URLs in DB (Pitfall 7) | Database schema design (Step 1) |
| PHI to non-BAA API (Pitfall 8) | Future photogrammetry API milestone — stub avoids this in v1 |
| Missing RLS on scan_annotations (Pitfall 9) | Database foundation (Step 1) — cannot defer |
| `any` type spreading (Pitfall 10) | New 3D feature code — enforce in every new file |
| Three.js state in React state (Pitfall 11) | MouthModelViewer build (Step 5) |
| Promise.all for multi-step loading (Pitfall 12) | All viewer pages + professionalization sweep |
| No submit loading lock (Pitfall 13) | ThreeDScanCapture page (Step 4) |
| React Query stale clinical data (Pitfall 14) | All viewer pages using React Query |

---

*Pitfalls analysis: 2026-03-10*
