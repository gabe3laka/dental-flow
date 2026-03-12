---
phase: 01-platform-professionalization
plan: "06b"
type: execute
wave: 4
depends_on: [01-06, 01-05b]
files_modified:
  - src/pages/admin/Practices.tsx
  - src/pages/admin/Patients.tsx
  - src/pages/admin/Support.tsx
  - src/pages/doctor/Overview.tsx
  - src/pages/doctor/PatientDetail.tsx
  - src/pages/doctor/RecordResponse.tsx
  - src/pages/doctor/ScanCompare.tsx
  - src/pages/doctor/ScanReview.tsx
  - src/pages/doctor/Settings.tsx
  - src/pages/patient/DoctorProfile.tsx
  - src/pages/public/SharedProgress.tsx
autonomous: true
requirements: [PROF-03]

must_haves:
  truths:
    - "No page crashes when one of its parallel Supabase queries fails — all remaining doctor, patient, and admin pages render with partial data from successful queries"
    - "Rejected parallel queries are logged with logError in all 11 remaining files, not silently swallowed"
    - "Zero Promise.all() calls remain anywhere in src/pages/ or src/hooks/ (excluding use-auth.ts which was already converted)"
  artifacts:
    - path: "src/pages/doctor/Settings.tsx"
      provides: "5-way Promise.allSettled — highest crash-risk conversion in this batch"
      contains: "Promise.allSettled"
    - path: "src/pages/doctor/PatientDetail.tsx"
      provides: "2 Promise.allSettled conversions at lines 28 and 142"
      contains: "Promise.allSettled"
    - path: "src/pages/doctor/ScanCompare.tsx"
      provides: "2 Promise.allSettled conversions at lines 22 and 30"
      contains: "Promise.allSettled"
  key_links:
    - from: "all 11 modified files"
      to: "src/lib/logger.ts"
      via: "logError called for each rejected result in allSettled"
      pattern: "status.*rejected.*logError"
---

<objective>
Replace Promise.all() with Promise.allSettled() and add per-rejection logError calls (PROF-03) in the remaining 11 doctor, patient, and admin pages. The hooks and high-value admin pages were already handled in 01-06.

Purpose: Completes the PROF-03 sweep. After this plan, zero Promise.all() calls remain in pages/ or hooks/.
Output: 11 files converted; grep for Promise.all() in src/pages/ and src/hooks/ returns empty.
</objective>

<execution_context>
@C:/Users/King/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/King/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-platform-professionalization/01-RESEARCH.md
@.planning/phases/01-platform-professionalization/01-06-SUMMARY.md
@.planning/phases/01-platform-professionalization/01-05b-SUMMARY.md

<interfaces>
<!-- Conversion pattern from research (Pattern 3) — same as used in 01-06 -->
// BEFORE:
const [profileRes, subRes] = await Promise.all([queryA, queryB]);

// AFTER:
const [profileResult, subResult] = await Promise.allSettled([queryA, queryB]);
const profile = profileResult.status === "fulfilled" ? profileResult.value.data : null;
const subscription = subResult.status === "fulfilled" ? subResult.value.data : null;

if (profileResult.status === "rejected") {
  logError(profileResult.reason, { operation: "ComponentName/fetchProfile", userId: user?.id });
}

<!-- File + line inventory for this plan (remaining 12 sites across 11 files) -->
// admin/Practices.tsx line 37 (2-way)
// admin/Patients.tsx line 30 (2-way)
// admin/Support.tsx line 27 (3-way)
// doctor/Overview.tsx line 71 (3-way)
// doctor/PatientDetail.tsx lines 28 and 142 (2-way each — two separate sites)
// doctor/RecordResponse.tsx line 39 (2-way) — .maybeSingle() already applied to queries inside by 01-05b
// doctor/ScanCompare.tsx lines 22 and 30 (2-way each — two separate sites)
// doctor/ScanReview.tsx line 60 (2-way)
// doctor/Settings.tsx line 53 (5-way) — highest crash risk
// patient/DoctorProfile.tsx line 46 (2-way)
// public/SharedProgress.tsx line 34 (3-way)

<!-- NOTE: use-auth.ts line 68 — already converted in Plan 02; DO NOT TOUCH -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Convert Promise.all() to Promise.allSettled() — remaining admin, doctor, and patient pages</name>
  <files>
    src/pages/admin/Practices.tsx
    src/pages/admin/Patients.tsx
    src/pages/admin/Support.tsx
    src/pages/doctor/Overview.tsx
    src/pages/doctor/PatientDetail.tsx
    src/pages/doctor/RecordResponse.tsx
    src/pages/doctor/ScanCompare.tsx
    src/pages/doctor/ScanReview.tsx
    src/pages/doctor/Settings.tsx
    src/pages/patient/DoctorProfile.tsx
    src/pages/public/SharedProgress.tsx
  </files>
  <behavior>
    - All 11 files converted from Promise.all to Promise.allSettled
    - doctor/Settings.tsx (5-way) — highest crash risk — now renders with partial data on any single failure
    - PatientDetail.tsx: both sites at lines 28 and 142 converted
    - ScanCompare.tsx: both sites at lines 22 and 30 converted
    - RecordResponse.tsx: site at line 39 converted (note: .maybeSingle() already applied to queries inside by 01-05b)
    - All rejections logged with logError
    - Test: promise-resilience.test.ts GREEN
  </behavior>
  <action>
    Apply the same conversion pattern as 01-06 Task 1 to the remaining 11 files.

    For each file in the list:
    1. Check if logError is imported — add import if not present.
    2. Find the Promise.all() site(s) per line inventory.
    3. Convert to Promise.allSettled() with extraction and rejection logging.
    4. Update downstream code using the old result variable names.

    doctor/Settings.tsx special attention: This is a 5-way parallel query (line 53). The five queries each load a different part of the settings page. After conversion:
    - If any result is rejected, log it and let that section show its empty/default state
    - Do not redirect or throw on partial failure

    doctor/PatientDetail.tsx: Two Promise.all sites (lines 28 and 142 per research). Convert both independently.

    doctor/ScanCompare.tsx: Two Promise.all sites (lines 22 and 30). Convert both.

    After completing all files, run a grep to confirm zero Promise.all remain (except in use-auth.ts which is already allSettled):
    grep -rn "Promise\.all(" src/pages/ src/hooks/ | grep -v "allSettled"
    Expected output: empty (no results).
  </action>
  <verify>
    <automated>npm test -- src/test/promise-resilience.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>All 12 remaining Promise.all sites converted to Promise.allSettled; zero Promise.all remain in pages/ and hooks/ (excluding use-auth.ts already converted); all rejection paths log with logError; promise-resilience.test.ts GREEN; npm test suite passes</done>
</task>

</tasks>

<verification>
npm test -- src/test/promise-resilience.test.ts

Grep confirmation (must return empty):
grep -rn "Promise\.all(" src/pages/ src/hooks/ | grep -v "allSettled"

Expected: empty output (no Promise.all remaining outside use-auth.ts).

npx tsc --noEmit
Expected: no TypeScript errors from allSettled result type changes.
</verification>

<success_criteria>
- All 12 remaining Promise.all() sites converted to Promise.allSettled()
- promise-resilience.test.ts passes GREEN
- Each rejected result calls logError with operation context
- No silent swallowing of errors
- Full npm test suite passes
</success_criteria>

<output>
After completion, create .planning/phases/01-platform-professionalization/01-06b-SUMMARY.md
</output>
