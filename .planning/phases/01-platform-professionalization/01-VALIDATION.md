---
phase: 1
slug: platform-professionalization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 + @testing-library/react 16.0.0 |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | PROF-01 | unit | `npm test -- src/test/camera-cleanup.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 1-01-02 | 01 | 0 | PROF-02 | unit | `npm test -- src/test/supabase-query-safety.test.ts` | ❌ Wave 0 | ⬜ pending |
| 1-01-03 | 01 | 0 | PROF-03 | unit | `npm test -- src/test/promise-resilience.test.ts` | ❌ Wave 0 | ⬜ pending |
| 1-01-04 | 01 | 0 | PROF-04 | unit | `npm test -- src/test/protected-route.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 1-01-05 | 01 | 0 | PROF-05 | unit | `npm test -- src/test/form-validation.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 1-01-06 | 01 | 0 | PROF-06 | unit | `npm test -- src/test/logger.test.ts` | ❌ Wave 0 | ⬜ pending |
| 1-01-07 | 01 | 0 | PROF-07 | unit | `npm test -- src/test/react-query-cache.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 1-01-08 | 01 | 0 | PROF-08 | unit | `npm test -- src/test/submit-lock.test.tsx` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/test/camera-cleanup.test.tsx` — stubs for PROF-01; needs `navigator.mediaDevices` mock
- [ ] `src/test/supabase-query-safety.test.ts` — stubs for PROF-02; mock supabase client returning null
- [ ] `src/test/promise-resilience.test.ts` — stubs for PROF-03; mock one of N promises rejecting, assert partial data renders
- [ ] `src/test/protected-route.test.tsx` — stubs for PROF-04; mock useAuth with suspended=true, assert redirect to suspended UI
- [ ] `src/test/form-validation.test.tsx` — stubs for PROF-05; render forms with invalid inputs, assert error messages and no submission
- [ ] `src/test/logger.test.ts` — stubs for PROF-06; spy on console.error, call logError, assert structured output shape
- [ ] `src/test/react-query-cache.test.tsx` — stubs for PROF-07; assert second render uses cached data without second Supabase call
- [ ] `src/test/submit-lock.test.tsx` — stubs for PROF-08; fire click, assert button disabled during async op, enabled after resolve

*Framework install: None — vitest, @testing-library/react, jsdom, and jest-dom already installed and configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Camera LED turns off when leaving scan/record pages | PROF-01 | Requires physical device camera LED observation | Navigate to /patient/scan, start camera, press Back — verify LED off immediately |
| No double-submit on slow connections | PROF-08 | Requires network throttling simulation | DevTools → Network → Slow 3G → submit form → verify button stays disabled until response |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
