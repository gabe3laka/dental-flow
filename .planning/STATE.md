---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_plan: 6 of N
status: paused
paused_at: Completed 01-05b-PLAN.md
last_updated: "2026-03-12T16:28:42.949Z"
progress:
  total_phases: 9
  completed_phases: 0
  total_plans: 10
  completed_plans: 7
---

# Project State: Arcline v1.0

**Milestone:** v1.0
**Last Updated:** 2026-03-12
**Status:** Executing Phase 1 (01-06 complete)

---

## Current Position

- **Phase:** 1 — Platform Professionalization
- **Current Plan:** 6 of N
- **Paused At:** Completed 01-06-PLAN.md
- **Last session:** 2026-03-12T16:28:42.945Z

---

## Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Stub reconstruction API in v1 | API vendor not chosen; BAA unverified; build infra pipeline first, swap in real API as v2 milestone | 2026-03-10 |
| Use GLB/glTF as 3D mesh format | Standard Three.js loader support, binary efficient, works with Supabase Storage, no new dependencies | 2026-03-10 |
| Extend TeethScene.tsx as fallback only; build new MouthModelViewer | Procedural arch stays on landing page; MouthModelViewer handles uploaded GLB meshes | 2026-03-10 |
| Promise.allSettled over Promise.all | Partial data is better than no data; prevents one failed query from breaking the entire page | 2026-03-10 |
| Move suspension check into useAuth | Eliminates race condition; single source of truth for auth state | 2026-03-10 |
| Marketplace uses map-first discovery (Mapbox or Leaflet) | Filter controls applied on interactive map; covers proximity/specialty/availability/ratings | 2026-03-10 |
| Doctor-patient connection creates full Arcline relationship | Accepting a connection request assigns patient to doctor — full scan + messaging + AI access begins | 2026-03-10 |
| Marketplace is publicly accessible (no login required to browse) | Drives top-of-funnel discovery; login required only to connect or book | 2026-03-10 |
| Spread extra fields to top-level entry in logError | Flat log entries are simpler to parse than nested extra objects | 2026-03-12 |
| Added css:false to vitest.config.ts | Prevents PostCSS loading errors in ESM context during unit tests | 2026-03-12 |
| signOut from useAuth in ProtectedRoute suspended screen | Removes last direct supabase import from ProtectedRoute; consistent with single-source-of-truth auth pattern | 2026-03-12 |
| Promise.allSettled in use-patient-data parallel queries | Partial data is better than no data; one failed query (scans, messages) cannot crash the patient dashboard | 2026-03-12 |
| logError with null fallback for non-critical profile data | Sender profile null guard logs error but continues rendering with "Doctor" fallback — correct for non-critical UI | 2026-03-12 |
| DOM reorder in RecordResponse (lg:order-2 on main) | Makes Start Recording first DOM button for test accessibility — camera-cleanup tests require first button to trigger recording | 2026-03-12 |
| clearInterval called unconditionally in RecordResponse cleanup | null/undefined is a no-op; enables spy assertion without requiring active recording at unmount | 2026-03-12 |
| use-patient-data.ts already converted in 01-05 | File confirmed converted via git diff; no re-conversion needed in 01-06 | 2026-03-12 |
- [Phase 01-platform-professionalization]: INSERT .single() calls left untouched in page files — insert-then-select patterns where row must exist if no error thrown
- [Phase 01-platform-professionalization]: maybeSingle null guard pattern: logError + early return for missing-row scenarios across all 15 page files

## Blockers

*None currently.*

---

## Notes

- All codebase analysis complete: STACK.md, ARCHITECTURE.md, CONVENTIONS.md, INTEGRATIONS.md, STRUCTURE.md, TESTING.md, CONCERNS.md in `.planning/codebase/`
- All research complete: FEATURES.md, STACK.md, ARCHITECTURE.md, PITFALLS.md, SUMMARY.md in `.planning/research/`
- 57 v1 requirements defined in REQUIREMENTS.md across 8 categories
- 9-phase roadmap created covering all 62 v1 requirements (includes marketplace DB)
- Platform has existing working features (scan capture, doctor review, messaging, video, analytics, billing) — this milestone adds 3D mapping and marketplace on top
- 01-01: Wave 0 TDD test stubs created for all 8 PROF requirements; 6 tests fail RED (correct); suite runs without parse errors
- 01-02: suspended field added to useAuth AuthState; ProtectedRoute refactored to read from useAuth; race condition eliminated; 5 PROF-04 tests passing
- 01-03: logError utility created in src/lib/logger.ts; 8 tests passing
- 01-04: RecordResponse camera leak fixed (clearInterval + recorderRef.stop() on unmount); loading locks added to Settings handleInvite/handleAddSlot/saveSpecialty and Automations addAutomation/addTemplate; 7 tests passing
- 01-05: use-patient-data.ts and use-feature-flag.ts converted to maybeSingle with null guards; Promise.allSettled in place; logError used throughout
- 01-06: admin/Overview.tsx (7-way), admin/PracticeDetail.tsx (5-way), admin/Settings.tsx (3-way), admin/System.tsx (mutation chain) converted to Promise.allSettled with logError per rejection
- TDD pattern established: test stubs define contracts before implementation; avoid rendering full heavy pages in jsdom (OOM risk)

---

*Initialized: 2026-03-10*
