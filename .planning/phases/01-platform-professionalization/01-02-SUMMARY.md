---
phase: 01-platform-professionalization
plan: 02
subsystem: auth
tags: [react, supabase, hooks, protected-routes, suspension]

# Dependency graph
requires:
  - phase: 01-platform-professionalization/01-01
    provides: useAuth hook, AuthState interface, fetchRoleAndProfile pattern

provides:
  - suspended: boolean | null field on AuthState
  - Atomic auth state fetch (role + profile flags + suspended in one Promise.allSettled call)
  - ProtectedRoute without local Supabase queries or local suspended state
  - Race-condition-free suspension check (no window where suspended user sees route content)

affects:
  - Any component that destructures useAuth() (suspended field now available)
  - ProtectedRoute consumers (behavior unchanged; internals cleaner)
  - Future plans adding auth-state fields (pattern: add to AuthState + fetchRoleAndProfile)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Promise.allSettled with .maybeSingle() for atomic, null-safe auth state fetching
    - Single-source-of-truth auth state: all profile flags fetched in one hook, zero local queries in consumers
    - loadingUI local constant to avoid JSX duplication in multi-guard components

key-files:
  created: []
  modified:
    - src/hooks/use-auth.ts
    - src/components/ProtectedRoute.tsx
    - src/test/protected-route.test.tsx

key-decisions:
  - "Move suspension check into useAuth fetchRoleAndProfile: eliminates one-render-cycle race condition where suspended user could see protected content"
  - "Use signOut from useAuth in suspended screen sign-out button: removes the last supabase direct import from ProtectedRoute"
  - "Guard order: loading -> !user -> suspended===null -> suspended===true -> role routing: ensures no state is shown before all auth flags are resolved"

patterns-established:
  - "Auth flag pattern: add to AuthState interface + initial state + sign-out reset + fetchRoleAndProfile select + setState call"
  - "ProtectedRoute consumer pattern: destructure from useAuth(), never query Supabase directly"

requirements-completed: [PROF-04]

# Metrics
duration: 35min
completed: 2026-03-12
---

# Phase 01 Plan 02: Suspension Race Condition Fix Summary

**Atomic suspension check via useAuth — suspended: boolean | null added to AuthState, ProtectedRoute has zero local Supabase queries and zero local state for suspension**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-03-12T15:26:37Z
- **Completed:** 2026-03-12T19:58:00Z
- **Tasks:** 2 (+ TDD RED commit)
- **Files modified:** 3

## Accomplishments

- Added `suspended: boolean | null` to AuthState interface; initial/sign-out state resets to null
- Extended `fetchRoleAndProfile` to select `profiles.suspended` in the same atomic call alongside onboarding/practice flags
- Upgraded Promise.all to Promise.allSettled and .single() to .maybeSingle() for partial-failure resilience (combines PROF-03 and PROF-04 improvements in useAuth)
- Rewrote ProtectedRoute to read `suspended` from useAuth: removed all local useState, useEffect, and supabase import
- Guard order ensures no brief flash of route content for suspended users
- 5/5 PROF-04 tests pass GREEN

## Task Commits

Each task was committed atomically:

1. **TDD RED: PROF-04 failing tests** - `b7f024b` (test)
2. **Task 1 + 2: useAuth suspended + ProtectedRoute refactor** - `1c227c6` (feat)

_Note: Task 1 and Task 2 implementations committed together because Task 2 depends on Task 1's exported type change._

## Files Created/Modified

- `src/hooks/use-auth.ts` - Added `suspended: boolean | null` to AuthState; extended fetchRoleAndProfile with Promise.allSettled + .maybeSingle() + suspended select
- `src/components/ProtectedRoute.tsx` - Removed local suspended state, useEffect, supabase import; reads suspended from useAuth(); loadingUI extracted to constant
- `src/test/protected-route.test.tsx` - 5 PROF-04 tests: suspended=true/null/false, roleLoading guard, no-user redirect

## Decisions Made

- Used `signOut` from useAuth() in the suspended screen sign-out button, removing the last direct supabase import from ProtectedRoute
- Guard order after `!user` check: `suspended === null` returns loadingUI before the `suspended === true` suspended screen — ensures auth state is fully resolved before routing decisions
- Committed Tasks 1 and 2 together (single feat commit) because ProtectedRoute's TypeScript depends on the updated AuthState type from useAuth

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Replaced supabase.auth.signOut() with signOut from useAuth in suspended screen**
- **Found during:** Task 2 (ProtectedRoute refactor)
- **Issue:** Plan said "remove supabase import" but the suspended screen sign-out button still called supabase.auth.signOut() inline. Keeping the import would violate the must_have "ProtectedRoute has zero local Supabase queries" and leave the plan's stated goal only partially met
- **Fix:** Pulled `signOut` from useAuth() destructure and used it in the button onClick
- **Files modified:** src/components/ProtectedRoute.tsx
- **Verification:** TypeScript compiles clean; tests pass; supabase import confirmed absent from file
- **Committed in:** 1c227c6 (Task 2 commit)

**2. [Rule 3 - Blocking] Corrupt node_modules required clean reinstall**
- **Found during:** TDD RED phase (running tests)
- **Issue:** Pre-existing node_modules had multiple corrupt packages (tailwindcss missing ./defaults, jsdom missing ./generated/EventTarget, sucrase missing dist/index.js, autoprefixer missing ../data/prefixes). npm install had previously failed with ENOTEMPTY errors
- **Fix:** Removed node_modules entirely and ran fresh npm install
- **Files modified:** none (node_modules not tracked)
- **Verification:** All tests ran successfully after clean install
- **Committed in:** n/a (not a code change)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness and to unblock testing. No scope creep.

## Issues Encountered

- Node 22 + vitest jsdom environment has a slow startup (~3-4 seconds per test file, ~214 seconds for a full suite run). This is an environment characteristic, not a code issue. Targeted test file runs are used instead of full suite.

## Next Phase Readiness

- `suspended` field is available on useAuth() for any component that needs to check suspension status
- Pattern for adding future AuthState fields is established: AuthState interface + initial state + sign-out reset + fetchRoleAndProfile select + setState call
- ProtectedRoute is now a clean consumer of useAuth with no direct Supabase access

---
*Phase: 01-platform-professionalization*
*Completed: 2026-03-12*
