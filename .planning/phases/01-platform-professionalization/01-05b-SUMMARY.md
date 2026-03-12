---
phase: 01-platform-professionalization
plan: "05b"
subsystem: database
tags: [supabase, maybeSingle, logError, null-safety, error-handling]

# Dependency graph
requires:
  - phase: 01-05
    provides: use-patient-data and use-feature-flag hooks already converted; logError utility and test stubs established
  - phase: 01-03
    provides: logError utility in src/lib/logger.ts
provides:
  - Zero SELECT .single() calls remaining in all 15 page files
  - Structured logError() in place of all raw console.error() calls in affected pages
  - Null guards with explicit logError + early return on every maybeSingle() call
affects: [01-06, any page that uses profiles/patients/scans/scan_reviews SELECT queries]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SELECT .maybeSingle() + explicit null guard pattern: if (!data) { logError(...); return; }"
    - "logError(e, { operation: 'ComponentName/functionName', userId: user?.id }) replaces all raw console.error"
    - "INSERT .single() left untouched — cannot return null if no error"

key-files:
  created: []
  modified:
    - src/pages/public/SharedProgress.tsx
    - src/pages/public/Consult.tsx
    - src/pages/admin/PracticeDetail.tsx
    - src/pages/patient/Chat.tsx
    - src/pages/patient/DoctorProfile.tsx
    - src/pages/patient/Profile.tsx
    - src/pages/patient/Progress.tsx
    - src/pages/patient/ScanSubmission.tsx
    - src/pages/patient/VideoResponse.tsx
    - src/pages/patient/ScanHistory.tsx
    - src/pages/doctor/PatientDetail.tsx
    - src/pages/doctor/RecordResponse.tsx
    - src/pages/doctor/ScanCompare.tsx
    - src/pages/doctor/ScanReview.tsx
    - src/pages/doctor/Settings.tsx

key-decisions:
  - "INSERT .single() calls left untouched in ScanReview:171, Settings:143, Progress:127, ScanSubmission:166 — new row inserts cannot return null if no error"
  - "Null guard pattern for profile data uses logError + return (not toast) when data is non-critical; uses logError + throw for critical blocking data (ScanSubmission patient lookup)"
  - "ScanCompare null guards log both scan-not-found cases individually before setting null state — render handles null gracefully via existing 'Scan not found.' fallback text"

patterns-established:
  - "maybeSingle null guard: const { data } = await supabase.from(...).maybeSingle(); if (!data) { logError(...); return; }"
  - "operation string format: 'ComponentName/functionName' (e.g., PatientDetail/loadData, Chat/sendMessage)"

requirements-completed: [PROF-02, PROF-06]

# Metrics
duration: 15min
completed: 2026-03-12
---

# Phase 01 Plan 05b: maybeSingle + logError Sweep Across 15 Page Files Summary

**All SELECT .single() calls across 15 page files converted to .maybeSingle() with explicit null guards and logError; zero raw console.error calls remain in affected files**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-12T20:19:00Z
- **Completed:** 2026-03-12T20:34:00Z
- **Tasks:** 1
- **Files modified:** 15

## Accomplishments
- Converted all SELECT .single() calls to .maybeSingle() in all 15 page files — eliminates PGRST116 white-screen crashes for missing rows
- Added explicit null guards (logError + early return or continue) after every .maybeSingle() call
- Replaced all console.error() calls in affected files with structured logError() containing operation context and userId
- INSERT .single() calls correctly identified and left untouched (ScanReview:171, Settings:143, Progress:127, ScanSubmission:166)
- TypeScript passes clean (npx tsc --noEmit) — all null guard additions type-safe
- supabase-query-safety.test.ts (5 tests) and logger.test.ts (8 tests) remain GREEN

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert SELECT .single() to .maybeSingle() across all 15 page files** - `fd463cd` (feat)

**Plan metadata:** (pending — final docs commit)

## Files Created/Modified
- `src/pages/public/SharedProgress.tsx` - share token + patient + profile queries converted; console.error replaced
- `src/pages/public/Consult.tsx` - doctor profile lookup converted
- `src/pages/admin/PracticeDetail.tsx` - profiles + subscriptions queries converted (inside Promise.allSettled); console.error replaced
- `src/pages/patient/Chat.tsx` - patient + doctor profile lookups converted; 2x console.error replaced
- `src/pages/patient/DoctorProfile.tsx` - patient + doctor profile lookups converted; console.error replaced
- `src/pages/patient/Profile.tsx` - patient + doctor profile lookups converted; null guard stops execution on missing patient
- `src/pages/patient/Progress.tsx` - patient lookup converted; console.error replaced
- `src/pages/patient/ScanSubmission.tsx` - patient lookup converted; INSERT .single() left
- `src/pages/patient/VideoResponse.tsx` - scan_reviews + profiles lookups converted; console.error replaced
- `src/pages/patient/ScanHistory.tsx` - patient lookup converted; console.error replaced
- `src/pages/doctor/PatientDetail.tsx` - BillingTab subscriptions+profiles + main patients+profiles converted (inside Promise.all)
- `src/pages/doctor/RecordResponse.tsx` - scans + patients (inside Promise.all) + profiles converted; console.error replaced
- `src/pages/doctor/ScanCompare.tsx` - 4 queries in two Promise.all blocks converted; console.error replaced
- `src/pages/doctor/ScanReview.tsx` - scans + patients (in Promise.all) + profiles converted; copilot console.error replaced; INSERT .single() left
- `src/pages/doctor/Settings.tsx` - profiles + subscriptions in Promise.all converted; INSERT .single() left

## Decisions Made
- INSERT .single() calls left untouched — these are insert-then-select patterns where the row must exist if no error was thrown
- ScanCompare logs individual null warnings for each missing scan before setting null state — the render layer already handles null gracefully via "Scan not found." fallback
- Profile data null guards use logError + early return (not toast) — non-critical UI data that has fallbacks in the render layer

## Deviations from Plan

**1. [Rule 1 - Bug] PracticeDetail.tsx already converted to Promise.allSettled + logError by linter**
- **Found during:** Task 1 (initial file reads)
- **Issue:** PracticeDetail.tsx had been partially auto-transformed by the dev environment with Promise.allSettled and logError already present, but still used .single() inside
- **Fix:** Converted remaining .single() to .maybeSingle() and replaced remaining console.error
- **Files modified:** src/pages/admin/PracticeDetail.tsx
- **Committed in:** fd463cd (Task 1 commit)

---

**Total deviations:** 1 auto-observed (pre-existing partial conversion handled)
**Impact on plan:** No scope creep. Deviation reduced total work for this file slightly.

## Issues Encountered
None - all 15 files processed successfully in one pass.

## Next Phase Readiness
- All page-level SELECT queries now crash-safe for missing rows
- Plan 01-06 (PROF-03: Promise.allSettled) can proceed on PatientDetail, RecordResponse, DoctorProfile, and ScanCompare which still have Promise.all for concurrent queries
- 6 known INSERT .single() sites remain across the pages directory (correct behavior)

---
*Phase: 01-platform-professionalization*
*Completed: 2026-03-12*
