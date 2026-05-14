## Change

Single-file edit to `src/pages/patient/ScanSubmission.tsx`: flip the `SPLAT_ENABLED` default to ON so the splat pipeline dispatches unless explicitly disabled, while leaving LingBot strictly opt-in.

## Edit

Replace the comment block + `SPLAT_ENABLED` constant (currently lines ~24–29) with:

```ts
// Build-time feature flag for the splat (gsplat + COLMAP) pipeline.
// Default: ON. To explicitly disable, set VITE_ENABLE_SPLAT="false" in the build env.
// Independent of LINGBOT — both can be on, either alone, or neither.
// When SPLAT_ENABLED is true: dispatch to reconstruct-splat is fired in parallel
// with (and independent of) the lingbot dispatch.
const SPLAT_ENABLED = import.meta.env.VITE_ENABLE_SPLAT !== "false";
```

## Untouched

- `LINGBOT_ENABLED` line and its comment block — byte-identical
- All imports
- The `if (SPLAT_ENABLED) { ... }` dispatch block and surrounding logic
- Insert payload (`splat_processing_status: SPLAT_ENABLED ? "queued" : null`) — semantics shift naturally with the flag default
- Toast description line
- Every other file in the repo

## Verification

- Re-read the file post-patch and diff the two flag lines + comment block
- Rely on the harness build to confirm compilation
