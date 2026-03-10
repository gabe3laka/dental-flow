# Project Research Summary

**Project:** Arcline — 3D Oral Mapping Milestone
**Domain:** Dental SaaS — AI-assisted intraoral scanning, 3D oral mapping, remote care
**Researched:** 2026-03-10
**Confidence:** HIGH

## Executive Summary

Arcline is a dental SaaS platform extending an existing React 18 + Three.js + Supabase codebase with a complete 3D oral mapping pipeline: guided multi-frame phone capture, cloud storage, edge-function-triggered reconstruction, and an interactive 3D viewer with clinical annotation, AI color overlays, and scan comparison. The recommended implementation approach is a strict "no new production npm installs" vertical slice that reuses every capability already in the codebase — native canvas frame extraction (already demonstrated in ScanSubmission.tsx), useGLTF/OrbitControls/Html/Line from the installed @react-three/drei package, and Supabase Storage/Realtime/Edge Functions already wired in the app. The new pipeline adds two Supabase tables (three_d_scans, scan_annotations), one new storage bucket, one edge function stub, and a set of new React components that follow patterns already established in the codebase.

The recommended build sequence is strictly dependency-ordered: database schema and storage bucket first (nothing else can proceed without this), then the edge function stub that drives the processing state machine, then the capture hook and page, then the shared MouthModelViewer component, and finally the patient viewer, doctor viewer, and comparison views in that order. Photogrammetry reconstruction is explicitly stubbed for this milestone using a static sample GLB — no external API is integrated — which is both the correct architectural choice for avoiding vendor lock-in and the correct HIPAA-compliance choice, since no photogrammetry vendor has been BAA-evaluated.

The highest-risk area is not the 3D rendering itself (patterns are well-understood and the stack already supports them) but the existing codebase's accumulated fragility: 20+ instances of the .single() crash pattern, 102 any-type usages, an orphaned camera stream bug in ScanSubmission.tsx, and a missing Supabase Realtime cleanup in Chat.tsx. The 3D milestone provides the forcing function to address these systematically. A dedicated professionalization phase to fix existing bugs before layering new features on top is strongly recommended — building 3D capture on top of a buggy ScanSubmission.tsx will multiply the existing failures.

## Key Findings

### Recommended Stack

The entire 3D feature set is buildable from the already-installed stack. No new production npm packages are required. The one non-npm step is copying the Draco decoder from the three.js package into the public directory for compressed GLB support. The only optional devDependency that may be useful is @react-three/gltfjsx if converting the procedural arch to a baked GLB.

**Core technologies:**
- Three.js 0.160.1 + @react-three/fiber 8.18.0: 3D rendering engine — already installed, powers all viewer, annotation, and measurement features
- @react-three/drei 9.122.0: utility layer — useGLTF (model loading with caching), OrbitControls (viewer navigation), Html (3D-anchored annotation pins), Line (measurement visualization) all already installed
- Supabase 2.97.0: backend platform — Storage for frame and GLB uploads, Edge Functions for reconstruction trigger, Realtime for processing status subscription, all at the same version already in use
- Native browser canvas API: frame extraction from video stream — no library needed, pattern already demonstrated in ScanSubmission.tsx
- TanStack React Query 5.83.0: server state — drives annotation and scan data with appropriate stale times per query type
- Draco decoder (from Three.js package, not npm): GLB compression — copy from node_modules/three/examples/jsm/libs/draco/ to public/draco/

### Expected Features

See FEATURES.md for full tables. Summary of what matters for roadmap sequencing:

**Must have (table stakes):**
- Guided sweep animation with zone progress during capture — without this, patients produce unusable frames
- Real-time quality feedback per zone during capture — industry standard; silent failure causes abandonment
- Camera permission handling with explicit error on deny — silent failure = 100% abandonment
- Orbit/pan/zoom with touch support on the 3D viewer — absolute baseline for any 3D viewer
- Click-to-annotate on mesh surface with spatial pin placement — the core clinical value proposition
- Annotation persistence across sessions — annotations that disappear destroy trust
- Side-by-side 3D scan comparison with synced rotation — extends the existing ScanCompare.tsx pattern
- Scan status badges and loading/error states on all async operations — clinical tools that feel broken are abandoned
- Camera stream correctly stopped on component unmount — the existing bug is a known trust-destroyer

**Should have (competitive differentiators):**
- AI color overlay on 3D mesh (risk heat map) mapping analyze-scan-teeth findings to mesh regions
- Point-to-point measurement (mm-level) between two raycasted points
- Screenshot/export button from the 3D viewer
- Patient-facing read-only 3D model viewer
- Doctor notification via Supabase Realtime when patient submits a scan
- Unreviewed scan queue/inbox for doctors

**Defer to v2+:**
- Real photogrammetry API integration (Luma AI, Polycam, Meshroom) — vendor evaluation + BAA required
- Temporal 3D comparison with ICP mesh alignment — very high complexity, post-launch milestone
- Real-time collaborative annotation — CRDT/OT cost far exceeds v1 value
- DICOM import/export — EHR interoperability is a separate business milestone
- Offline/PWA support — HIPAA surface area unjustified at this stage

### Architecture Approach

The 3D pipeline is a vertical slice with four bounded areas layered on the existing SPA: Capture (useThreeDCapture hook + ThreeDScanCapture page), Upload+Trigger (sequential frame upload loop + process-3d-scan edge function invocation), Process+Store (edge function stub + three_d_scans table status state machine), and Viewer (shared MouthModelViewer consumed by three pages). The only net-new architectural concept is Supabase Realtime subscription for processing status — every other pattern has a direct precedent in the existing codebase. MouthModelViewer is a single shared component consumed by ThreeDViewPatient (read-only), ThreeDViewDoctor (interactive, with annotation and measurement), and ThreeDCompare (dual-panel with synced cameras). All Three.js logic is encapsulated inside components under src/components/3d/; pages hold no Three.js refs or imports directly.

**Major components:**
1. `useThreeDCapture` hook — camera lifecycle, frame extraction loop, sequential upload, three_d_scans insert, edge function invocation, Realtime status subscription, cleanup on unmount
2. `ThreeDScanCapture` page — guided multi-zone sweep UI, progress ring, status feedback, wires useThreeDCapture
3. `process-3d-scan` edge function — receives scan_3d_id, sets status "processing", uploads static sample GLB, sets status "ready" with model path
4. `MouthModelViewer` component — signed-URL GLB loading via useGLTF, OrbitControls, color overlay wiring, Html annotation pins, measurement line rendering, screenshot export, procedural arch fallback
5. `useAnnotations` hook — loads/persists scan_annotations rows; consumed by MouthModelViewer in doctor mode
6. `ThreeDViewPatient` page — read-only viewer at /patient/3d-view/:id
7. `ThreeDViewDoctor` page — interactive viewer at /doctor/3d-view/:scanId with annotations, measurement, screenshot; linked from ScanReview.tsx
8. `ThreeDCompare` page — dual-panel synced viewer extending ScanCompare.tsx pattern

**Key database additions:**
- `three_d_scans`: id, patient_id, scan_id (optional), model_url (storage path only, never signed URL), status enum, frame_count, created_at — with RLS
- `scan_annotations`: id, scan_3d_id, doctor_id, position_x/y/z, note, created_at — with RLS
- `3d-scans` storage bucket: private visibility, 50MB max file size, same RLS pattern as scan-videos

### Critical Pitfalls

1. **Orphaned MediaStream on unmount** — the existing ScanSubmission.tsx camera stream bug must be fixed before new capture code is written; apply the cancelled-flag + cleanup pattern to useThreeDCapture from the start. Affects all capture pages.

2. **Signed URLs stored in the database** — store only the raw storage path in three_d_scans.model_url; generate signed URLs at load time on the client. Signed URLs expire; storing them causes silent 403 failures with no recovery path.

3. **WebGL context exhaustion** — browsers allow 8–16 simultaneous WebGL contexts. ThreeDCompare (2 canvases) is the maximum allowed simultaneously. All Canvas components must be lazy-loaded and unmounted when not visible. Use static PNG screenshots as scan history thumbnails, never live canvases.

4. **Three.js geometry/material memory leaks** — GPU memory is not garbage collected by JavaScript. MouthModelViewer must call useGLTF.clear(modelUrl) and traverse/dispose all meshes in the useEffect cleanup function from day one.

5. **.single() crashes on missing rows** — the existing codebase has 20+ instances of this bug. All new 3D pages must use .maybeSingle() with explicit null handling. A systematic sweep of existing .single() calls is part of the professionalization scope.

6. **PHI routed to non-BAA photogrammetry APIs** — the v1 stub reconstruction avoids this entirely. Before any real photogrammetry API is integrated in a future milestone, a BAA must be verified and data residency confirmed. This is a HIPAA hard stop.

7. **Three.js state in React state** — camera rotation, orbit deltas, and raycaster data must live in useRef or Three.js objects, never useState. Per-frame React state updates at 60fps cause severe performance degradation.

## Implications for Roadmap

Based on combined research, the following phase structure is recommended. The order is strictly dependency-driven: each phase unblocks the next.

### Phase 1: Codebase Professionalization

**Rationale:** The existing codebase has documented fragility (CONCERNS.md) that will compound new 3D features if not addressed first. Specifically: orphaned camera stream in ScanSubmission.tsx and RecordResponse.tsx, 20+ .single() crash patterns, Promise.all failure chains in PatientDetail.tsx and admin/Overview.tsx, and missing Realtime cleanup in Chat.tsx. Building new features on unfixed foundations multiplies bugs.
**Delivers:** A stable, professionally behaving application before any new user-facing features are added. Eliminates the most visible trust-destroying bugs (camera LED stays on, white screens on missing data, duplicate submissions).
**Addresses:** Camera stream leak (Pitfall 1), .single() crashes (Pitfall 6), Promise.all failures (Pitfall 12), loading lock on submits (Pitfall 13).
**Key fixes:** Apply cancelled-flag pattern to all async hooks with camera/stream, replace .single() with .maybeSingle() across all existing queries, replace Promise.all with Promise.allSettled for independent fetches, add isSubmitting guards to all submit buttons, fix Supabase channel cleanup in Chat.tsx.

### Phase 2: Database and Storage Foundation

**Rationale:** Nothing in the 3D pipeline can be built without the data layer. Schema decisions made here are load-bearing for all subsequent phases — specifically the convention of storing storage paths (not signed URLs) in three_d_scans.model_url, and RLS policies that are HIPAA-correct from day one.
**Delivers:** three_d_scans table, scan_annotations table, 3d-scans storage bucket, TypeScript interfaces for all new types, Supabase RLS policies validated with a second user account.
**Avoids:** Signed URL in DB anti-pattern (Pitfall 7), missing RLS on scan_annotations (Pitfall 9), any type spreading into new interfaces (Pitfall 10).
**Must include:** unique constraint on (patient_id, created_at) in three_d_scans as duplicate-submit safety net.

### Phase 3: Edge Function + Reconstruction Stub

**Rationale:** The process-3d-scan edge function defines the processing status contract that the capture hook and viewer both depend on. It must be independently testable before any UI is wired to it.
**Delivers:** process-3d-scan edge function that accepts scan_3d_id, writes status "processing", uploads static sample GLB to storage, writes model_url and status "ready". Status state machine: uploading → processing → ready | error.
**Uses:** Supabase service-role client (write access), existing edge function invocation pattern from ScanSubmission.tsx.
**Avoids:** PHI to non-BAA API (Pitfall 8) — stub is the correct HIPAA-safe choice for this milestone.

### Phase 4: 3D Capture Flow

**Rationale:** This is the entry point of the entire 3D pipeline. The capture hook orchestrates camera, frames, upload, edge function trigger, and Realtime status subscription. The capture page wraps it with guided UX. Both are built together since the page is thin without the hook.
**Delivers:** useThreeDCapture hook (camera lifecycle, 30–60 frame extraction at ~2fps, sequential upload loop with per-frame retry, three_d_scans insert, edge function invoke, Realtime status subscription with cleanup), ThreeDScanCapture page (guided sweep overlay, zone progress ring, status feedback), "3D SCAN" entry point on patient Home.
**Uses:** Native canvas API (captureFrame pattern from ScanSubmission.tsx), sequential upload loop (same structure as ScanSubmission.tsx, bucket changed to 3d-scans), Supabase Realtime subscription (same channel setup as Chat.tsx), HTTPS deployment enforced before staging.
**Avoids:** Promise.all for frame upload (Pitfall 5 — use sequential with retry), polling with setInterval for status (Pitfall 4 — use Realtime), no submit lock (Pitfall 13), getUserMedia on HTTP (Pitfall 2).

### Phase 5: MouthModelViewer (Shared 3D Component)

**Rationale:** MouthModelViewer is consumed by three different pages. It must be stable before any viewer page is built. Lazy loading must be established from the start to avoid the bundle size regression documented in CONCERNS.md.
**Delivers:** MouthModelViewer component (lazy-loaded via React.lazy, signed URL loading via useGLTF, OrbitControls with damping, procedural arch fallback when modelUrl is null, color overlay from detectionData prop, screenshot export via gl.domElement.toBlob(), geometry/material disposal on unmount), Draco decoder setup (copy from three package to public/draco/).
**Uses:** useGLTF, OrbitControls, Html, Line from @react-three/drei (all already installed), useThree/useFrame from @react-three/fiber for imperative Three.js access.
**Avoids:** Three.js state in React state (Pitfall 11 — use useRef/useFrame), geometry memory leaks (Pitfall 4 — disposal in useEffect cleanup), WebGL context exhaustion (Pitfall 3 — lazy load + unmount when not visible), Three.js imports at page level (Anti-Pattern 5).

### Phase 6: Patient-Facing 3D Viewer

**Rationale:** The patient viewer is the simplest consumer of MouthModelViewer (read-only, no annotations). Ship this before the more complex doctor viewer to validate the signed URL flow and loading/error states end-to-end.
**Delivers:** ThreeDViewPatient page at /patient/3d-view/:id (read-only orbit viewer, loading skeleton, error fallback to procedural arch + message), scan history entry type added to ScanHistory.tsx.
**Uses:** MouthModelViewer with interactive=false, .maybeSingle() for three_d_scans query, Promise.allSettled for data loading.
**Addresses:** "Your mouth in 3D" patient differentiator, progress metric tied to scans.

### Phase 7: Doctor Interactive Viewer + Annotations

**Rationale:** The doctor viewer adds annotation tools, measurement, and screenshot on top of MouthModelViewer. The useAnnotations hook and annotation rendering are built here. This phase also wires the "VIEW 3D MODEL" CTA into ScanReview.tsx and implements doctor notification for new scans.
**Delivers:** useAnnotations hook (load/persist scan_annotations, optimistic append), ThreeDViewDoctor page at /doctor/3d-view/:scanId (interactive viewer, click-to-annotate flow with note modal, annotation list panel, useMeasurement hook for point-to-point distance, screenshot export, AI color overlay from detection data), "VIEW 3D MODEL" CTA in ScanReview.tsx, Supabase Realtime notification when patient submits scan, unreviewed scan queue/inbox.
**Uses:** onPointerDown mesh events (R3F native), Html pins (drei), scan_annotations table, THREE.Vector3.distanceTo() for measurement, React Query with staleTime:0 for scan status queries (Pitfall 14).
**Avoids:** Annotation state in React state vs useRef confusion (Pitfall 11), stale clinical data from React Query caching (Pitfall 14).

### Phase 8: 3D Scan Comparison View

**Rationale:** ThreeDCompare depends on MouthModelViewer being stable and extends the existing ScanCompare.tsx dual-panel pattern. Built last to avoid compounding instability from earlier components into the most complex view.
**Delivers:** ThreeDCompare page at /doctor/3d-compare (dual-panel layout, two MouthModelViewer instances with synced camera rotation via onCameraChange callback + imperative OrbitControls handle, visual change indicator between scans).
**Uses:** Shared camera state via ref (no zustand needed), existing dual-panel layout from ScanCompare.tsx.
**Avoids:** Exceeding 2 simultaneous WebGL contexts (Pitfall 3 — ThreeDCompare is the maximum).

### Phase Ordering Rationale

- Phase 1 (Professionalization) precedes all feature work because the existing bug surface area will compound any new feature built on top of it.
- Phase 2 (Database) is a hard prerequisite for all other phases — schema decisions made here affect Phases 3–8.
- Phase 3 (Edge Function) precedes capture UI because the capture hook depends on the processing status contract being defined and independently testable.
- Phase 5 (MouthModelViewer) precedes all viewer pages because three pages share it — instability here cascades into all viewers.
- Phase 6 (Patient Viewer) before Phase 7 (Doctor Viewer) — simpler consumer validates the signed URL flow before the more complex interactive viewer adds annotation complexity on top.
- Phase 8 (Comparison) last — most complex view, depends on MouthModelViewer stability.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 7 (Doctor Viewer — AI Color Overlay):** The color overlay implementation depends on the photogrammetry output mesh structure (named nodes vs continuous mesh). This cannot be finalized until a sample GLB from the stub is analyzed. Plan to inspect the static sample GLB node structure before writing overlay code.
- **Phase 8 (3D Comparison — Visual Change Indicator):** The "high" complexity visual change indicator (mesh diff / color overlay showing changed regions between scans) may require ICP mesh alignment if scans are not consistently oriented. This may need to be scoped down to a simpler side-by-side view without automated diff for the initial comparison phase.

Phases with well-documented patterns (skip research-phase):
- **Phase 2 (Database Foundation):** Standard Supabase RLS + storage patterns, fully documented and already implemented for scan-videos in the codebase.
- **Phase 3 (Edge Function Stub):** Straightforward Supabase Edge Function; pattern is identical to existing analyze-scan-teeth and process-scan functions.
- **Phase 5 (MouthModelViewer Base):** useGLTF + OrbitControls + Html are fully documented in @react-three/drei and well-established patterns. No novel integration required.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommended technologies are already installed at known working versions. No speculative new dependencies. Draco copy step is documented in Three.js. |
| Features | HIGH | Feature landscape drawn from direct analysis of competitors (Medit, iTero, 3Shape, Dental Monitoring) plus the existing PROJECT.md scope. Anti-feature list is explicit and reasoned. |
| Architecture | HIGH | Architecture is grounded in direct codebase analysis — every pattern references an existing file (ScanSubmission.tsx, Chat.tsx, ScanCompare.tsx, TeethScene.tsx). The build order maps directly to component dependencies. |
| Pitfalls | HIGH | All critical pitfalls are either already documented in CONCERNS.md (confirming they are real, not hypothetical) or are standard Three.js/WebGL gotchas with established mitigations. |

**Overall confidence:** HIGH

### Gaps to Address

- **Photogrammetry mesh structure unknown:** The color overlay implementation (per-node material swap vs vertex colors) depends on whether the photogrammetry output GLB uses named nodes or a continuous mesh. The stub returns a static sample GLB — its node structure must be inspected before overlay code is written in Phase 7. If the real photogrammetry vendor uses a different structure, overlay code may need revision.

- **Photogrammetry vendor selection unresolved:** Luma AI is the most promising direction per the research, but HIPAA BAA availability, dental use case suitability, and API terms have not been verified. This is intentionally deferred — the stub approach in this milestone is correct. A separate vendor evaluation milestone is needed before real reconstruction can ship.

- **Color overlay unit scale unknown:** Three.js world units from the photogrammetry output may differ from the procedural arch's coordinate system. The measurement feature (mm-level distance) depends on knowing the scale factor between world units and real millimeters. This needs to be established when the first real GLB is loaded.

- **Mobile touch performance:** Pinch-zoom and drag-orbit on mobile devices for the 3D viewer has not been tested with the existing Three.js setup. OrbitControls supports touch events, but performance on mid-range Android devices with a dental GLB at 5–25MB (compressed) is unknown. Flag for early performance testing.

## Sources

### Primary (HIGH confidence)
- Existing codebase (ScanSubmission.tsx, Chat.tsx, ScanCompare.tsx, TeethScene.tsx, CONCERNS.md, PROJECT.md) — architecture patterns, existing bugs, established conventions
- @react-three/drei 9.x documentation — useGLTF, OrbitControls, Html, Line API surface
- @react-three/fiber 8.x documentation — native event system, useThree, useFrame
- Supabase documentation (Storage, Realtime, Edge Functions) — bucket config, RLS patterns, signed URL behavior, channel cleanup

### Secondary (MEDIUM confidence)
- Competitive analysis of Medit, iTero, 3Shape, Dental Monitoring, Curve Dental, Dentrix Ascend — feature expectations and professional signals (training data cutoff August 2025)
- Three.js documentation — BufferGeometry disposal, MeshStandardMaterial vertexColors, Vector3.distanceTo

### Tertiary (LOW confidence)
- Luma AI photogrammetry API — commercial viability, BAA availability, dental use case suitability all unverified; flagged as requiring evaluation before any integration
- Polycam, Meshroom, Nerfstudio — reconstruction quality and self-hosting requirements noted but not evaluated for HIPAA compliance or dental suitability

---
*Research completed: 2026-03-10*
*Ready for roadmap: yes*
