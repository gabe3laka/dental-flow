# Step 6 — Extend `Scan3DPlusView.tsx` for splat output

Single file changed: `src/pages/patient/Scan3DPlusView.tsx` (full replacement per spec). No new route, no Edge Function changes, no migrations, no other files.

## What the new page does

- Selects from `scans`: `id, pointcloud_url, splat_url, splat_processing_status, splat_processing_error, scan_type`.
- Signs LingBot URL via `usePointCloudUrl(pointcloud_url)` (default bucket `scan-pointclouds`).
- Signs splat URL via `usePointCloudUrl(splat_url, 3600, "scan-splats")`.
- 8s lightweight polling while `splat_processing_status` is `queued`/`processing`; stops on terminal state.

## UI states

| Scan state | Render |
|---|---|
| Both `pointcloud_url` + `splat_url` | shadcn `Tabs` (Point cloud / Gaussian splat). Default tab = splat when `VITE_ENABLE_LINGBOT !== "true"`, else lingbot. |
| Only `pointcloud_url` | Single LingBot `SuperSplatEmbed` panel (filename `pointcloud.ply`). Bit-for-bit unchanged from today. |
| Only `splat_url` | Single splat `SuperSplatEmbed` panel (filename `scene.ply`). |
| `splat_processing_status` in `queued`/`processing`, no URLs yet | "Reconstructing splat…" loader panel; auto-refresh on poll. |
| `splat_processing_status = 'failed'` | Failure panel with `splat_processing_error` text + user-driven **Retry** button that re-invokes `reconstruct-splat`. |
| Nothing at all and not in flight | Existing "No 3D file available yet" empty state. |
| Not found / load error | Existing "Scan not found" empty state. |

## Reuse (untouched)

- `SuperSplatEmbed` — same iframe, only `fileUrl` + `filename` differ per pipeline.
- `usePointCloudUrl` — already accepts a bucket arg; pass `"scan-splats"` for splat.
- `Tabs` from `@/components/ui/tabs`, `toast`, `logError`, `PatientBottomNav`.

## Preserved

- Back button, page header, beta paragraph, MIT attribution footer — all kept in place and order.
- Existing `/patient/scans/:scanId/view-3d-plus` route.
- LingBot-only render path remains identical for legacy rows.

## Flags

- `SPLAT_ENABLED = import.meta.env.VITE_ENABLE_SPLAT !== "false"` (matches Step 5 default-on semantics).
- `LINGBOT_ENABLED = import.meta.env.VITE_ENABLE_LINGBOT === "true"`.
- Used only to pick the default tab when both outputs exist.

## Verification

- `bunx tsc --noEmit -p tsconfig.app.json` and `bun run build` pass.
- `git diff --name-only` shows only `src/pages/patient/Scan3DPlusView.tsx`.
- Fresh Step-5 scan: page shows "Reconstructing splat…" then auto-flips to the SuperSplat iframe once the worker finishes.
- Fixture `3a6e4c67…` (splat-only): single splat view, no Tabs.
- Retry on a failed splat row re-invokes `reconstruct-splat` and flips status back to `processing`.
