## Goal
Stop the SuperSplat pipeline entirely so only the LingBot (point cloud) flow runs on new scans. Pure frontend dispatch gate — no edge-function or schema changes.

## Change

**File:** `src/pages/patient/ScanSubmission.tsx`

1. Line 35: flip `const SPLAT_ENABLED = true;` → `const SPLAT_ENABLED = false;`
2. Line 389: when `SPLAT_ENABLED` is false, write `splat_processing_status: null` on insert (already the behavior of the existing ternary — no edit needed once the flag flips).
3. The existing `if (SPLAT_ENABLED) { … }` block at line 442 will naturally skip the `reconstruct-splat` invoke and log the "skipping" warning.
4. Line 476 toast already reads `(LINGBOT_ENABLED || SPLAT_ENABLED)` — still true via lingbot, no edit needed.

## Result

- New scans dispatch **only** `reconstruct-scan` (LingBot) + `analyze-scan-quality` + `analyze-scan-teeth`.
- `scans.splat_processing_status` stays `NULL` on insert, so the 3D PLUS tab in `ScanResults` will sit in its idle/empty state instead of showing a "queued / processing" spinner.
- No RunPod gsplat job is enqueued, no `SPLAT_API_URL` call is made.
- LingBot flow and its green-dot readiness indicator on the 3D MAP tab are untouched.

## Out of scope
- Not deleting the `reconstruct-splat` edge function (kept for future re-enable + retry button in `SplatTabPanel`).
- Not changing `SuperSplatEmbed`, `SplatTabPanel`, or the splat polling — they simply have nothing to render until a manual retry.

To re-enable later: flip the single constant back to `true`.