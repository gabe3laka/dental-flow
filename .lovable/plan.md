## Goal
Activate the live RunPod GPU pipeline (endpoint `mvwq1zzz0smpc0`) by adding the two missing secrets, ensuring the callback parser accepts the worker's `ply_path` field, and standardizing the `processing_status` string the UI checks for.

## Audit findings

**Secrets** — Currently missing from the project: `LINGBOT_API_URL`, `LINGBOT_API_TOKEN`. Both are required by `reconstruct-scan/index.ts`; without them it returns `dispatched: false`. (`ARCLINE_BASE_URL` is optional — the function falls back to `SUPABASE_URL`, which is correct for this project, so we will not request it.)

**Edge functions** — `reconstruct-scan` and `reconstruct-scan-callback` are already in the repo and will redeploy automatically on the next deploy.

**`pickPointCloudPath` field coverage** — Current candidate list in `reconstruct-scan-callback/index.ts` covers `pointcloud_url`, `pointcloudUrl`, `point_cloud_url`, `pointCloudPath`, `pointcloud_path`, `path`, plus `outputs.*` and top-level variants. It does **not** include `ply_path` / `plyPath` — needs to be added at both `output.ply_path` and top-level `body.ply_path`.

**`processing_status` audit** — The frontend never checks for the literal `"completed"`. All gating is either:
- presence of `pointcloud_url` (Progress, ScanResults, ScanReview, RecordResponse, ScanCompare), or
- `=== "complete"` / `=== "failed"` / `=== "queued"` / `=== "processing"` (ScanResults, Progress, ScanReview).

So there is no current `complete`/`completed` mismatch in the UI. To be defensive against the RunPod worker (or a future caller) sending `"COMPLETED"` → normalized to `"completed"`, the **callback** will be the single point of normalization: it will always write `processing_status = "complete"` regardless of what RunPod reports. No frontend changes needed.

## Changes

### 1. Add secrets
Request via `secrets--add_secret`:
- `LINGBOT_API_URL` → user pastes `https://api.runpod.ai/v2/mvwq1zzz0smpc0`
- `LINGBOT_API_TOKEN` → user pastes their RunPod API key

### 2. `supabase/functions/reconstruct-scan-callback/index.ts`
Extend `pickPointCloudPath` candidate list to include:
- `output.ply_path`, `output.plyPath`
- `outputs.ply_path`, `outputs.plyPath`
- `body.ply_path`, `body.plyPath`

No other logic change. The function already writes the canonical `processing_status: "complete"` on success, so the UI's `=== "complete"` checks remain valid.

### 3. Deploy both edge functions
Use `supabase--deploy_edge_functions` for `["reconstruct-scan", "reconstruct-scan-callback"]` after secrets are in place.

### 4. Smoke test (verification only, no code change)
- `supabase--curl_edge_functions` POST `/reconstruct-scan-callback?scan_id=<test-uuid>` with bearer `LINGBOT_API_TOKEN` and body `{ "id": "fake", "status": "COMPLETED", "output": { "ply_path": "patient/test.ply" } }` → expect 200 and `processing_status='complete'` row update (or 400 if the test scan id doesn't exist — confirms parsing path).
- Confirm `reconstruct-scan` returns `dispatched: true` once secrets are live (requires a real scan row with `raw_video_url` — optional, the user can validate end-to-end).

## Files touched
- **Edit**: `supabase/functions/reconstruct-scan-callback/index.ts` (one-line addition to candidate list)
- **No frontend changes**

## Out of scope
- Renaming `processing_status` enum values
- Backfilling old rows
- Any UI changes (everything is already wired)
