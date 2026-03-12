---
phase: 01-platform-professionalization
plan: 08
subsystem: data-fetching
tags: [react-query, caching, hooks, supabase]
dependency_graph:
  requires: [01-04, 01-05b, 01-06b]
  provides: [useDoctorPatients, useSubscription, useProfile, react-query-caching]
  affects: [src/pages/doctor/Overview.tsx, src/pages/doctor/PatientDetail.tsx]
tech_stack:
  added: []
  patterns: [useQuery-v5, staleTime-caching, queryKey-namespacing, useEffect-error-logging]
key_files:
  created:
    - src/hooks/use-doctor-patients.ts
    - src/hooks/use-subscription.ts
    - src/hooks/use-profile.ts
  modified:
    - src/pages/doctor/Overview.tsx
    - src/test/react-query-cache.test.tsx
decisions:
  - "PatientDetail BillingTab left as-is: it fetches the assigned doctor's subscription (not the logged-in user's), so useSubscription() does not apply there"
  - "useDoctorPatients select expanded to include all columns Overview.tsx needs (treatment_type, current_stage, total_stages, compliance_streak) rather than using the minimal spec"
  - "Overview.tsx secondary enrichment (profiles, scans, analytics) kept as useEffect triggered by patientRows changes — only the patient list query itself is cached via React Query per PROF-07 scope"
metrics:
  duration_seconds: 197
  completed_date: "2026-03-12"
  tasks_completed: 2
  files_changed: 5
requirements: [PROF-07]
---

# Phase 01 Plan 08: React Query Caching — Summary

React Query caching hooks for patient lists, profiles, and subscription data using useQuery v5 with staleTime deduplication.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Create useDoctorPatients and useSubscription hooks | 8aa81c8 | Done |
| 2 | Create useProfile hook; wire useDoctorPatients into Overview.tsx | a665d79 | Done |

## What Was Built

Three new custom hooks implement the React Query caching layer specified in PROF-07:

**src/hooks/use-doctor-patients.ts** — `useDoctorPatients()` hook using `useQuery` with `queryKey: ['patients', userId]` and `staleTime: 5 * 60 * 1000` (5 minutes). Patient list is fetched once and served from cache on re-navigation within 5 minutes. Errors logged via `logError` in `useEffect` watching `query.error`.

**src/hooks/use-subscription.ts** — `useSubscription()` hook using `useQuery` with `queryKey: ['subscription', userId]` and `staleTime: 10 * 60 * 1000` (10 minutes). Billing page and dashboard badge share one cache entry.

**src/hooks/use-profile.ts** — `useProfile()` hook using `useQuery` with `queryKey: ['profile', userId]` and `staleTime: 10 * 60 * 1000` (10 minutes). Multiple components using the same user's profile share one cache entry.

**src/pages/doctor/Overview.tsx** — Patient list now sourced from `useDoctorPatients()`. The inline `useEffect + useState` for the base patient rows has been replaced by the cached hook. Secondary enrichment queries (profiles, scans, analytics) use `Promise.allSettled` in a `useEffect` that runs when `patientRows` data changes. Loading state uses `isPending` (React Query v5 naming).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Columns] useDoctorPatients select expanded**
- **Found during:** Task 2
- **Issue:** Plan spec listed `id, user_id, total_scans, treatment_category, created_at` but Overview.tsx needs `treatment_type, current_stage, total_stages, compliance_streak`
- **Fix:** Updated `select()` to include all columns consumers need
- **Files modified:** src/hooks/use-doctor-patients.ts
- **Commit:** a665d79

**2. [Scope Boundary] PatientDetail.tsx BillingTab left as-is**
- **Found during:** Task 2
- **Issue:** BillingTab fetches `subscriptions` for the *assigned doctor's* ID (not the logged-in user). `useSubscription()` targets the logged-in user's subscription, making it architecturally incorrect to apply here.
- **Fix:** Left BillingTab using its existing `Promise.allSettled` pattern. `useSubscription` and `useProfile` "where applicable" per plan means: where the logged-in user's own data is needed.
- **Files modified:** none

## Success Criteria Verification

- [x] react-query-cache.test.tsx passes GREEN (5/5 tests)
- [x] useDoctorPatients, useSubscription, useProfile hooks exist with useQuery, correct queryKey, staleTime
- [x] doctor/Overview.tsx uses useDoctorPatients (no inline fetch for patient list)
- [x] src/hooks/use-profile.ts created and exported
- [x] No onSuccess/onError callbacks in any useQuery options (v5 compliant)
- [x] All errors logged via logError in useEffect watching query.error
- [x] Full npm test suite: same pass/fail ratio as before (form-validation pre-existing failure unrelated to this plan)
- [x] npx tsc --noEmit: no TypeScript errors

## Self-Check: PASSED

Files verified:
- FOUND: src/hooks/use-doctor-patients.ts
- FOUND: src/hooks/use-subscription.ts
- FOUND: src/hooks/use-profile.ts
- FOUND: src/pages/doctor/Overview.tsx (imports useDoctorPatients)
- FOUND: src/test/react-query-cache.test.tsx (useProfile importable test GREEN)

Commits verified:
- 8aa81c8: feat(01-08): create useDoctorPatients and useSubscription hooks
- a665d79: feat(01-08): create useProfile hook; wire useDoctorPatients into Overview.tsx
