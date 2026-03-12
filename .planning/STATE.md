# Project State: Arcline v1.0

**Milestone:** v1.0
**Last Updated:** 2026-03-12
**Status:** Executing Phase 1 (01-03 complete; 01-01 SUMMARY retroactively created)

---

## Current Position

- **Phase:** 1 — Platform Professionalization
- **Current Plan:** 4 of N
- **Paused At:** Completed 01-02-PLAN.md
- **Last session:** 2026-03-12

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

---

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
- TDD pattern established: test stubs define contracts before implementation; avoid rendering full heavy pages in jsdom (OOM risk)

---

*Initialized: 2026-03-10*
