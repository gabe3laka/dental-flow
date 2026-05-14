## Step 3: Create `reconstruct-splat` Edge Function

Mirror `reconstruct-scan` exactly, but dispatch to the splat RunPod endpoint and write only splat-side columns.

### 1. New file: `supabase/functions/reconstruct-splat/index.ts`

Byte-for-byte structural mirror of `reconstruct-scan/index.ts`, with these deltas only:

- Env var: `LINGBOT_API_URL` → `SPLAT_API_URL` (bearer token still `LINGBOT_API_TOKEN`, reused as shared secret).
- Callback URL points to a future `reconstruct-splat-callback` (Step 4 will create it). Keep the path string but do NOT create the callback function in this step.
- `processing` status update writes `splat_processing_status = 'processing'` (not `processing_status`).
- Failure path writes `splat_processing_status = 'failed'` + `splat_processing_error` (not `processing_status`/`processing_error`).
- Success dispatch writes `runpod_splat_job_id` (not `runpod_job_id`).
- Same JWT gating (verify_jwt = true), same RLS-checked scan select via anon-key user client, same service-role client for sign + updates, same RunPod `{ input: {...}, webhook }` body shape.
- Same scan_type handling (`scope` | `wand`, defaulting to `scope`).
- Reuses `scan-videos` bucket + `scans.raw_video_url` for signing — no splat-bucket writes here (worker uploads via service role to `scan-splats`).

Touches no LingBot column: `processing_status`, `processing_error`, `runpod_job_id`, `pointcloud_url`, `reconstructed_at`, `lingbot_metrics` are never written.

### 2. `supabase/config.toml` — append one block

Add at the bottom, mirroring the existing `[functions.reconstruct-scan]` entry:

```toml
[functions.reconstruct-splat]
verify_jwt = true
```

No other lines in `config.toml` are modified.

### 3. Secrets

Add one new Edge Function secret via the secrets tool:

- `SPLAT_API_URL = https://api.runpod.ai/v2/96tqbiq6bfav2p`

Reused (already configured, no action): `LINGBOT_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `ARCLINE_BASE_URL`.

### 4. Deploy + verify

- Deploy only `reconstruct-splat` via `supabase--deploy_edge_functions`.
- Curl unauthenticated: `curl -i -X POST https://qalegwgqtyleuaowvuje.supabase.co/functions/v1/reconstruct-splat -H 'content-type: application/json' -d '{}'` → expect HTTP 401.
- Confirm `git diff` touches exactly two files: the new `index.ts` and `supabase/config.toml`.
- Confirm `supabase/functions/reconstruct-scan/index.ts` is byte-for-byte unchanged (`git diff` empty for that path).

### Explicit non-changes

- No edits to `reconstruct-scan/index.ts`, `reconstruct-scan-callback/index.ts`, or any other Edge Function.
- No migration files.
- No `src/` edits (no `ScanSubmission.tsx`).
- No `VITE_ENABLE_LINGBOT` / `VITE_ENABLE_SPLAT` references.
- No new bearer-token secret.

### Report back

- ✅ function deployed (or error)
- ✅ git diff touches only the two expected files
- ✅ curl returns 401
- ✅ `reconstruct-scan/index.ts` unchanged
