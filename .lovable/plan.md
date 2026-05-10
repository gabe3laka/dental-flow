## Goal
Wire the patient scan flow to a **RunPod Serverless** GPU endpoint that runs LingBot-Map and returns a `.ply` point cloud. Three pieces are involved: database schema, the dispatch Edge Function, and the callback Edge Function.

## Current state (audit)

- The repo already has `supabase/migrations/20260509_lingbot_pipeline.sql` and both edge functions (`reconstruct-scan`, `reconstruct-scan-callback`), **but the migration was never applied to the live database** — `public.scans` is still missing `raw_video_url`, `pointcloud_url`, `processing_status`, `scan_type`, `lingbot_metrics`, etc. So scan submission would currently break.
- The existing `reconstruct-scan` posts to a custom `${LINGBOT_API_URL}/v1/reconstruct` shape. RunPod Serverless expects `POST {LINGBOT_API_URL}/run` with `{ "input": {...} }` and returns `{ id: "<job_id>", status: "IN_QUEUE" }`. Needs to be reshaped.
- The callback already validates a bearer token and writes `pointcloud_url` + `processing_status='complete'`. RunPod's webhook posts a different envelope (`{ id, status, output: {...} }`) so the parser needs to accept that shape.
- `runpod_job_id` column does not exist.
- Required secrets `LINGBOT_API_URL`, `LINGBOT_API_TOKEN`, `ARCLINE_BASE_URL` are not yet set (none in the secrets list).

## Plan

### 1. New migration — bring live DB up to date + add `runpod_job_id`
Create `supabase/migrations/<new-ts>_runpod_pipeline.sql` that:
- Re-runs the same `ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS …` block (scan_type, raw_video_url, pointcloud_url, processing_status, processing_error, reconstructed_at, lingbot_metrics, doctor_review_id) — idempotent.
- Adds `runpod_job_id TEXT` (nullable) + index.
- Adds the `scan_type` and `processing_status` CHECK constraints, `scans_processing_status_idx`, and `scans_patient_submitted_idx`.
- Creates the `scan-pointclouds` storage bucket and its 4 RLS policies (service-role write/update, patients/doctors read, patients delete own).
- Adds the `progress_snapshots` table + its 3 RLS policies.
- Adds `comments` JSONB and `video_duration_ms` to `scan_reviews`.
- Skips the `notify_lingbot_queue` trigger (we dispatch via direct HTTP call from the Edge Function — pg_notify isn't usable for serverless RunPod).
- Backfills `processing_status='complete'` for legacy reviewed/flagged/action_required rows.

### 2. Rewrite `supabase/functions/reconstruct-scan/index.ts` for RunPod
Keep the auth model (verify caller via JWT + RLS, then service-role for trusted ops). Change the dispatch step:
```ts
const res = await fetch(`${LINGBOT_API_URL.replace(/\/$/, "")}/run`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${LINGBOT_API_TOKEN}`,
  },
  body: JSON.stringify({
    input: {
      video_url: signed.signedUrl,
      scan_id,
      scan_type: effectiveType,
      callback_url: `${ARCLINE_BASE}/functions/v1/reconstruct-scan-callback?scan_id=${scan_id}`,
    },
    webhook: `${ARCLINE_BASE}/functions/v1/reconstruct-scan-callback?scan_id=${scan_id}`,
  }),
});
```
- On success, parse `{ id }` and update the row with `processing_status='processing'`, `runpod_job_id=id`.
- On failure, set `processing_status='failed'` + `processing_error`.
- Keep the "skip dispatch if env vars missing" branch so local/dev still works.

### 3. Update `supabase/functions/reconstruct-scan-callback/index.ts` to parse RunPod payloads
- Keep bearer-token auth against `LINGBOT_API_TOKEN`. RunPod's native webhook does not send our token, so accept **either** the bearer token **or** match by `runpod_job_id` from the body — document both modes.
- Extend `pickPointCloudPath` to also look in `body.output.pointcloud_url`, `body.output.pointcloudUrl`, `body.output.point_cloud_url`.
- Treat RunPod statuses: `COMPLETED` → success, `FAILED`/`CANCELLED`/`TIMED_OUT` → failure (case-insensitive). Existing success set already covers `complete/completed/success/done`; just add the RunPod ones.
- Persist `lingbot_metrics` from `body.output.metrics` if present.
- No frontend changes needed — `ScanSubmission`, `Progress`, `ScanResults`, `ScanReview` already read `pointcloud_url` / `processing_status`.

### 4. Secrets
Prompt the user (via `add_secret`) for:
- `LINGBOT_API_URL` — full RunPod endpoint URL like `https://api.runpod.ai/v2/<endpoint_id>` (the function appends `/run`).
- `LINGBOT_API_TOKEN` — RunPod API key (also used as the callback shared secret, when a custom poster is used).
- `ARCLINE_BASE_URL` — `https://qalegwgqtyleuaowvuje.supabase.co` (the Supabase project URL — used to build the callback URL).

### 5. Verification after deploy
- `supabase--curl_edge_functions` → POST `/reconstruct-scan` with a real `scan_id` while logged in as `user@test.com`, expect `{ status: "processing", dispatched: true, runpod_job_id: "..." }`.
- Manually POST a fake RunPod completion to `/reconstruct-scan-callback?scan_id=<id>` with `{ status: "COMPLETED", output: { pointcloud_url: "patient/scan/pointcloud.ply" } }` and bearer token; confirm row updates to `processing_status='complete'`.

## Technical notes
- RunPod async returns `{ id, status: "IN_QUEUE" }` from `/run`; the webhook fires with `{ id, status: "COMPLETED" | "FAILED", output, executionTime, ... }`.
- We do NOT change the `status` enum (`pending|reviewed|flagged|action_required`) — clinical status. The new `processing_status` text column tracks the GPU pipeline separately, which is what the UI already reads.
- No frontend changes; the migration and two edge functions are the entire change.

## Files touched
- **New**: `supabase/migrations/<timestamp>_runpod_pipeline.sql`
- **Edit**: `supabase/functions/reconstruct-scan/index.ts`
- **Edit**: `supabase/functions/reconstruct-scan-callback/index.ts`

## Out of scope
- Spinning up the RunPod endpoint itself (you provide the URL + token).
- Building `progress_snapshots` diffing job.
- Removing the unused `notify_lingbot_queue` trigger from the prior migration file (it's never been applied, so nothing to clean up).
