---
phase: 01-platform-professionalization
plan: "05b"
type: execute
wave: 3
depends_on: [01-05, 01-02, 01-03]
files_modified:
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
autonomous: true
requirements: [PROF-02, PROF-06]

must_haves:
  truths:
    - "No page crashes with a white screen when a database row is missing — every SELECT query that could return 0 rows now handles null gracefully with a toast and an early return"
    - "All errors surfaced in the browser console include operation context, user context, and timestamp — no raw console.error calls remain in any of the 15 affected page files"
  artifacts:
    - path: "src/pages/doctor/ScanReview.tsx"
      provides: "3 maybeSingle conversions at lines 56, 61, 78; line 166 INSERT left as .single()"
      contains: "maybeSingle"
    - path: "src/pages/doctor/Settings.tsx"
      provides: "2 maybeSingle conversions at lines 54, 55; line 127 INSERT left as .single()"
      contains: "maybeSingle"
    - path: "src/pages/doctor/ScanCompare.tsx"
      provides: "4 maybeSingle conversions at lines 23, 24, 31, 32"
      contains: "maybeSingle"
  key_links:
    - from: "all 15 modified files"
      to: "src/lib/logger.ts"
      via: "import { logError } from '@/lib/logger'"
      pattern: "logError"
    - from: "src/pages/doctor/RecordResponse.tsx"
      to: "profiles + patients tables"
      via: "maybeSingle + null guard on lines 36, 40, 45"
      pattern: "maybeSingle"
---

<objective>
Convert all SELECT .single() calls to .maybeSingle() with null guards (PROF-02) and replace all console.error() calls with structured logError() calls (PROF-06) across the 15 page files. Hook files were already handled in 01-05.

Purpose: .single() throws a PostgREST PGRST116 error when 0 rows match, causing white-screen crashes for legitimate missing-data scenarios. This sweep eliminates every remaining crash site across pages.
Output: Zero raw .single() on SELECT queries across all page files; zero raw console.error() calls in the affected files.
</objective>

<execution_context>
@C:/Users/King/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/King/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-platform-professionalization/01-RESEARCH.md
@.planning/phases/01-platform-professionalization/01-05-SUMMARY.md
@.planning/phases/01-platform-professionalization/01-03-SUMMARY.md

<interfaces>
<!-- CRITICAL DISTINCTION — do not confuse these two cases -->

// CONVERT: SELECT that may return 0 rows
const { data } = await supabase.from("patients").select("id").eq("user_id", uid).maybeSingle();
if (!data) { logError("Patient not found", { operation: "ComponentName/action", userId: uid }); return; }

// DO NOT CONVERT: INSERT returning the new row (cannot be null if no error)
const { data } = await supabase.from("scans").insert({...}).select("id").single();
// The INSERT sites to leave alone:
// Automations.tsx:42, Automations.tsx:57
// admin/Settings.tsx:63
// admin/Support.tsx:115
// admin/Practices.tsx:184
// doctor/Settings.tsx:127 (the INSERT .single() — NOT the SELECT .single() on lines 54–55)
// ScanReview.tsx:166

<!-- Null guard pattern — always include logError before the UI fallback -->
if (!data) {
  logError("Expected row missing", { operation: "PatientProfile/loadProfile", userId: user?.id });
  toast({ title: "Data not available", variant: "destructive" });
  return;
}

<!-- logError import line -->
import { logError } from "@/lib/logger";
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Convert SELECT .single() to .maybeSingle() across all 15 page files (PROF-02 + PROF-06 sweep)</name>
  <files>
    src/pages/public/SharedProgress.tsx
    src/pages/public/Consult.tsx
    src/pages/admin/PracticeDetail.tsx
    src/pages/patient/Chat.tsx
    src/pages/patient/DoctorProfile.tsx
    src/pages/patient/Profile.tsx
    src/pages/patient/Progress.tsx
    src/pages/patient/ScanSubmission.tsx
    src/pages/patient/VideoResponse.tsx
    src/pages/patient/ScanHistory.tsx
    src/pages/doctor/PatientDetail.tsx
    src/pages/doctor/RecordResponse.tsx
    src/pages/doctor/ScanCompare.tsx
    src/pages/doctor/ScanReview.tsx
    src/pages/doctor/Settings.tsx
  </files>
  <behavior>
    - All 38 SELECT .single() calls across these 15 files converted to .maybeSingle() with null guards
    - All console.error() calls in these files replaced with logError()
    - INSERT .single() calls (ScanReview.tsx:166, Settings.tsx:127) are NOT changed
    - RecordResponse.tsx lines 36, 40, 45 converted (these are SELECT queries — doctor and patient profile lookups)
    - ScanReview.tsx lines 56, 61, 78 converted; line 166 (INSERT) left as .single()
    - Settings.tsx lines 54, 55 converted; line 127 (INSERT) left as .single()
    - Test: supabase-query-safety.test.ts and logger.test.ts pass GREEN
  </behavior>
  <action>
    Process each file in sequence. For each file:

    1. Add `import { logError } from "@/lib/logger";` at the top of the import block if not already present.

    2. For every SELECT .single() call:
       - Change to .maybeSingle()
       - Add null guard immediately after. Choose the appropriate response based on context:
         - Profile/doctor/patient data missing: show toast("Data not available") and return
         - Feature data missing: return early with empty/null state
         - Always call logError before the UI fallback

    3. For every console.error(e) or console.error("message", e) call:
       - Replace with: logError(e, { operation: "FileName/functionName", userId: user?.id });
       - Use the file name and function name as the operation string

    File-specific notes:
    - RecordResponse.tsx lines 36, 40, 45: these are the queries for doctor ID and patient data at the start of the component. Also contains a Promise.all at line 39 — PROF-03 (Plan 01-06) will handle that.
    - ScanCompare.tsx lines 23, 24, 31, 32: four separate single-row lookups for scan comparison data
    - PatientDetail.tsx lines 29, 30, 138, 143: doctor profile + patient record lookups; also contains Promise.all at lines 28 and 142 — PROF-03 (Plan 01-06) handles those
    - SharedProgress.tsx lines 25, 30, 35: public page lookup for shared scan data
    - DoctorProfile.tsx line 42, 51: patient-facing doctor profile lookup; also contains Promise.all at line 46 — PROF-03 (Plan 01-06) handles that

    CRITICAL: When you encounter a Promise.all in any of these files, leave it as Promise.all for now — Plan 01-06 covers PROF-03. Do not attempt both conversions in the same task.

    After completing all files, run a final grep to confirm zero .single() remain on SELECT queries:
    grep -rn "\.single()" src/pages/ | grep -v "\.insert("
    Expected output: empty (no results) except for the known INSERT sites.
  </action>
  <verify>
    <automated>npm test -- src/test/supabase-query-safety.test.ts src/test/logger.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>Zero SELECT .single() calls remain across all 15 modified page files; all null guards are explicit (no silent discards); all console.error() calls in affected files replaced with logError(); INSERT .single() calls untouched; both test files GREEN</done>
</task>

</tasks>

<verification>
npm test -- src/test/supabase-query-safety.test.ts src/test/logger.test.ts

Grep verification (should return empty for SELECT sites):
grep -rn "\.single()" src/pages/ | grep -v "\.insert("

Expected: only INSERT-preceded .single() calls remain (6 total).

npx tsc --noEmit
Expected: no TypeScript errors from null guard additions.
</verification>

<success_criteria>
- All 38 SELECT .single() calls across the 15 page files converted to .maybeSingle()
- 6 INSERT .single() calls untouched
- Every .maybeSingle() call followed by an explicit null guard (if (!data) {...})
- All console.error() calls in affected page files replaced with logError()
- supabase-query-safety.test.ts passes GREEN
- logger.test.ts still GREEN
- Full npm test suite passes
</success_criteria>

<output>
After completion, create .planning/phases/01-platform-professionalization/01-05b-SUMMARY.md
</output>
