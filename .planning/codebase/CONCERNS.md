# Codebase Concerns

**Analysis Date:** 2026-03-10

## Tech Debt

**Widespread use of `any` type:**
- Issue: 102 instances of `any` type bypassing TypeScript safety throughout codebase
- Files: `src/pages/doctor/ScanReview.tsx`, `src/pages/doctor/Settings.tsx`, `src/pages/doctor/PatientDetail.tsx`, `src/pages/patient/ScanSubmission.tsx`, and 34+ other files
- Impact: Eliminates compile-time type checking, increases runtime errors, makes refactoring unsafe
- Fix approach: Incrementally replace `any` with proper types defined in `src/integrations/supabase/types.ts`, create interfaces for common data shapes

**Type assertions bypassing safety:**
- Issue: 30 instances of `as any`, `as unknown`, and `as const` type assertions
- Files: `src/pages/doctor/Settings.tsx:58` (doctor_availability cast), `src/pages/doctor/PatientDetail.tsx:41` (patient cast), multiple admin pages
- Impact: Defeats TypeScript's type system, hides potential data structure mismatches
- Fix approach: Replace assertions with proper type narrowing and validation

**Inconsistent error logging:**
- Issue: Generic `console.error(e)` in 20+ locations without contextual information
- Files: `src/pages/admin/Billing.tsx`, `src/pages/doctor/ScanReview.tsx`, `src/pages/admin/PracticeDetail.tsx`, `src/pages/patient/Chat.tsx`, and others
- Impact: Unactionable error messages in production, difficult debugging
- Fix approach: Create structured logging utility with context (operation, user, timestamp); replace all generic console.error with context-aware logging

**Unhandled Promise rejections in chained queries:**
- Issue: Multiple Promise.all() chains missing error handling for individual failures
- Files: `src/pages/admin/Overview.tsx:17`, `src/pages/doctor/PatientDetail.tsx:28`, `src/pages/admin/PracticeDetail.tsx:28`, `src/pages/doctor/RecordResponse.tsx:39`
- Impact: If one query fails, entire Promise.all rejects; user sees error even if partial data available
- Fix approach: Add .catch() to individual promises or wrap in Promise.allSettled()

**Implicit undefined handling in state:**
- Issue: 32 instances of useState with empty arrays lacking null checks on access
- Files: `src/pages/doctor/PatientDetail.tsx:42` (reviews state), `src/pages/doctor/Settings.tsx:39` (slots state), `src/pages/admin/Practices.tsx`
- Impact: Potential undefined array access, runtime errors when filtering/mapping
- Fix approach: Use explicit null initialization or add guards before array operations

## Known Bugs

**Race condition in ProtectedRoute suspension check:**
- Symptoms: User can navigate despite suspension if query hasn't returned yet
- Files: `src/components/ProtectedRoute.tsx:15-18`
- Trigger: Suspended user visits route while suspension check is in-flight; checkingSuspension flag doesn't block navigation
- Workaround: The component does return "LOADING" UI but could be bypassed with aggressive navigation
- Fix: Move suspension check into useAuth hook, only allow route access after verification

**Camera stream not properly stopped on component unmount:**
- Symptoms: Media streams may leak if user navigates away during camera initialization
- Files: `src/pages/patient/ScanSubmission.tsx:73-96`, `src/pages/doctor/RecordResponse.tsx:60-78`
- Trigger: Navigate away before camera.play() completes
- Workaround: The cancelled flag prevents state updates but streams may not be stopped
- Fix: Ensure all stream tracks are stopped in cleanup function even if initialization fails

**Unhandled null return from .single() queries:**
- Symptoms: App crashes if .single() query returns no rows
- Files: `src/pages/doctor/PatientDetail.tsx:61`, `src/pages/doctor/Settings.tsx:54`, `src/components/ProtectedRoute.tsx:15` (uses .then without error handling), multiple admin pages
- Trigger: Deleted records, missing foreign key relationships, or data inconsistency
- Workaround: None - will error silently with console.error only
- Fix: Wrap .single() calls with error handling; use defensive null checks

**Timer not cleared in ScanSubmission if component unmounts during recording:**
- Symptoms: Timer continues running in memory after component unmounts
- Files: `src/pages/patient/ScanSubmission.tsx:98-112`
- Trigger: User navigates away mid-scan
- Workaround: Timer will eventually clear itself at 60s limit
- Fix: Add timerStarted check in the useEffect cleanup function

**Impersonation session storage not validated:**
- Symptoms: Admin can impersonate any user; no re-verification on sensitive actions
- Files: `src/components/ImpersonationBanner.tsx`, `src/pages/admin/Practices.tsx:sessionStorage.setItem`, `src/pages/admin/Support.tsx:sessionStorage.setItem`
- Trigger: sessionStorage contents can be manipulated client-side
- Workaround: Logged in audit_impersonation table but not verified server-side
- Fix: Move impersonation state to server-controlled JWT claims; validate on every sensitive action

## Security Considerations

**sessionStorage used for impersonation tracking:**
- Risk: Client-side storage is not tamper-proof; admin could theoretically forge impersonation sessions
- Files: `src/components/ImpersonationBanner.tsx`, `src/pages/admin/Practices.tsx`, `src/pages/admin/Support.tsx`
- Current mitigation: Audit logging to `impersonation_log` table, visible banner showing impersonation
- Recommendations:
  - Move impersonation context to server-controlled session/token
  - Add server-side validation on all admin actions when impersonating
  - Implement rate limiting on impersonation creation

**Suspension check has timing vulnerability:**
- Risk: User auth state updates before suspension is checked; brief window exists to access protected routes
- Files: `src/components/ProtectedRoute.tsx:12-19`
- Current mitigation: Suspension is checked on component mount via Supabase query
- Recommendations:
  - Include suspension status in useAuth hook
  - Return suspension status with session validation
  - Implement server-side route guards for critical operations

**Unvalidated user-submitted field types:**
- Risk: Form inputs cast to types without validation; could cause data corruption
- Files: `src/pages/doctor/PatientDetail.tsx:41`, `src/pages/doctor/Settings.tsx:58` (specialty cast without validation), multiple update operations
- Current mitigation: Database constraints (unverified)
- Recommendations:
  - Add input validation using Zod schema before updates
  - Validate array/object types on retrieval from database
  - Type guard functions for sensitive fields

**Supabase storage upload path traversal risk:**
- Risk: User-controlled file extensions in upload path could access unintended directories
- Files: `src/pages/doctor/Settings.tsx:84-96` (handleLogoUpload uses file.name.split(".").pop())
- Current mitigation: Path includes userId timestamp, extension restricted by content-type header
- Recommendations:
  - Validate/sanitize file extensions against whitelist
  - Use UUIDs instead of user-controlled names
  - Add server-side file type validation in storage policies

## Performance Bottlenecks

**Landing page bundle size:**
- Problem: 986 lines in `src/pages/Landing.tsx` with multiple expensive animations
- Files: `src/pages/Landing.tsx` (986 lines), `src/components/landing/TeethScene.tsx` (238 lines with Three.js)
- Cause: All landing page features bundled without code splitting
- Improvement path: Split into lazy-loaded components; defer Three.js scene until visible; use RequestIdleCallback for animations

**ScanReview page loads unnecessary data:**
- Problem: Fetches full scan objects with all detection data; page can be slow with large scans
- Files: `src/pages/doctor/ScanReview.tsx:52-63`
- Cause: No pagination or field selection optimization in Supabase queries
- Improvement path: Use .select() to fetch only required fields; implement pagination for scan history tab

**PatientDetail makes sequential database queries:**
- Problem: Subscription check made after patient load, causing waterfall request
- Files: `src/pages/doctor/PatientDetail.tsx:28-36`
- Cause: Query depends on patient.assigned_doctor_id from first query
- Improvement path: Make subscription query simultaneously once patient ID known; add caching layer for subscription data

**Chat component re-queries messages on every doctor change:**
- Problem: Full message reload when switching chats despite Supabase realtime subscription
- Files: `src/pages/patient/Chat.tsx:26-61`
- Cause: No pagination; full message history fetched even for month-old conversations
- Improvement path: Implement infinite scroll with pagination; limit initial load to last 50 messages

**Admin Overview page queries 7 separate endpoints:**
- Problem: 7 Promise.all() queries loaded sequentially, causing data stale
- Files: `src/pages/admin/Overview.tsx:15-25`
- Cause: Dashboard aggregates multiple counts and lists without filtering
- Improvement path: Create single Supabase view/RPC function returning aggregated data; implement caching with 5-minute TTL

## Fragile Areas

**useAuth hook has complex state management:**
- Files: `src/hooks/use-auth.ts`
- Why fragile:
  - Multiple state updates triggered by auth state changes and role/profile fetches
  - Race condition possible if user signs out during roleLoading
  - Profile data accessed without null checks downstream
- Safe modification: Ensure all downstream code null-checks role/profile fields; add loading state for profile data specifically
- Test coverage: Minimal - only example.test.ts exists with trivial test

**ProtectedRoute component makes unguarded Supabase call:**
- Files: `src/components/ProtectedRoute.tsx:15-18`
- Why fragile:
  - .then() without .catch() means errors silently fail
  - Suspension check not awaited before route rendering
  - Multiple navigation redirects could race
- Safe modification: Move suspension check to useAuth; ensure all state updates completed before rendering routes
- Test coverage: None

**DoctorChat component missing error boundaries:**
- Files: `src/components/doctor/DoctorChat.tsx`
- Why fragile:
  - File upload error caught with generic console.error
  - Message insertion doesn't validate error state
  - No retry mechanism for failed inserts
- Safe modification: Add error toast for upload failures; implement exponential backoff retry for message inserts
- Test coverage: None

**ScanSubmission state with 10+ useState hooks:**
- Files: `src/pages/patient/ScanSubmission.tsx:57-70`
- Why fragile:
  - Multiple refs (videoRef, streamRef, timerRef) managed manually
  - 70+ lines of camera/timer setup could fail partially
  - No state machine to enforce valid transitions (can't submit until all zones captured)
- Safe modification: Create custom hook for camera management; use useReducer for state transitions
- Test coverage: None

**Settings page makes 5 queries on mount:**
- Files: `src/pages/doctor/Settings.tsx:50-68`
- Why fragile:
  - Unprotected Promise.all() - one failure fails all
  - Specialty dropdown directly sets state without validation
  - Team invites and slots assumed to exist (could be empty/null)
- Safe modification: Add individual error handling; validate team_invites structure; use defensive initialization
- Test coverage: None

## Scaling Limits

**Supabase realtime subscriptions not unsubscribed properly:**
- Current capacity: Assumes single subscription per page instance
- Limit: Unclosed subscriptions accumulate if user navigates frequently; will hit Supabase connection limits
- Scaling path:
  - Implement subscription cleanup in useEffect cleanup functions
  - Create custom useSupabaseSubscription hook with automatic cleanup
  - Monitor connection count in Supabase dashboard

**Message pagination missing:**
- Current capacity: Full message history loaded into state array
- Limit: Chat page with 10k+ messages will cause OOM and UI lag
- Scaling path:
  - Implement virtual scrolling with windowed list (react-virtual)
  - Paginate queries to 50 messages per load
  - Add infinite scroll "load older messages" trigger

**No query result caching:**
- Current capacity: Each page load re-fetches identical data (profiles, subscriptions, patient lists)
- Limit: Heavy load on Supabase with duplicate queries; slow page transitions
- Scaling path:
  - Implement @tanstack/react-query (already in dependencies) for query deduplication
  - Cache profiles by user_id with 5-minute TTL
  - Cache subscription data with 10-minute TTL

**Admin dashboards aggregate without filtering:**
- Current capacity: Overview counts all doctors/patients/scans in system
- Limit: Query time increases linearly with database size; dashboard slow at >50k patients
- Scaling path:
  - Add date range filtering to reduce result set
  - Create materialized view in Supabase for monthly aggregates
  - Implement denormalized counts table updated via triggers

**No rate limiting on API functions:**
- Current capacity: Supabase functions (analyze-scan-quality, analyze-scan-teeth, generate-copilot-note) invoked without limits
- Limit: Malicious user could spam functions causing quota overages
- Scaling path:
  - Add client-side debouncing/rate limiting (already done for some operations)
  - Implement server-side rate limiting in Supabase functions
  - Add invoice/cost tracking per tenant

## Dependencies at Risk

**@supabase/supabase-js version 2.97.0:**
- Risk: Multiple breaking changes expected in v3; realtime API surface changed significantly in v2
- Impact: Future upgrade could break subscription and auth implementations
- Migration plan:
  - Pin to current major version until v3 API stabilizes
  - Create Supabase client wrapper to abstract API changes
  - Add integration tests for auth and realtime before upgrading

**No test infrastructure beyond vitest config:**
- Risk: Single example.test.ts with trivial test; no actual coverage
- Impact: Refactoring impossible without breaking changes; cannot confidently upgrade dependencies
- Migration plan:
  - Write tests for auth flow (useAuth, ProtectedRoute)
  - Write tests for Supabase queries with mock client
  - Set up CI to enforce >50% coverage for PRs

## Missing Critical Features

**No offline support or local caching:**
- Problem: User loses chat/scan data if network drops
- Blocks: Progressive web app functionality, mobile reliability
- Workaround: None - data lost on disconnect

**No error recovery or retry logic:**
- Problem: Failed uploads, crashed queries just error without retry
- Blocks: Reliable file upload, robust API calls
- Workaround: User must manually retry operations

**No analytics or monitoring:**
- Problem: Bugs in production only discovered via user reports
- Blocks: Understanding user behavior, proactive issue detection
- Workaround: Manual log review (if any logging exists)

**No form validation schema:**
- Problem: Forms accept invalid input; no server-side validation
- Blocks: Data consistency, security
- Workaround: Database constraints (if any exist)

## Test Coverage Gaps

**useAuth hook completely untested:**
- What's not tested: Auth state transitions, role loading, profile data loading, sign in/out flows
- Files: `src/hooks/use-auth.ts`
- Risk: Auth changes easily break without detection
- Priority: High

**ProtectedRoute component untested:**
- What's not tested: Route redirection logic, suspension check, role-based routing, onboarding redirect
- Files: `src/components/ProtectedRoute.tsx`
- Risk: Users can access unauthorized routes
- Priority: High

**Supabase query patterns untested:**
- What's not tested: Query success/failure paths, null handling, error recovery
- Files: All page files in src/pages/
- Risk: Database errors cascade to UI errors
- Priority: High

**Camera/MediaRecorder untested:**
- What's not tested: Camera permission flows, stream cleanup, recording state transitions
- Files: `src/pages/patient/ScanSubmission.tsx`, `src/pages/doctor/RecordResponse.tsx`
- Risk: Camera not releasing properly, orphaned streams
- Priority: Medium

**Message/Chat realtime untested:**
- What's not tested: Subscription setup, message arrival, unsubscribe cleanup, duplicate message handling
- Files: `src/pages/patient/Chat.tsx`, `src/components/doctor/DoctorChat.tsx`
- Risk: Message loss, duplicate messages, memory leaks from unclosed subscriptions
- Priority: Medium

**Form submissions untested:**
- What's not tested: Loading states, error toasts, data validation, optimistic updates
- Files: All pages with forms (PatientDetail, Settings, Automations, ScanReview, etc.)
- Risk: Invalid data persisted, user-blocking errors
- Priority: Medium

---

*Concerns audit: 2026-03-10*
