## Goal

Wire the AI Visual Guide edge functions to the real World Labs Marble API. The current code guesses the auth header (`Authorization: Bearer`) and a generic endpoint, which is why we get `401 No API key found`. Marble uses a custom `WLT-Api-Key` header and a specific URL/payload/poll shape.

## Root cause

- `generate-visual-guide` POSTs to `WORLDLABS_API_URL` with `Authorization: Bearer …` (and now an extra `x-api-key`). Marble ignores both — it only accepts `WLT-Api-Key`.
- Payload shape is also wrong: Marble expects `{ display_name, model, world_prompt: { type, image_prompt: { source: "uri", uri } } }`, not a flat `{ mode, reference_board_url }`.
- The polling endpoint and response fields in `visual-guide-poll` are guessed and don't match Marble either.

## Changes

### `supabase/functions/generate-visual-guide/index.ts`
- Replace `WORLDLABS_API_URL` usage with a hardcoded base `https://api.worldlabs.ai/marble/v1` (Marble's API host is stable; the env var was being misused as a full path). Keep `WORLDLABS_API_KEY` as the only required secret.
- Send request to `POST {base}/worlds:generate` with header `WLT-Api-Key: <key>` (drop `Authorization` + `x-api-key`).
- Body:
  ```json
  {
    "display_name": "Dental Visual Guide <scan_id>",
    "model": "marble-1.1",
    "world_prompt": {
      "type": "image",
      "image_prompt": { "source": "uri", "uri": "<signed board url>" },
      "text_prompt": "Dental intra-oral reference board…"
    }
  }
  ```
- Parse `operation_id` from the response and store it in `generation_job_id` (rename intent: this is Marble's operation id, not a generic job id — DB column name stays).

### `supabase/functions/visual-guide-poll/index.ts`
- Same hardcoded base + `WLT-Api-Key` header.
- `GET {base}/operations/{operation_id}`.
- Parse the response per Marble's shape:
  - `done: false` → pending (no DB write).
  - `done: true, error: null` → success. Pull asset URLs from `response.assets`:
    - `response.assets.splats.spz_urls["500k"]` → download → upload to `generated-scenes/{patient_id}/{scan_id}/scene.spz`, save path in `generative_scene_url`.
    - `response.assets.mesh.collider_mesh_url` → download → upload to `generated-assets/{patient_id}/{scan_id}/model.glb`, save path in `generative_glb_url`.
    - Store the whole `response.assets` object in `generative_assets` (already a JSONB column).
    - Set `generation_status = 'render_ready'`.
  - `done: true, error: …` → `generation_status = 'failed'` with the error message.

### `WORLDLABS_API_URL` secret
No longer read by either function. Leave the secret in place (harmless), or the user can delete it later — no code change needed for the secret itself.

## Files NOT changed
- `AiVisualGuidePanel.tsx`, `ScanResults.tsx`, `ScanSubmission.tsx`, `referenceBoard.ts`.
- DB schema, storage buckets, RLS policies.
- All other edge functions.

## Verification
1. Deploy both functions.
2. From the patient AI Guide panel, submit a reference board → `generate-visual-guide` should return 200 with a Marble `operation_id` in `generation_job_id`.
3. Within ~5 min, the cron-driven `visual-guide-poll` should mark the scan `render_ready` and populate `generative_scene_url` / `generative_glb_url`. Tail Edge Function logs to confirm.

## Open question
The `text_prompt` for a dental intra-oral board is a guess; do you want a specific phrasing (e.g. "Photoreal intra-oral dental cavity, six standardized views, soft clinical lighting"), or should I just omit `text_prompt` so Marble auto-captions from the board image?