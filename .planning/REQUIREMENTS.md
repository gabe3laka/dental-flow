# Requirements: Arcline

**Defined:** 2026-03-10
**Core Value:** Patients get a continuous, guided oral health experience between visits; doctors get a spatial, AI-powered clinical intelligence tool with a marketplace that connects them to new patients — all in one HIPAA-compliant platform.

---

## v1 Requirements

### Professionalization

- [ ] **PROF-01**: Camera stream stops on component unmount in all capture pages (no lingering camera LED)
- [ ] **PROF-02**: All `.single()` DB queries replaced with `.maybeSingle()` with null handling — no white-screen crashes on missing rows
- [ ] **PROF-03**: `Promise.all()` data fetching chains replaced with `Promise.allSettled()` — partial data loads instead of full page errors
- [x] **PROF-04**: Suspension race condition fixed — `useAuth` includes suspension check so users cannot briefly access routes while check is in-flight
- [ ] **PROF-05**: Zod validation schemas added to all forms currently missing them — invalid data cannot be persisted
- [x] **PROF-06**: Structured error logging utility replaces all raw `console.error()` calls — errors include operation context, user context, and timestamp
- [ ] **PROF-07**: React Query caching implemented for patient lists, profiles, and subscription data — faster page transitions, reduced DB load
- [ ] **PROF-08**: All async submit buttons have loading lock (disabled + spinner while in-flight) — double-submit prevented across all forms

### Infrastructure

- [ ] **INFRA-01**: `three_d_scans` table created with columns: `id`, `patient_id`, `scan_id`, `model_url` (storage path), `status` (uploading/processing/ready/error), `frame_count`, `created_at`
- [ ] **INFRA-02**: `three_d_scans` RLS configured — patients read their own rows; doctors read rows for assigned patients; service role writes
- [ ] **INFRA-03**: `scan_annotations` table created with columns: `id`, `scan_3d_id`, `doctor_id`, `position_x`, `position_y`, `position_z`, `note`, `created_at`
- [ ] **INFRA-04**: `scan_annotations` RLS configured — doctors read/write their own annotations; patients read annotations on their own scans (read-only)
- [ ] **INFRA-05**: `3d-scans` Supabase Storage bucket created as private with RLS matching the existing `scan-videos` pattern
- [ ] **INFRA-06**: `process-3d-scan` edge function stub created — accepts `scan_3d_id`, sets status to "processing", uploads a static sample GLB, updates status to "ready" with model storage path
- [ ] **INFRA-07**: TypeScript types extended for `three_d_scans` and `scan_annotations` tables
- [ ] **INFRA-08**: Draco decoder WASM copied from `node_modules/three/examples/jsm/libs/draco/` to `public/draco/` for compressed GLB support

### 3D Capture

- [ ] **CAP3D-01**: Guided capture UI at `/patient/3d-scan` with full-screen camera and animated sweep overlay showing the path from left molar across upper arch, lower arch, to right molar
- [ ] **CAP3D-02**: Zone progress ring showing capture completion percentage as patient sweeps
- [ ] **CAP3D-03**: Frame extraction captures 30-60 JPEG frames from video stream using canvas `drawImage()` loop — extends existing `captureFrame()` pattern from `ScanSubmission.tsx`
- [ ] **CAP3D-04**: Camera permission denied state shows a helpful error message explaining why camera access is needed and how to grant it
- [ ] **CAP3D-05**: `useThreeDCapture` hook encapsulates all camera lifecycle, frame buffer, sequential upload loop, `three_d_scans` row insertion, edge function invocation, and Realtime status subscription — no camera refs in the page component
- [ ] **CAP3D-06**: Sequential frame upload with per-frame retry (max 3 attempts) and incremental progress — upload only completes when all frames confirmed uploaded
- [ ] **CAP3D-07**: Realtime subscription on `three_d_scans` row status — navigates to patient 3D viewer when status becomes "ready", shows error toast if status becomes "error"

### 3D Viewer (Shared)

- [ ] **VIEW3D-01**: `MouthModelViewer` component loads GLB from Supabase signed URL via `useGLTF` (drei) — lazy-loaded in `React.lazy` + `Suspense` with skeleton fallback
- [ ] **VIEW3D-02**: Orbit, pan, and zoom controls via `OrbitControls` (drei) — mouse drag, right-click pan, scroll zoom; touch-enabled for mobile
- [ ] **VIEW3D-03**: View preset buttons (upper occlusal, lower occlusal, left buccal, right buccal, anterior) snap camera to standard dental views
- [ ] **VIEW3D-04**: Procedural arch fallback from `TeethScene.tsx` renders when no 3D model exists yet — no broken/empty canvas
- [ ] **VIEW3D-05**: AI color overlay on mesh — red (`#ef4444`) for teeth with "attention" status, green (`#22c55e`) for "on_track", driven by `analyze-scan-teeth` detection data
- [ ] **VIEW3D-06**: Loading state (skeleton) shown while GLB fetches; error state shown when mesh unavailable with "model not ready" message
- [ ] **VIEW3D-07**: `MouthModelViewer` disposes all Three.js geometry, materials, and textures on unmount — no GPU memory leaks
- [ ] **VIEW3D-08**: `MouthModelViewer` component is shared across patient viewer, doctor viewer, and comparison pages via `interactive` prop

### Annotations (Doctor)

- [ ] **ANNOT-01**: Doctor can click any surface on the 3D mesh to place an annotation pin — raycasting via R3F pointer events provides the world-space `position_x/y/z`
- [ ] **ANNOT-02**: Annotation note modal appears after pin placement — doctor types clinical note and confirms
- [ ] **ANNOT-03**: Annotation pins render as visible markers in 3D space at stored coordinates using `<Html>` (drei) with occlusion
- [ ] **ANNOT-04**: Annotation list panel alongside viewer shows all annotations with note excerpt and creation date — clicking an annotation focuses the camera on it
- [ ] **ANNOT-05**: Annotations persist to `scan_annotations` table and reload correctly on next session
- [ ] **ANNOT-06**: Point-to-point measurement tool — doctor clicks two points on mesh; a line renders between them (`<Line>` from drei) and distance in scene units is displayed

### Doctor 3D

- [ ] **DOC3D-01**: Interactive doctor 3D viewer at `/doctor/3d-view/:scanId` with full annotation tools, measurement tool, and screenshot export
- [ ] **DOC3D-02**: Screenshot / export button downloads a PNG of the current 3D view using `gl.domElement.toBlob()`
- [ ] **DOC3D-03**: "VIEW 3D MODEL" button added to the existing `ScanReview.tsx` page that links to `/doctor/3d-view/:scanId` when a 3D scan exists for the patient
- [ ] **DOC3D-04**: Side-by-side 3D scan comparison at `/doctor/3d-compare` — dual panel with two `MouthModelViewer` instances; rotating one syncs the rotation of the other
- [ ] **DOC3D-05**: Doctor video review page shows both the full video recording and AI-extracted key frames side by side for efficient clinical review

### Patient 3D

- [ ] **PAT3D-01**: Patient read-only 3D viewer at `/patient/3d-view/:id` with orbit controls; annotation and measurement tools hidden (`interactive={false}`)
- [ ] **PAT3D-02**: "3D SCAN" button added to patient Home page alongside the existing "Start Scan" button
- [ ] **PAT3D-03**: Scan history page shows 3D scan entries with status badges (processing / ready / reviewed)

### Marketplace

- [ ] **MKTPL-01**: Public-facing doctor marketplace page (no login required) at `/marketplace` with an interactive map showing doctor/practice locations
- [ ] **MKTPL-02**: Map-based doctor discovery with filter controls: proximity/distance, specialty, availability (has open slots), and ratings
- [ ] **MKTPL-03**: Doctor listing card shows: practice name, photo, specialty, location, average rating, and a "Book" or "Connect" CTA
- [ ] **MKTPL-04**: Doctor public profile page shows: bio, services list with pricing, location with map pin, availability slots, and patient reviews/ratings
- [ ] **MKTPL-05**: Patient can send a connection request to any listed doctor — doctor accepts/declines from their dashboard
- [ ] **MKTPL-06**: Patient can book an appointment with a listed doctor (date/time selection) without starting a full Arcline relationship
- [ ] **MKTPL-07**: When a doctor accepts a connection request, patient is assigned to that doctor in Arcline — full scan + messaging + AI analysis access begins
- [ ] **MKTPL-08**: Doctor listing management — doctors can create and edit their public listing: services offered, pricing per service, practice location, bio, and availability
- [ ] **MKTPL-09**: Patient review and star rating system — logged-in patients can leave a 1-5 star rating and written review for a doctor they have been connected to
- [ ] **MKTPL-10**: Marketplace visible on existing public navigation alongside Features, Blog, Contact

---

## v2 Requirements

### 3D Advanced Features

- **ADV3D-01**: Real photogrammetry API integration (Luma AI or equivalent) — HIPAA BAA required before vendor selection
- **ADV3D-02**: Visual mesh diff overlay between two 3D scans (ICP alignment) — shows bone loss / recession changes over time
- **ADV3D-03**: Real-time co-annotation on 3D model with multiple doctors simultaneously
- **ADV3D-04**: AI-extracted key frames from video scan with automated scoring

### Marketplace Advanced

- **MKTPL-V2-01**: AI-powered doctor recommendation based on patient scan findings (e.g., suggest orthodontist when recession detected)
- **MKTPL-V2-02**: In-marketplace appointment scheduling with calendar sync (Google Calendar, iCal)
- **MKTPL-V2-03**: Verified badge system for practices that complete identity/credential verification
- **MKTPL-V2-04**: Promoted/featured listings for practices on paid tiers

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real photogrammetry API (v1) | Vendor not chosen; BAA unverified; stub is the correct HIPAA-safe v1 approach |
| Temporal 3D mesh diff (ICP alignment) | Very high complexity; requires specialized reconstruction API |
| Offline / PWA support | Service workers + 3D mesh caching + HIPAA PHI = complex compliance surface |
| OAuth / social login | Email/password sufficient; HIPAA audit trail cleaner with direct auth |
| DICOM import/export | EHR integration is a business development milestone |
| Hardware scanner integration (Medit, iTero) | Requires vendor partnerships; phone camera is the v1 input |
| Insurance claims / dental billing | Separate SaaS category; Stripe subscription billing only |
| Mobile native app (iOS/Android) | Web-first; mobile web optimized |
| Multi-language / i18n | Single-locale launch |

---

## Traceability

*To be populated during roadmap creation.*

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROF-01 through PROF-08 | Phase TBD | Pending |
| INFRA-01 through INFRA-08 | Phase TBD | Pending |
| CAP3D-01 through CAP3D-07 | Phase TBD | Pending |
| VIEW3D-01 through VIEW3D-08 | Phase TBD | Pending |
| ANNOT-01 through ANNOT-06 | Phase TBD | Pending |
| DOC3D-01 through DOC3D-05 | Phase TBD | Pending |
| PAT3D-01 through PAT3D-03 | Phase TBD | Pending |
| MKTPL-01 through MKTPL-10 | Phase TBD | Pending |

**Coverage:**
- v1 requirements: 57 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 57 ⚠️

---

*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after initial definition*
