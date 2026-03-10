# Architecture Patterns

**Domain:** 3D oral scan capture-and-view pipeline within React + Supabase SPA
**Researched:** 2026-03-10
**Confidence:** HIGH (grounded in existing codebase analysis)

---

## Recommended Architecture

The 3D pipeline is a vertical slice layered on top of the existing SPA architecture. It adds four bounded areas: Capture, Upload+Trigger, Process+Store, and Viewer. Each area maps to existing conventions already in the codebase (camera hooks, edge functions, Supabase storage, Three.js Canvas) and introduces only one net-new concept: real-time processing status via Supabase subscriptions.

### High-Level Pipeline

```
[ Patient Camera Feed ]
        |
        | captureFrame() x 30-60 frames (canvas -> Blob, JPEG 0.85)
        v
[ Frame Buffer (in-memory array) ]
        |
        | sequential upload loop -> supabase.storage "3d-scans" bucket
        v
[ Supabase Storage: 3d-scans/{patient_id}/{timestamp}/frame-{n}.jpg ]
        |
        | supabase.functions.invoke("process-3d-scan", { scan_3d_id })
        v
[ Edge Function: process-3d-scan ]
        |   writes three_d_scans.status = "processing"
        |   stubs reconstruction -> writes .glb to storage, sets status = "ready"
        v
[ Supabase Storage: 3d-scans/{patient_id}/{scan_3d_id}/model.glb ]
        |
        | Supabase Realtime subscription on three_d_scans row
        v
[ Status resolves to "ready" ]
        |
        | getSignedUrl() for model.glb
        v
[ MouthModelViewer (@react-three/fiber + drei useGLTF) ]
        |
        | raycasting (pointer events on mesh nodes)
        v
[ scan_annotations table (x, y, z, note, scan_3d_id, doctor_id) ]
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `ThreeDScanCapture` page (`/patient/3d-scan`) | Guided multi-frame capture, progress ring, upload, edge function trigger | `useThreeDCapture` hook, Supabase storage, `process-3d-scan` edge function |
| `useThreeDCapture` hook | Camera lifecycle, frame extraction loop, upload orchestration, processing subscription | `navigator.mediaDevices`, Supabase client, `three_d_scans` realtime channel |
| `process-3d-scan` edge function | Receives `scan_3d_id`, writes `three_d_scans` row as "processing", stubs GLB, writes model URL, updates status to "ready" | Supabase service-role client, storage (write), `three_d_scans` table (write) |
| `MouthModelViewer` component | Renders GLB mesh in `<Canvas>`, orbit/pan/zoom, color overlays, annotation pins, screenshot export | `useGLTF` (drei), `OrbitControls` (drei), `useAnnotations` hook |
| `useAnnotations` hook | Load annotations for a `scan_3d_id`, persist new annotations on raycaster hit | Supabase client (`scan_annotations` table) |
| `ThreeDViewPatient` page (`/patient/3d-view/:id`) | Patient-facing read-only viewer, fallback procedural arch if no model | `MouthModelViewer` (interactive=false), `three_d_scans` query |
| `ThreeDViewDoctor` page (`/doctor/3d-view/:scanId`) | Doctor interactive viewer with annotation tools, measurement, screenshot, linked from ScanReview | `MouthModelViewer` (interactive=true), `useAnnotations`, `useMeasurement` |
| `ThreeDCompare` page (`/doctor/3d-compare`) | Dual-panel synced viewer; extends `ScanCompare.tsx` pattern | Two `MouthModelViewer` instances with shared camera state via ref |
| `useMeasurement` hook | Tracks two raycaster hit points, computes Euclidean distance in scene units | Three.js `Vector3.distanceTo()`, local state only |

### Component Dependency Graph

```
ThreeDScanCapture
  └── useThreeDCapture
        ├── Supabase storage (upload frames)
        ├── process-3d-scan (invoke)
        └── Supabase realtime (subscribe three_d_scans)

MouthModelViewer  (shared — consumed by 3 pages)
  ├── useGLTF / drei
  ├── OrbitControls / drei
  ├── useAnnotations
  │     └── Supabase client (scan_annotations)
  └── useMeasurement (doctor only, passed via prop)

ThreeDViewPatient  --> MouthModelViewer (interactive=false)
ThreeDViewDoctor   --> MouthModelViewer (interactive=true) + useMeasurement
ThreeDCompare      --> MouthModelViewer x2 (synced cameras)
```

---

## Data Flow

### Capture → Upload → Process

1. Patient navigates to `/patient/3d-scan`. `useThreeDCapture` starts camera via `navigator.mediaDevices.getUserMedia()` — same pattern as existing `ScanSubmission.tsx`.
2. Patient sweeps camera. At ~2 fps, the hook calls `captureFrame()` on interval (canvas `drawImage` → `toBlob`). Buffer accumulates 30-60 JPEG Blobs in memory.
3. On "Submit Scan": sequential upload loop iterates the buffer. Each frame uploads to `3d-scans/{patient_id}/{timestamp}/frame-{n}.jpg`. Progress ring is driven by `(framesUploaded / totalFrames) * 100`.
4. After all frames upload: insert `three_d_scans` row with `{ patient_id, scan_id, status: "uploading", frame_count }`.
5. Invoke `process-3d-scan` edge function with `{ scan_3d_id }`.
6. Edge function updates row status to `"processing"`, stubs reconstruction, uploads sample GLB to `3d-scans/{patient_id}/{scan_3d_id}/model.glb`, then updates row with `{ model_url, status: "ready" }`.

### Processing Status via Realtime Subscription

The client subscribes to the `three_d_scans` row via Supabase Realtime immediately after invoking the edge function. When `status` changes to `"ready"`, the subscription fires and the client navigates to `/patient/3d-view/{scan_3d_id}`. The subscription is removed in the `useEffect` cleanup function.

**Why Realtime over polling:** Polling with `setInterval` replicates the "timer not cleared on unmount" bug class documented in CONCERNS.md. Realtime subscription uses the same cleanup pattern (`supabase.removeChannel()` in `useEffect` return) that should be applied to existing message subscriptions.

**Processing status state machine:**
```
uploading --> processing --> ready
                        --> error  (on edge function failure)
```

### Viewer → Annotation Persistence

1. Doctor opens `/doctor/3d-view/:scanId`. Page queries `three_d_scans` to resolve storage path, then calls `createSignedUrl(storagePath, 3600)`.
2. `MouthModelViewer` loads the signed URL via `useGLTF(signedUrl)`.
3. Doctor clicks a point on the mesh. The `onPointerDown` event provides `ThreeEvent<PointerEvent>` with `.point` (world-space `Vector3`).
4. Note modal prompts for a clinical note. On submit: `supabase.from("scan_annotations").insert({ scan_3d_id, doctor_id, position_x, position_y, position_z, note })`.
5. `useAnnotations` re-fetches or optimistically appends. Each annotation renders as `<Html>` pin (drei) at `[x, y, z]`.

### Color Overlays

AI detection data from `analyze-scan-teeth` (tooth-level `{ toothId, status }`) drives vertex color overlays:

1. `MouthModelViewer` accepts a `detectionData` prop from the parent page.
2. On GLB load, walks `scene.children` looking for mesh nodes named `tooth_11`, `tooth_12`, etc.
3. Matching nodes have `material.color` set: `#ef4444` for `attention`, `#22c55e` for `on_track`.
4. When `modelUrl` is null, renders existing procedural arch from `TeethScene.tsx` as fallback.

### Synced 3D Comparison

`ThreeDCompare` mounts two `MouthModelViewer` instances. Camera sync is achieved by passing an `onCameraChange` callback to the primary viewer that propagates rotations and zoom to the secondary viewer's `OrbitControls` imperative handle. Mirrors the dual-panel layout in `ScanCompare.tsx`.

---

## Patterns to Follow

### Pattern 1: Hook-Encapsulated Camera Lifecycle

All `MediaStream` setup, frame capture, upload loop, and cleanup live in `useThreeDCapture`. Pages hold no refs themselves.

```typescript
function useThreeDCapture(patientId: string) {
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  return { cameraReady, captureAndUpload, status, scan3dId };
}
```

### Pattern 2: Storage Path in DB, Signed URL at Load Time

Store the raw storage path (`3d-scans/{patient_id}/{scan3d_id}/model.glb`) in `three_d_scans.model_url`. Generate the signed URL on the client immediately before passing to `useGLTF`. Add a `useEffect` with a `setTimeout` at `(TTL - 60)` seconds for silent renewal.

### Pattern 3: Lazy Canvas Load

```typescript
const MouthModelViewer = React.lazy(() => import("@/components/3d/MouthModelViewer"));

<Suspense fallback={<Skeleton className="w-full aspect-square rounded-card" />}>
  <MouthModelViewer modelUrl={signedUrl} />
</Suspense>
```

Addresses the landing page bundle size concern documented in CONCERNS.md.

### Pattern 4: Processing Status via Realtime Channel

```typescript
const channel = supabase
  .channel(`scan-status-${scan3dId}`)
  .on("postgres_changes", {
    event: "UPDATE",
    schema: "public",
    table: "three_d_scans",
    filter: `id=eq.${scan3dId}`,
  }, (payload) => {
    if (payload.new.status === "ready") navigate(`/patient/3d-view/${scan3dId}`);
    if (payload.new.status === "error") setProcessingError(true);
  })
  .subscribe();
// cleanup: supabase.removeChannel(channel)
```

### Pattern 5: Raycaster Hit to Annotation

Use `onPointerDown` on the mesh. Guard with an `interactive` prop so the patient viewer never triggers annotation logic.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Uploading All Frames via Promise.all

Saturates the connection pool; one failed upload fails all 60 — same `Promise.all` failure class documented in CONCERNS.md. Use sequential upload loop with `framesUploaded` counter driving the progress ring.

### Anti-Pattern 2: Persisting Signed URLs in the Database

Signed URLs expire. After expiration, `useGLTF` fetches a 403 with no recoverable error path. Store only the raw storage path; generate signed URLs at load time.

### Anti-Pattern 3: Three.js Logic Inside Page Components

`ScanSubmission.tsx` is already flagged in CONCERNS.md as fragile due to 10+ `useState` hooks. Adding Three.js imperative logic into pages compounds this. All Three.js logic belongs in `MouthModelViewer`. Pages only pass props and receive callbacks.

### Anti-Pattern 4: Polling Processing Status with setInterval

Replicates the "timer not cleared on unmount" bug documented in CONCERNS.md. Use Realtime subscription (Pattern 4).

### Anti-Pattern 5: Importing Three.js at Page Level

Defeats code splitting. CONCERNS.md flags bundle size as a bottleneck because `TeethScene.tsx` is not lazy-loaded. All Three.js imports live inside `src/components/3d/`. Pages import only the lazy-wrapped `MouthModelViewer`.

---

## Database Schema Required

### `three_d_scans` table
```sql
id           uuid        primary key default gen_random_uuid()
patient_id   uuid        references patients(id) not null
scan_id      uuid        references scans(id)         -- optional link to 2D scan session
model_url    text                                      -- storage path, NOT a signed URL
status       text        not null default 'uploading'  -- uploading | processing | ready | error
frame_count  integer
created_at   timestamptz default now()
```
RLS: patients read their own rows; doctors read rows for their assigned patients; service role writes.

### `scan_annotations` table
```sql
id           uuid        primary key default gen_random_uuid()
scan_3d_id   uuid        references three_d_scans(id) not null
doctor_id    uuid        references profiles(user_id) not null
position_x   float8      not null
position_y   float8      not null
position_z   float8      not null
note         text        not null
created_at   timestamptz default now()
```
RLS: doctors read and write their own annotations; patients read annotations on their own scans (read-only).

---

## Suggested Build Order

**Step 1: Database + Storage foundation**
Create `three_d_scans` and `scan_annotations` tables with RLS. Create `3d-scans` storage bucket. Extend TypeScript types. Nothing else can be built until the data layer exists.

**Step 2: `process-3d-scan` edge function (stub)**
Accepts `scan_3d_id`, sets status to `"processing"`, uploads static sample GLB, sets status to `"ready"` with model path. Test independently before any UI.

**Step 3: `useThreeDCapture` hook**
Extends `captureFrame()` from `ScanSubmission.tsx`. Manages camera, frame loop, sequential upload, `three_d_scans` insert, edge function invoke, realtime status subscription, cleanup on unmount.

**Step 4: `ThreeDScanCapture` page**
Wires `useThreeDCapture`. Adds sweep overlay, progress ring, status feedback. Adds "3D SCAN" button on patient Home.

**Step 5: `MouthModelViewer` component (base)**
Signed URL loading via `useGLTF`, `OrbitControls`, color overlay wiring, procedural arch fallback. Confirm lazy loading.

**Step 6: `ThreeDViewPatient` page**
Read-only viewer at `/patient/3d-view/:id`.

**Step 7: `useAnnotations` hook + annotation rendering**
Raycaster hit → modal → insert pipeline. Render pins on mesh. Guarded by `interactive` prop.

**Step 8: `ThreeDViewDoctor` page**
Interactive viewer at `/doctor/3d-view/:scanId`. Annotation tools, measurement, screenshot. Add "VIEW 3D MODEL" to `ScanReview.tsx`.

**Step 9: `ThreeDCompare` page**
Dual-panel synced viewer. Built last — depends on `MouthModelViewer` being stable.

---

## Integration with Existing Architecture

| Existing Pattern | How 3D Pipeline Reuses It |
|-----------------|--------------------------|
| `captureFrame()` in `ScanSubmission.tsx` | Copy into `useThreeDCapture`; replace single-shot with loop on interval |
| Sequential upload loop in `ScanSubmission.tsx` | Same structure; change bucket to `3d-scans` |
| `supabase.functions.invoke()` in `ScanSubmission.tsx` | Same invocation pattern; use `process-3d-scan` |
| Dual-panel layout in `ScanCompare.tsx` | Extend for dual `MouthModelViewer`; add camera sync |
| Procedural arch in `TeethScene.tsx` | Reuse as fallback inside `MouthModelViewer` when `modelUrl` is null |
| Realtime subscription in `Chat.tsx` | Same channel setup and `removeChannel()` cleanup pattern |
| `cancelled` flag pattern in hooks | Apply in `useThreeDCapture` for all async operations |

---

*Architecture analysis: 2026-03-10*
