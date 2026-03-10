# Arcline

## What This Is

Arcline is a full-stack AI SaaS platform for dental practices that bridges in-office visits and remote patient care. Patients capture intraoral images and video scans via phone; AI analyzes quality and detects issues per-tooth; doctors manage patients, review scans, respond via video, and run automations — all on a HIPAA-compliant infrastructure. This milestone adds 3D oral mapping (photogrammetry-style capture → interactive 3D mesh viewer) and elevates the existing codebase to professional production standards.

## Core Value

Patients get a continuous, guided oral health experience between visits; doctors get a spatial, AI-powered clinical intelligence tool that replaces fragmented manual workflows — all in one platform.

## Requirements

### Validated

- ✓ 5-zone intraoral image capture — existing (`ScanSubmission.tsx`)
- ✓ Video scan capture with separate capture flow — existing (`ScanSubmission.tsx`)
- ✓ AI scan quality analysis — existing (`analyze-scan-quality` edge function)
- ✓ Per-tooth AI detection (plaque, recession, inflammation) — existing (`analyze-scan-teeth` edge function)
- ✓ Doctor scan review with copilot clinical notes — existing (`ScanReview.tsx`, `generate-copilot-note`)
- ✓ Side-by-side scan comparison — existing (`ScanCompare.tsx`)
- ✓ Patient-doctor real-time messaging — existing (`Chat.tsx`, `DoctorChat.tsx`)
- ✓ Doctor video responses to patients — existing (`RecordResponse.tsx`, `VideoResponse.tsx`)
- ✓ Patient progress tracking with streak and percentage — existing (`Progress.tsx`, `use-patient-data.ts`)
- ✓ Practice analytics dashboard — existing (`Analytics.tsx`)
- ✓ Workflow automations (reminders, triggers) — existing (`Automations.tsx`, `run-automations`)
- ✓ Team management with invite flow — existing (`Settings.tsx`, `accept-team-invite`)
- ✓ Stripe billing and portal — existing (`create-billing-portal`)
- ✓ Virtual consult booking — existing (`Consults.tsx`)
- ✓ Admin dashboard (practices, patients, billing, support) — existing (`admin/` pages)
- ✓ RBAC with 3 roles (admin, doctor, patient) — existing (`ProtectedRoute.tsx`, `user_roles`)
- ✓ Doctor onboarding / practice setup flow — existing (`PracticeSetup.tsx`)
- ✓ Patient onboarding flow — existing (`Onboarding.tsx`)
- ✓ AI patient summary generation — existing (`generate-patient-summary`)

### Active

**3D Oral Mapping — New Feature:**
- [ ] Patient guided 3D capture flow with animated sweep overlay (`/patient/3d-scan`)
- [ ] Frame extraction from video stream (30-60 frames) with progress ring
- [ ] Upload frames to `3d-scans` Supabase storage bucket
- [ ] Edge function stub for 3D reconstruction (returns sample mesh; real API wired later)
- [ ] Patient 3D model preview with orbit controls (`/patient/3d-view/:id`)
- [ ] Doctor interactive 3D viewer with orbit/pan/zoom (`/doctor/3d-view/:scanId`)
- [ ] Annotation pins on 3D model (click tooth → add clinical note, stored in `scan_annotations`)
- [ ] Point-to-point measurement tool on 3D mesh
- [ ] Side-by-side comparison of two 3D scans with synced rotation
- [ ] Screenshot/export button on doctor viewer
- [ ] Extended `TeethScene.tsx` / new `MouthModelViewer.tsx` loading GLB mesh from Supabase Storage
- [ ] Color overlays on mesh (red = attention, green = on track) driven by AI detection data
- [ ] Fallback to procedural arch when no 3D scan exists
- [ ] `three_d_scans` database table (`id`, `patient_id`, `scan_id`, `model_url`, `status`, `frame_count`, `created_at`)
- [ ] `scan_annotations` database table (`id`, `scan_3d_id`, `doctor_id`, `position_x/y/z`, `note`, `created_at`)
- [ ] Navigation integration: "3D SCAN" button on patient Home, "VIEW 3D MODEL" on ScanReview
- [ ] Doctor video review: full video available + AI-extracted key frames displayed side by side

**Platform Professionalization — Elevate existing code:**
- [ ] Fix camera stream not stopped on unmount (`ScanSubmission.tsx`, `RecordResponse.tsx`)
- [ ] Fix timer not cleared on unmount in ScanSubmission
- [ ] Fix unhandled null returns from `.single()` queries across page files
- [ ] Replace `Promise.all()` chains with `Promise.allSettled()` for graceful partial failures
- [ ] Fix race condition in ProtectedRoute suspension check (move to `useAuth`)
- [ ] Replace `any` types with proper interfaces on core data flows (scans, patients, doctors)
- [ ] Add Zod validation schemas to all forms with missing validation
- [ ] Structured error logging utility (context-aware, replaces raw `console.error`)
- [ ] Retry logic for failed file uploads (scan videos, profile photos)
- [ ] Add React Query caching for patient lists, profiles, subscription data
- [ ] Paginate chat message history (limit to 50 messages, load older on scroll)
- [ ] Lazy-load Three.js / Landing page components to reduce initial bundle
- [ ] Unsubscribe Supabase realtime subscriptions on component unmount
- [ ] Core test coverage: `useAuth`, `ProtectedRoute`, Supabase query patterns

### Out of Scope

| Feature | Reason |
|---------|--------|
| Real photogrammetry API integration (Polycam, Meshroom) | TBD/placeholder — reconstruction stubbed in v1; real API wired as separate milestone |
| Mobile native app | Web-first; mobile web optimized but no App Store build |
| Offline support / PWA | High complexity, not blocking launch |
| OAuth / social login | Email/password sufficient for current user base |
| AI scan analysis on video frames (beyond quality) | Existing AI targets image captures; video = full recording sent to doctor |
| Real-time co-annotation on 3D model | Complex collab feature; defer post-launch |

## Context

- **Tech stack**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Supabase (auth + DB + storage + edge functions), Three.js + @react-three/fiber + @react-three/drei (already installed), Stripe
- **Existing 3D foundation**: `TeethScene.tsx` already renders a procedural dental arch using Three.js LatheGeometry + ExtrudeGeometry — extend for mesh loading
- **Existing capture pattern**: `ScanSubmission.tsx` has `captureFrame()` and camera/stream management — extend for 3D frame sequence
- **Existing comparison pattern**: `ScanCompare.tsx` has dual-panel layout — extend for synced 3D cameras
- **Storage**: `scan-videos` bucket exists; add `3d-scans` bucket
- **Status**: Internal/demo only — no live production users yet; safe to refactor and improve
- **Known critical bugs**: Camera stream leak on unmount, timer not cleared, `.single()` null crashes, suspension race condition in ProtectedRoute (all documented in CONCERNS.md)
- **Code quality gaps**: 102 `any` type instances, no test coverage beyond example.test.ts, no React Query caching despite dependency being installed

## Constraints

- **Design**: Keep existing visual design (dark sidebar, Fraunces/DM Sans fonts, color system) — professionalization is code quality, not UI redesign
- **HIPAA**: All 3D scan data must follow same HIPAA-compliant storage pattern as existing scans (Supabase RLS, no external logging of PHI)
- **No real reconstruction API yet**: `process-3d-scan` edge function stubs reconstruction — returns a sample GLB until real API is chosen
- **Tech Stack**: No new major dependencies without strong reason — build on installed @react-three/fiber, @react-three/drei, React Query, Zod

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stub reconstruction API in v1 | API not yet chosen; build full pipeline infra first, swap in real API later | — Pending |
| Use GLB/glTF as 3D mesh format | Standard Three.js loader support, efficient binary format, works with Supabase Storage | — Pending |
| Extend TeethScene.tsx rather than replace | Existing procedural arch used on landing page; new MouthModelViewer.tsx handles uploaded meshes | — Pending |
| Promise.allSettled over Promise.all for data fetching | Partial data is better than no data; prevents one failed query from breaking entire page | — Pending |
| Move suspension check into useAuth | Eliminates race condition; single source of truth for auth state | — Pending |

---
*Last updated: 2026-03-10 after initialization*
