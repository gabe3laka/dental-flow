# Roadmap: Arcline v1.0

**Milestone:** v1.0 — 3D Oral Mapping + Platform Professionalization + Marketplace
**Created:** 2026-03-10
**Total Phases:** 9

---

## Milestone Goal

Ship Arcline as a professional, production-ready dental AI SaaS with three differentiating capabilities: (1) a platform elevated to production code standards with all critical bugs fixed, (2) a full 3D oral mapping pipeline from guided patient capture to interactive doctor viewer with AI overlays and annotations, and (3) a public doctor marketplace with map-based discovery, service listings, and patient connection flows.

---

## Phase Overview

| Phase | Name | Goal | Requirements |
|-------|------|------|-------------|
| 1 | Platform Professionalization | Fix all critical bugs and elevate code to production standards | PROF-01–08 |
| 2 | 3D Infrastructure | Create all database tables, storage, edge function stub, and type extensions | INFRA-01–08 |
| 3 | 3D Capture Pipeline | Build the patient-facing guided 3D capture flow end-to-end | CAP3D-01–07 |
| 4 | Shared 3D Viewer | Build the reusable `MouthModelViewer` component with all core rendering features | VIEW3D-01–08 |
| 5 | Doctor 3D Experience | Build the full interactive doctor 3D viewer with annotations and measurement | ANNOT-01–06, DOC3D-01–05 |
| 6 | Patient 3D Experience | Wire patient 3D viewer and integrate 3D into patient navigation | PAT3D-01–03 |
| 7 | Marketplace Foundation | Create marketplace database tables, RLS, and doctor listing management | MKTPL-08 + DB |
| 8 | Marketplace Discovery | Build public marketplace page with interactive map, filters, and doctor profiles | MKTPL-01–04, MKTPL-10 |
| 9 | Marketplace Connections | Build patient connection requests, booking, and review/rating system | MKTPL-05–09 |

---

## Phase Details

### Phase 1: Platform Professionalization

**Goal:** Fix all critical production bugs and elevate code quality to professional standards so the platform is reliable, consistent, and trustworthy before new features are added.

**Why first:** Critical bugs (camera leak, null crashes, race conditions) undermine user trust and will be carried into all new features if not fixed now. This phase is the foundation all other phases build on.

**Covers:**
- PROF-01: Camera stream cleanup on unmount (`ScanSubmission.tsx`, `RecordResponse.tsx`)
- PROF-02: `.single()` → `.maybeSingle()` + null handling across all page files
- PROF-03: `Promise.all()` → `Promise.allSettled()` for graceful partial failures
- PROF-04: Suspension race condition fixed in `ProtectedRoute` / `useAuth`
- PROF-05: Zod validation schemas on all forms missing validation
- PROF-06: Structured error logging utility replacing raw `console.error()`
- PROF-07: React Query caching for patient lists, profiles, subscription data
- PROF-08: Loading lock on all async submit buttons (no double-submit)

**Deliverable:** A stable platform where all documented critical bugs are fixed, forms are validated, errors are logged with context, and data fetches are cached and resilient.

**Dependencies:** None — must run first.

**Plans:** 8 plans

Plans:
- [ ] 01-01-PLAN.md — Wave 0: Create all 8 test stub files (RED tests for all PROF requirements)
- [ ] 01-02-PLAN.md — Wave 1: Fix suspension race condition (PROF-04) — move check into useAuth
- [ ] 01-03-PLAN.md — Wave 1: Create structured error logger src/lib/logger.ts (PROF-06)
- [ ] 01-04-PLAN.md — Wave 2: Camera cleanup + async submit loading locks (PROF-01, PROF-08)
- [ ] 01-05-PLAN.md — Wave 2: .single() → .maybeSingle() sweep + console.error → logError (PROF-02, PROF-06)
- [ ] 01-06-PLAN.md — Wave 2: Promise.all → Promise.allSettled sweep (PROF-03)
- [ ] 01-07-PLAN.md — Wave 3: Zod validation schemas on all forms (PROF-05)
- [ ] 01-08-PLAN.md — Wave 3: React Query caching for patient lists, profiles, subscription (PROF-07)

---

### Phase 2: 3D Infrastructure

**Goal:** Establish the complete data layer for 3D scanning — database tables, storage bucket, edge function stub, Draco support, and TypeScript types — so all subsequent 3D phases can build without infrastructure blockers.

**Why second:** Every 3D feature (capture, viewer, annotations, comparison) depends on the database schema and storage bucket. Build the foundation before the UI.

**Covers:**
- INFRA-01: `three_d_scans` table creation
- INFRA-02: `three_d_scans` RLS policies
- INFRA-03: `scan_annotations` table creation
- INFRA-04: `scan_annotations` RLS policies
- INFRA-05: `3d-scans` private storage bucket with RLS
- INFRA-06: `process-3d-scan` edge function stub (returns sample GLB, sets status = ready)
- INFRA-07: TypeScript types extended for new tables
- INFRA-08: Draco WASM decoder copied to `public/draco/`

**Deliverable:** Working database schema with RLS, a functioning edge function stub that returns a testable sample GLB, and complete TypeScript types.

**Dependencies:** Phase 1 (stable codebase to build on)

---

### Phase 3: 3D Capture Pipeline

**Goal:** Build the complete patient-facing guided 3D capture flow — from camera open to frame upload to edge function trigger to real-time status feedback.

**Covers:**
- CAP3D-01: Guided capture UI at `/patient/3d-scan` with animated sweep overlay
- CAP3D-02: Zone progress ring during capture
- CAP3D-03: Frame extraction (30-60 JPEG frames) via canvas `drawImage()` loop
- CAP3D-04: Camera permission denied error state
- CAP3D-05: `useThreeDCapture` hook (camera lifecycle, frame buffer, upload, edge function, realtime)
- CAP3D-06: Sequential upload with per-frame retry (max 3 attempts)
- CAP3D-07: Realtime subscription navigates to viewer on `status = "ready"`

**Deliverable:** Patient can open the 3D scan page, complete a sweep, upload frames, and be automatically navigated to the viewer when processing completes (using stub GLB).

**Dependencies:** Phase 2 (tables, bucket, edge function stub, types)

---

### Phase 4: Shared 3D Viewer Component

**Goal:** Build `MouthModelViewer` — the single reusable Three.js viewer component used by patient viewer, doctor viewer, and comparison pages — with all core rendering features.

**Covers:**
- VIEW3D-01: `MouthModelViewer` with `useGLTF`, lazy loading, `Suspense` skeleton
- VIEW3D-02: Orbit/pan/zoom controls via `OrbitControls` (drei), touch-enabled
- VIEW3D-03: View preset buttons (upper occlusal, lower occlusal, left/right buccal, anterior)
- VIEW3D-04: Procedural arch fallback from `TeethScene.tsx` when no model exists
- VIEW3D-05: AI color overlay on mesh (red = attention, green = on_track)
- VIEW3D-06: Loading skeleton + error state ("model not ready")
- VIEW3D-07: Geometry/material/texture disposal on unmount (no GPU leaks)
- VIEW3D-08: `interactive` prop controls annotation/measurement availability

**Deliverable:** A single `MouthModelViewer` component that loads and renders any GLB from Supabase Storage, falls back to the procedural arch, applies AI color overlays, and cleans up properly — consumable by all three viewer contexts.

**Dependencies:** Phase 2 (types, storage, sample GLB from stub), Phase 3 (confirms capture pipeline works end-to-end so viewer has real data to test with)

---

### Phase 5: Doctor 3D Experience

**Goal:** Build the full interactive doctor 3D viewer with annotation pins, measurement tool, screenshot export, comparison view, and video review panel.

**Covers:**
- ANNOT-01: Click-to-annotate on mesh (raycasting → world-space x/y/z)
- ANNOT-02: Annotation note modal on pin placement
- ANNOT-03: Annotation pins as visible 3D markers (`<Html>` drei with occlusion)
- ANNOT-04: Annotation list panel with camera-focus on click
- ANNOT-05: Annotations persisted to `scan_annotations` and reloaded across sessions
- ANNOT-06: Point-to-point measurement tool (`<Line>` + `Vector3.distanceTo()`)
- DOC3D-01: Interactive doctor viewer at `/doctor/3d-view/:scanId`
- DOC3D-02: Screenshot/export button (`gl.domElement.toBlob()`)
- DOC3D-03: "VIEW 3D MODEL" button on `ScanReview.tsx`
- DOC3D-04: Side-by-side 3D comparison at `/doctor/3d-compare` with synced rotation
- DOC3D-05: Video review page with full video + key frame display side by side

**Deliverable:** Doctors can open any patient's 3D scan, rotate it, click to annotate, measure distances, export a screenshot, and compare two scans side by side. Video scan review shows full recording alongside representative frames.

**Dependencies:** Phase 4 (`MouthModelViewer` stable and reusable)

---

### Phase 6: Patient 3D Experience

**Goal:** Wire the patient-facing 3D viewer, update patient navigation to include 3D scan entry points, and show 3D scan status in scan history.

**Covers:**
- PAT3D-01: Patient read-only 3D viewer at `/patient/3d-view/:id` (`interactive={false}`)
- PAT3D-02: "3D SCAN" button on patient Home page alongside "Start Scan"
- PAT3D-03: Scan history shows 3D scan entries with status badges (processing/ready/reviewed)

**Deliverable:** Patients can trigger a 3D scan from their home screen, view their own 3D mouth model (read-only), and track 3D scan history with status badges.

**Dependencies:** Phase 4 (`MouthModelViewer`), Phase 3 (capture pipeline tested)

---

### Phase 7: Marketplace Foundation

**Goal:** Create the complete database schema for the marketplace — doctor profiles, services, availability, connection requests, appointments, and reviews — and build the doctor listing management interface so doctors can set up their public presence.

**Covers:**
- Marketplace DB tables: `doctor_listings`, `listing_services`, `listing_availability`, `connection_requests`, `appointments`, `doctor_reviews`
- RLS policies on all marketplace tables
- TypeScript types extended for marketplace tables
- MKTPL-08: Doctor listing management UI (create/edit bio, services+pricing, location, availability)

**Deliverable:** Doctors can create and manage their public marketplace listing. All data schema is in place for public discovery and connection flows.

**Dependencies:** Phase 1 (stable auth, error handling), Phase 2 (confirms infra pattern to follow)

---

### Phase 8: Marketplace Discovery

**Goal:** Build the public-facing marketplace with an interactive map, filterable doctor cards, and full doctor profile pages — accessible without login.

**Covers:**
- MKTPL-01: Public `/marketplace` page with interactive map (Mapbox or Leaflet)
- MKTPL-02: Map filter controls (proximity, specialty, availability, ratings)
- MKTPL-03: Doctor listing cards (name, photo, specialty, location, rating, CTA)
- MKTPL-04: Doctor public profile page (bio, services+pricing, map pin, availability, reviews)
- MKTPL-10: Marketplace link added to public navigation

**Deliverable:** Anyone can visit `/marketplace`, see doctors on an interactive map, filter by distance/specialty/availability/rating, and view a full doctor profile — no account required.

**Dependencies:** Phase 7 (doctor listing data exists in DB)

---

### Phase 9: Marketplace Connections

**Goal:** Build the full patient-doctor connection and booking flow, including connection requests, appointment scheduling, and the review/rating system.

**Covers:**
- MKTPL-05: Patient sends connection request → doctor accepts/declines from dashboard
- MKTPL-06: Patient books appointment (date/time selection) without needing full Arcline relationship
- MKTPL-07: On doctor accepting connection → patient assigned to doctor in Arcline (full access)
- MKTPL-09: Logged-in patients can leave 1–5 star rating + written review for connected doctors

**Deliverable:** The full marketplace loop is complete — patients discover doctors, connect or book, and after connecting, the full Arcline remote care relationship is active. Reviewed doctors build visible reputation.

**Dependencies:** Phase 8 (discovery layer in place), Phase 1 (auth + connection request notifications)

---

## Requirement Coverage

| Requirement Set | Phase | Count |
|-----------------|-------|-------|
| PROF-01–08 | Phase 1 | 8 |
| INFRA-01–08 | Phase 2 | 8 |
| CAP3D-01–07 | Phase 3 | 7 |
| VIEW3D-01–08 | Phase 4 | 8 |
| ANNOT-01–06, DOC3D-01–05 | Phase 5 | 11 |
| PAT3D-01–03 | Phase 6 | 3 |
| MKTPL-08 + Marketplace DB | Phase 7 | ~8 |
| MKTPL-01–04, MKTPL-10 | Phase 8 | 5 |
| MKTPL-05–07, MKTPL-09 | Phase 9 | 4 |
| **Total v1** | | **62** |

**Coverage: 100% of v1 requirements mapped.**

---

*Created: 2026-03-10*
*Status: Active — Phase 1 planning complete, ready to execute*
