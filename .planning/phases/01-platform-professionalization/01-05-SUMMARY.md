---
phase: 01-platform-professionalization
plan: 05
subsystem: database
tags: [supabase, maybeSingle, null-guard, logError, error-handling, hooks]

# Dependency graph
requires:
  - phase: 01-03
    provides: "logError utility from src/lib/logger.ts"
provides:
  - "use-patient-data.ts: 3 SELECT .single() converted to .maybeSingle() with null guards"
  - "use-patient-data.ts: Promise.all converted to Promise.allSettled"
  - "use-patient-data.ts: console.error replaced with logError"
  - "use-feature-flag.ts: 1 SELECT .single() converted to .maybeSingle() with null guard + logError"
affects: [01-05b — page sweep can assume hook contracts are safe]

# Tech tracking
tech-stack:
  added: []
  patterns: [maybeSingle null guard, Promise.allSettled for parallel partial failure, structured logError in hooks]

key-files:
  created: []
  modified:
    - src/hooks/use-patient-data.ts
    - src/hooks/use-feature-flag.ts

key-decisions:
  - "All three .single() SELECT sites in use-patient-data.ts converted; no INSERT .single() calls were present so no exceptions needed"
  - "Promise.allSettled replaces Promise.all so one failed parallel query (e.g. scans or messages) cannot prevent patient dashboard from rendering"
  - "logError called with null-guard fallback even when senderProfile is null — continues rendering with 'Doctor' fallback rather than crashing"

patterns-established:
  - "Null guard pattern: if (!data) { logError('Row missing', { operation: '...' }); return fallback; }"
  - "Promise.allSettled unwrap: const val = res.status === 'fulfilled' ? res.value.data : null"

requirements-completed: [PROF-02, PROF-06]

# Metrics
duration: ~6 minutes
completed: 2026-03-12
---

# Phase 01 Plan 05: Hook Safety — maybeSingle + logError Summary

**All SELECT .single() calls converted to .maybeSingle() with null guards in use-patient-data.ts and use-feature-flag.ts; Promise.all replaced with Promise.allSettled; console.error replaced with logError**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-12T16:06:10Z
- **Completed:** 2026-03-12T16:12:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- use-patient-data.ts: 3 SELECT `.single()` sites converted to `.maybeSingle()` (patient row lookup, assigned doctor profile, message sender profile) — no page crash when any row is missing
- use-patient-data.ts: `Promise.all` at line 40 converted to `Promise.allSettled` — partial query failures no longer block the entire patient dashboard
- use-patient-data.ts: `console.error` replaced with `logError` including operation context and userId
- use-feature-flag.ts: 1 `.single()` converted to `.maybeSingle()` with null guard; empty catch replaced with structured `logError`

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert SELECT .single() to .maybeSingle() in hooks** - `dfbfa72` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `src/hooks/use-patient-data.ts` - 3 maybeSingle conversions, Promise.allSettled, null guards, logError import and usage
- `src/hooks/use-feature-flag.ts` - 1 maybeSingle conversion, null guard, logError import and usage

## Decisions Made

- Converted all three SELECT `.single()` sites in use-patient-data.ts with null guards; no INSERT `.single()` calls were present
- `Promise.allSettled` unwrap pattern: `const val = res.status === "fulfilled" ? res.value.data : null` — null coalesces safely downstream
- Sender profile null guard logs `logError` but continues rendering with "Doctor" fallback — correct for non-critical UI data

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

All files confirmed present. Commit dfbfa72 confirmed in git log.

## Issues Encountered

None. TypeScript check passed cleanly. supabase-query-safety.test.ts (5 tests) passed GREEN. Pre-existing failures in camera-cleanup.test.tsx and form-validation.test.tsx were confirmed out of scope for this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both shared hooks now have safe SELECT contracts (maybeSingle + null guard + logError)
- Plan 01-05b (page sweep) can import these hooks with confidence that no row-missing scenario will throw
- Promise.allSettled already in place; 01-06 does not need to touch use-patient-data.ts again for this reason

---
*Phase: 01-platform-professionalization*
*Completed: 2026-03-12*
