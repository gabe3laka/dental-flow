# Arcline Tech Stack

Authoritative reference for what runs where. Reflects the **actual** repo state as of this commit, not aspirational state.

## Frontend

| Layer | Choice | Notes |
| --- | --- | --- |
| Build | **Vite 5 + SWC React plugin** | This repo is **not** Next.js. Vite-only SPA. |
| Language | **TypeScript** (`strict: false`, `strictNullChecks: false`) | Loose by design, see `tsconfig.json`. Don't tighten without a coordinated migration. |
| UI | **React 18 + shadcn/ui (Radix primitives) + Tailwind** | Component primitives in `src/components/ui/`. |
| Routing | React Router v6 | App-level routing only; no SSR. |
| State / data | **TanStack Query** for server state; React Context for auth/session | No global store (Zustand/Redux/etc.) — keep it that way. |
| Forms | `react-hook-form` + `@hookform/resolvers` | Zod schemas in feature folders. |
| 3D — point clouds & per-tooth overlays | **`@react-three/fiber` + `@react-three/drei` + `three`** | Used in `src/components/3d/`, `src/components/landing/TeethScene.tsx`, and `src/lib/scanning/PointCloudViewer.tsx`. |
| Package manager | **bun** (primary) — npm lockfile also tracked for compatibility | `bun.lock` + `bun.lockb` in repo. |

## Backend

| Layer | Choice | Notes |
| --- | --- | --- |
| Database | **Supabase Postgres** (v14.1) | Schema in `supabase/migrations/`; generated types in `src/integrations/supabase/types.ts`. |
| Auth | **Supabase Auth** | Email + OTP. Doctor and patient roles via Postgres RLS. |
| Storage | **Supabase Storage** | Buckets: `scan-videos` (raw video + keyframes), `scan-pointclouds` (LingBot output), `response-videos` (doctor walkthroughs), `profile-photos` (public). |
| Realtime | **Supabase Realtime** | Postgres CDC + the `lingbot_queue` `pg_notify` channel (set up by the 20260509 migration) drive the GPU dispatcher. |
| Server logic | **Supabase Edge Functions** (Deno) | Orchestration only — `reconstruct-scan`, `analyze-scan-quality`, `analyze-scan-teeth`, `generate-copilot-note`, `generate-patient-summary`, `run-automations`, `accept-team-invite`, `create-billing-portal`, `seed-users`, `annotate-scan-image`. |
| GPU compute | **External GPU host** running LingBot-Map FastAPI service | Not Supabase. See [lingbot-map-integration.md](./lingbot-map-integration.md). |

## 3D processing pipeline

| Stage | Tool | Where it runs |
| --- | --- | --- |
| Reconstruction | **LingBot-Map** (PyTorch 2.8.0 + CUDA 12.8 + FlashInfer) | GPU host (H100/A100/4090) |
| Display / annotation | **`@react-three/fiber` + `PointCloudViewer`** | Browser, in-app |
| Per-tooth status overlay | **`TeethVisualization`** (procedural arch tinted by `analyze-scan-teeth` output) | Browser, in-app |

Notably absent: SuperSplat, PlayCanvas, gsplat. The pipeline goes straight from LingBot's point cloud to R3F.

## Asset formats

| Asset | Format | Where stored |
| --- | --- | --- |
| Raw capture | `.webm` (H.264 / VP8/VP9, ~720p) | Supabase Storage `scan-videos` |
| Per-frame keyframes (for AI analysis) | `.jpg` | Supabase Storage `scan-videos`, alongside the video |
| Camera poses + per-frame predictions | `.npz` | GPU host scratch / optionally archived to `scan-videos` |
| Point cloud | `.ply` (binary, optionally with vertex colors) | Supabase Storage `scan-pointclouds` |
| Doctor walkthrough video | `.webm` | Supabase Storage `response-videos` |
| Doctor timestamped comments | JSONB array on `scan_reviews.comments` | Postgres |

## Database additions in `20260509_lingbot_pipeline.sql`

- `scans.scan_type` (`'scope' | 'wand'`)
- `scans.raw_video_url`
- `scans.pointcloud_url`
- `scans.processing_status` (`queued` / `uploading` / `processing` / `complete` / `failed`)
- `scans.processing_error`
- `scans.reconstructed_at`
- `scans.lingbot_metrics` (JSONB — confidence, pose stability, frame count)
- `scans.doctor_review_id` (UUID — current/active review)
- `scan_reviews.comments` (JSONB array of `{id, t_ms, text, author_id, created_at, position?}`)
- `scan_reviews.video_duration_ms`
- `progress_snapshots` (longitudinal per-tooth deltas)
- `scan-pointclouds` storage bucket + RLS policies
- `notify_lingbot_queue` trigger fires `pg_notify('lingbot_queue', …)` on queued inserts

## Observability

| Layer | Choice |
| --- | --- |
| Frontend errors | (none yet — add Sentry) |
| Frontend logs | `src/lib/logger.ts` |
| Backend logs | Supabase Functions log stream |
| GPU host metrics | Prometheus exporter on the FastAPI service (request counts, queue depth, GPU memory, job duration) — to be added |
| Pipeline status UI | Per-scan `processing_status` shown in `/patient/scans/:id/results` and the doctor's `/doctor/scans/:id` |

## Deployment

| Surface | Target |
| --- | --- |
| Web app | Cloudflare Pages or Vercel (static SPA build) |
| Edge Functions | Supabase-managed |
| GPU host | Lambda Cloud / Modal / Fly.io GPU. Single H100 to start; queue-based autoscale |

## Compliance posture

- Patient scans are **PHI**. Both buckets (`scan-videos`, `scan-pointclouds`) are private; signed URLs only, 1-hour TTL.
- BAA in place with Supabase (HIPAA tier) and the GPU provider.
- No telemetry / analytics on scan content. App-level analytics scrubbed of any scan blob URLs.

## Versions (current — keep this section current)

| Package | Version |
| --- | --- |
| `react` | 18.x |
| `vite` | 5.x |
| `@react-three/fiber` | ^8.18.0 |
| `@react-three/drei` | ^9.122.0 |
| `three` | (transitive via drei) |
| `@types/three` | ^0.160.0 |
| `@supabase/supabase-js` | ^2.97.0 |
| `@tanstack/react-query` | ^5.83.0 |
| LingBot-Map model | `lingbot-map-long.pt` (HuggingFace `robbyant/lingbot-map`) |
| LingBot-Map server CUDA | 12.8 |
| LingBot-Map server PyTorch | 2.8.0 |

## Future / planned

- **Mobile native (Expo)**: required for IMU-based motion validation pre-upload. PWA gets us ~80% but not 100%.
- **On-device preview**: lightweight ARKit/ARCore SfM to give the patient instant feedback before LingBot finishes.
- **Annotation hotspots**: project `ToothAnnotation.position` to screen-space and render shadcn buttons on top of the R3F canvas (`PointCloudViewer.overlay` is the seam).
