# Step 5 — Parallel splat dispatch in ScanSubmission

Additive, fully gated behind a new `VITE_ENABLE_SPLAT` flag. LingBot path stays byte-for-byte identical when the new flag is unset. Two files change, nothing else.

## Files touched
- `src/pages/patient/ScanSubmission.tsx`
- `.env.example`

No Edge Functions, no migrations, no `supabase/config.toml`, no routes, no other `src/` files.

## Edits in `ScanSubmission.tsx`

1. **Add `SPLAT_ENABLED` flag** immediately after the existing `LINGBOT_ENABLED` declaration (line 22), with a comment explaining independence from LingBot.

2. **Extend `scans` insert (~line 260)** — add `splat_processing_status: SPLAT_ENABLED ? "queued" : null` directly after the existing `processing_status` line. No other fields reordered.

3. **Add parallel splat dispatch** immediately after the closing `}` of the `if (LINGBOT_ENABLED) { … }` block (after line ~290, before the `analyze-scan-quality` invoke). Mirrors the LingBot block exactly: `supabase.functions.invoke("reconstruct-splat", { body: { scan_id, scan_type } })` wrapped in try/catch with `logError({ operation: "ScanSubmission/dispatchSplat", … })`. Non-blocking.

4. **Broaden toast description (line 308)** to `(LINGBOT_ENABLED || SPLAT_ENABLED) ? "Building your 3D map…" : "Analyzing your scan…"`. Title and other fields unchanged.

## Edits in `.env.example`

Append a sibling block after the existing `VITE_ENABLE_LINGBOT` documentation, defining `VITE_ENABLE_SPLAT=false` with the same explanation pattern (default off; flip to `"true"` to enable; insert behavior described).

## Behavior matrix after deploy

| LINGBOT | SPLAT | Dispatches | `processing_status` | `splat_processing_status` | Toast |
|---|---|---|---|---|---|
| off | off | none | null | null | "Analyzing your scan…" |
| on  | off | reconstruct-scan | queued | null | "Building your 3D map…" |
| off | on  | reconstruct-splat | null | queued | "Building your 3D map…" |
| on  | on  | both, in parallel | queued | queued | "Building your 3D map…" |

Both pipelines are independent; their callbacks already route by `?pipeline=splat` (validated in Step 4) and write disjoint column families.

## Guarantees
- Zero changes to the LingBot declaration, dispatch block, or any other insert field.
- `analyze-scan-quality` and `analyze-scan-teeth` continue to fire unconditionally.
- Splat dispatch failures swallowed + logged; never block the user flow.
- No new route, no UI viewer changes (Step 6 will handle `Scan3DPlusView.tsx`).

## Verification after implementation
- `bunx tsc --noEmit -p tsconfig.app.json` and `bun run build` pass.
- `git diff --name-only` shows exactly the two files above.
- Greps for `VITE_ENABLE_LINGBOT|VITE_ENABLE_SPLAT`, both `invoke("reconstruct-…")` calls, and both `processing_status: …_ENABLED` lines all return the expected matches.
