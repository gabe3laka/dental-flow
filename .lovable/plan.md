## AI Visual Guide (beta) — additive feature

Goal: ship a NEW tab next to the existing Gaussian-splat tab in `ScanResults.tsx` that lets a patient compose a 6-cell mouth reference board (photos or video frames), dispatch it asynchronously to World Labs (+ FAL), poll for completion, and render the returned generative scene with the EXISTING `SuperSplatEmbed` (or `<Gltf/>` fallback). Zero changes to LingBot / splat code paths.

### Step 1 — Frontend shell (engine-agnostic)

Files created:
- `src/components/scanning/AiVisualGuidePanel.tsx` — mirrors `SplatTabPanel.tsx` structure: 8s polling, disclaimer banner, state machine `draft → reference_board_created → generating_scene → render_ready | failed`. Renders: capture/upload UI, reference-board preview, viewer (SuperSplatEmbed for `.spz/.ply/.splat` via `usePointCloudUrl(path, 3600, "generated-scenes")`; `<Gltf/>` for `.glb`), action buttons (Build / Regenerate / Retry / Save to record), confidence legend, verbatim disclaimer.
- `src/lib/scanning/referenceBoard.ts` — composes a 2×3 canvas (LEFT | FRONT | RIGHT / UPPER | BITE | LOWER), per-cell labels + sharp/ok/missing dot, variance-of-Laplacian sharpness pick, video frame sampling (~12 frames via `currentTime` seeks), uploads `board.png` to `scan-reference-boards/{patient_id}/{scan_id}/`.
- `src/components/scanning/ReferenceBoardEditor.tsx` — thumbnail grid, per-item remove, manual cell assignment, "Use frames from this scan" when `zones_captured` non-empty.

Files modified:
- `src/pages/patient/ScanResults.tsx` — in the existing 3D Plus tab area, add a SECOND tab "AI Visual Guide (beta)" after the splat tab. The splat tab/panel stays byte-for-byte identical.

Deps added if missing: `@react-three/fiber@^8.18`, `@react-three/drei@^9.122.0`, `three`.

### Step 2 — Backend (async, correct architecture)

Migration (additive only, NO drops, NO changes to existing columns):
```sql
ALTER TABLE scans
  ADD COLUMN IF NOT EXISTS generation_engine text,
  ADD COLUMN IF NOT EXISTS generation_status text,
  ADD COLUMN IF NOT EXISTS reference_board_url text,
  ADD COLUMN IF NOT EXISTS generative_scene_url text,
  ADD COLUMN IF NOT EXISTS generative_glb_url text,
  ADD COLUMN IF NOT EXISTS generative_assets jsonb,
  ADD COLUMN IF NOT EXISTS generation_error text,
  ADD COLUMN IF NOT EXISTS generation_job_id text,
  ADD COLUMN IF NOT EXISTS generation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS generative_saved_to_record boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS scans_generation_status_idx
  ON scans (generation_status) WHERE generation_status IS NOT NULL;
```
New PRIVATE buckets with RLS policies mirroring `scan-splats` exactly (service-role writes; patient reads own `{patient_id}/...` folder; doctor/admin read via `is_assigned_doctor` / `has_role`):
- `scan-reference-boards`
- `generated-scenes`
- `generated-assets`

Then regenerate `src/integrations/supabase/types.ts`.

Edge Functions created:
- `supabase/functions/generate-visual-guide/index.ts` (`verify_jwt = true`) — auth model copied from `reconstruct-splat`: anon-key client for RLS-checked scan select, service-role client for trusted writes. Validates input, signs reference board, sets `generation_status='generating_scene' / generation_started_at=now() / generation_engine='worldlabs_fal'`, POSTs the signed board to World Labs (URL from `WORLDLABS_API_URL` secret — clearly commented `// TODO: confirm against World Labs API docs (user-provided)`), stores returned job id in `generation_job_id`, returns 200 immediately. If `WORLDLABS_API_KEY` / `WORLDLABS_API_URL` missing → set `generation_status='failed'`, `generation_error='WORLDLABS not configured'`, return 200 (no throw) — mirrors `reconstruct-splat`'s graceful no-op.
- `supabase/functions/visual-guide-poll/index.ts` (`verify_jwt = false`) — selects scans where `generation_status='generating_scene' AND generation_job_id IS NOT NULL`, polls World Labs job status, on completion downloads `.spz` (+ optional `.glb`) and uploads to `generated-scenes/{patient_id}/{scan_id}/scene.spz` and `generated-assets/...`, sets `generative_scene_url / generative_glb_url / generation_status='render_ready'`. On failure/timeout → `generation_status='failed' + generation_error`. ONLY touches new `generative_*` columns.

`supabase/config.toml` — append (do not modify existing entries):
```
[functions.generate-visual-guide]
verify_jwt = true

[functions.visual-guide-poll]
verify_jwt = false
```

Cron registration (insert tool, not migration — contains project-specific keys): `pg_cron` schedule every 1 min calling `visual-guide-poll` via `net.http_post` (pattern identical to `purge-old-scan-videos`).

### Secrets required (added via `add_secret`)

- `WORLDLABS_API_KEY` — World Labs auth (server-side only).
- `WORLDLABS_API_URL` — World Labs base URL (no hardcoded guesses; the user pastes the real one).
- `FAL_API_KEY` — FAL auth (for any FAL-side compositing/refinement step).

### Hard-constraint compliance checklist

- Additive only: no edits to `SplatTabPanel.tsx`, `SuperSplatEmbed.tsx`, `Scan3DPlusView.tsx`, `reconstruct-scan`, `reconstruct-splat`, `reconstruct-scan-callback`, or any existing scans column.
- Existing splat tab/panel stays exactly as-is — only an additional tab is appended.
- No World Labs / FAL endpoint URLs invented; the actual HTTP call site is a clearly-commented placeholder driven by `WORLDLABS_API_URL` secret.
- Generation is asynchronous: dispatch returns immediately, cron-driven poller finalizes.
- Disclaimer string used verbatim: `AI-generated visual guide based on captured mouth images. Not a medical scan.`

### Manual setup the user must do after merge

1. Add secrets `WORLDLABS_API_KEY`, `WORLDLABS_API_URL`, `FAL_API_KEY` when prompted.
2. Paste the actual World Labs request payload/response shape into the two TODO blocks in `generate-visual-guide/index.ts` and `visual-guide-poll/index.ts`.
3. Confirm the cron job appears in Supabase (it's installed automatically by the SQL we run).
