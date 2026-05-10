# RunPod ↔ dental-flow contract audit

Audited the 4 points against the worker's new contract. All 4 already match — **no patches required**.

## 1. `output.pointcloud_url` lookup ✅
`reconstruct-scan-callback/index.ts` → `pickPointCloudPath()` lists `output.pointcloud_url` as the **first** candidate, followed by camelCase / snake_case / `outputs.*` / top-level fallbacks (and we previously added `ply_path`/`plyPath` for safety). The exact field the worker now returns is the primary key.

## 2. `processing_status` consistency ✅
The callback writes the literal `"complete"`. Frontend usages:
- `Progress.tsx` — gates on presence of `pointcloud_url`; only checks `"queued"` / `"processing"` / `"failed"` for status pills.
- `ScanResults.tsx` — `=== "complete"` for the READY pill, presence of `pointcloud_url` to show the viewer.
- `ScanReview.tsx` — presence of `pointcloud_url` to show viewer; `=== "failed"` for the error label.
- `ScanCompare.tsx` — only reads `pointcloud_url`.

No component checks for `"completed"`. Already standardized on `"complete"`.

## 3. `scan_type` in dispatch payload ✅
`reconstruct-scan/index.ts` selects scan type with `const effectiveType: ScanType = (scan.scan_type as ScanType) ?? scan_type ?? "scope";` and sends:
```ts
input: { video_url, scan_id, scan_type: effectiveType, callback_url }
```
Worker can branch on `scan_type === "wand"` for windowed mode.

## 4. Bucket name parity ✅
- Worker uploads to `SUPABASE_BUCKET` → set to `scan-pointclouds`.
- `usePointCloudUrl.ts` defaults `bucket = "scan-pointclouds"`.
- `ScanResults.tsx` deletion path also uses `"scan-pointclouds"`.
- The Supabase project has the `scan-pointclouds` bucket provisioned (private, matching RLS).

All three sides reference the same bucket.

## Recommended next step
Run an end-to-end smoke test: capture/select a real scan → trigger `reconstruct-scan` → wait for the RunPod webhook → verify the row updates to `processing_status='complete'` with a `pointcloud_url` like `{patient_id}/{scan_id}/pointcloud.ply`, and that `PointCloudViewer` renders. If anything fails, pull `supabase--edge_function_logs` for `reconstruct-scan-callback` to see the exact RunPod payload.

## Out of scope
- No file edits — current code already satisfies the contract.
- No DB migration needed.
