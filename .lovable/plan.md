## Step 4: Extend `reconstruct-scan-callback` to handle splat webhooks

Replace `supabase/functions/reconstruct-scan-callback/index.ts` in full with the dual-pipeline version provided in the task spec. No other file changes.

### Single file changed

`supabase/functions/reconstruct-scan-callback/index.ts` — full replacement with the code in the task spec.

### Behavior

- **Routing:** `?pipeline=splat` query param wins. Absent → infer by matching `body.id` against `scans.runpod_splat_job_id` first, then `scans.runpod_job_id`. Default to `lingbot` when undetermined (preserves today's behavior).
- **Splat branch** writes only: `splat_url`, `splat_processing_status`, `splat_processing_error`, `splat_reconstructed_at`, `splat_metrics`. Never touches LingBot columns.
- **LingBot branch** writes only: `pointcloud_url`, `processing_status`, `processing_error`, `reconstructed_at`, `lingbot_metrics`. Bit-for-bit identical to today when `?pipeline` is absent and body is LingBot-shaped.
- Status sets, auth gate (`tokenOk || jobMatchOk`), envelope unwrap (`{ ...body.output, ...body }`), `PLY_KEYS` order — all preserved exactly.
- New `SPLAT_KEYS = ["splat_url", "splat_path", "splatPath"]`. Status string remains `"complete"` (CHECK constraint compatibility).

### Schema verification (already confirmed)

All required columns exist on `scans`: `splat_url`, `splat_processing_status`, `splat_processing_error`, `splat_reconstructed_at`, `splat_metrics`, `runpod_splat_job_id`, plus existing LingBot columns. No migration needed.

### Explicit non-changes

- `reconstruct-scan/index.ts` — untouched.
- `reconstruct-splat/index.ts` — untouched.
- All other Edge Functions — untouched.
- `supabase/config.toml` — untouched (`reconstruct-scan-callback` keeps `verify_jwt = false`).
- No migration files. No `src/` edits.

### Deploy + verify

1. Deploy only `reconstruct-scan-callback`.
2. `git diff HEAD~1 --name-only` → exactly one file.
3. `git diff HEAD~1 -- supabase/functions/reconstruct-scan/index.ts supabase/functions/reconstruct-splat/index.ts supabase/config.toml` → empty.
4. `curl -i -X GET .../reconstruct-scan-callback` → HTTP 405.
5. Splat curl with `?pipeline=splat&scan_id=<uuid>` and `output.splat_url` → HTTP 200, body `{ ok: true, pipeline: "splat", status: "complete" }`. Verify scans row: splat_* populated, LingBot columns unchanged.
6. LingBot curl with `?scan_id=<uuid>` and `output.pointcloud_url` → HTTP 200, body `{ ok: true, pipeline: "lingbot", status: "complete" }`. Behaviour identical to today.

### Report back

- ✅ function deployed (or paste error)
- ✅ git diff touches only `reconstruct-scan-callback/index.ts`
- ✅ `reconstruct-scan/index.ts` + `reconstruct-splat/index.ts` byte-unchanged
- ✅ `config.toml` byte-unchanged
- ✅ splat curl returns 200 with `pipeline: "splat"`
- ✅ lingbot curl returns 200 with `pipeline: "lingbot"`
- ✅ scan row after splat curl: splat columns populated, LingBot columns unchanged

> Note for verify step 5/6: I'll need a real `scan_id` (or two) to curl against. Either provide them, or I'll pick test rows from the DB and reset the touched columns afterwards.
