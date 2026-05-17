# Add runtime VITE_ENABLE_SPLAT visibility log

## Goal
Print the resolved value of `import.meta.env.VITE_ENABLE_SPLAT` (and `VITE_ENABLE_LINGBOT` for parity) in the browser console at scan-submit time so we can instantly confirm whether the deployed Lovable build actually sees the flag — instead of inferring it from edge-function log silence.

## Change
Single file: `src/pages/patient/ScanSubmission.tsx`.

At the top of the submit handler (before the existing `[scan-dispatch] flags` breadcrumb), add one `console.info` that logs the raw `import.meta.env` values exactly as the bundled build sees them:

```ts
console.info("[scan-dispatch] build-env", {
  VITE_ENABLE_SPLAT_raw: import.meta.env.VITE_ENABLE_SPLAT,
  VITE_ENABLE_LINGBOT_raw: import.meta.env.VITE_ENABLE_LINGBOT,
  SPLAT_ENABLED_resolved: import.meta.env.VITE_ENABLE_SPLAT === "true",
  LINGBOT_ENABLED_resolved: import.meta.env.VITE_ENABLE_LINGBOT === "true",
  MODE: import.meta.env.MODE,
});
```

Why both raw and resolved: the raw value reveals "undefined" (flag not set at build time) vs `"false"` (set but off) vs `"true"`, while the resolved booleans show what the dispatch branches will actually evaluate.

## What this kills
The most common silent failure mode: a build deployed without the env var set, where every dispatch branch quietly no-ops and edge logs stay empty. After this change, one glance at DevTools after submitting a scan tells you exactly which of these is true:
- flag missing → set it in Lovable env vars and redeploy
- flag set to non-"true" string → fix the value
- flag is `"true"` but no edge invocation → upstream client error (the existing `[scan-dispatch] reconstruct-splat threw` breadcrumb catches that)

## Out of scope
No edge function changes, no behavior changes, no UI changes. Pure observability.
