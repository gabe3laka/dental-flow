# Arcline Tech Stack

Authoritative reference for what runs where, and why. Reflects the **actual** repo state as of this commit, not aspirational state.

## Frontend

| Layer | Choice | Notes |
| --- | --- | --- |
| Build | **Vite 5 + SWC React plugin** | This repo is **not** Next.js. Vite-only SPA. Some upstream Arcline docs reference Next.js — that's planned migration territory, not current state. If we need server components / RSC for the doctor portal, see "Future" below. |
| Language | **TypeScript** (`strict: false`, `strictNullChecks: false`) | Loose by design, see `tsconfig.json`. Don't tighten without a coordinated migration. |
| UI | **React 18 + shadcn/ui (Radix primitives) + Tailwind** | Component primitives in `src/components/ui/`. |
| Routing | React Router v6 | App-level routing only; no SSR. |
| State / data | **TanStack Query** for server state; React Context for auth/session | No global store (Zustand/Redux/etc.) — keep it that way. |
| Forms | `react-hook-form` + `@hookform/resolvers` | Zod schemas in feature folders. |
| 3D — point clouds & overlays | **`@react-three/fiber` + `@react-three/drei` + `three`** | Already used in `src/components/3d/MouthPanorama.tsx` and `TeethVisualization.tsx`. |
| 3D — Gaussian Splat viewer | **`playcanvas` + `@playcanvas/react`** (to be added) | First-party splat support; r3f has none. See [supersplat-integration.md](./supersplat-integration.md). |
| Package manager | **bun** (primary) — npm lockfile also tracked for compatibility | `bun.lock` + `bun.lockb` in repo. |

## Backend

| Layer | Choice | Notes |
| --- | --- | --- |
| Database | **Supabase Postgres** (v14.1) | Schema in `supabase/migrations/`; generated types in `src/integrations/supabase/types.ts`. |
| Auth | **Supabase Auth** | Email + OTP. Doctor and patient roles via Postgres RLS, not separate auth providers. |
| Storage | **Supabase Storage** | Per-scan layout: `scans/{patient_id}/{scan_id}/raw.mp4`, `points.ply`, `scan.splat`, `annotations.json`. |
| Realtime | **Supabase Realtime** | Postgres CDC for `scan_sessions` status changes (drives the GPU dispatcher). |
| Server logic | **Supabase Edge Functions** (Deno) | Thin orchestration only — `reconstruct-dispatch`, `splat-train-dispatch`, `gpu-callback`. |
| GPU compute | **External GPU host** running LingBot-Map FastAPI service | Not Supabase. See [lingbot-map-integration.md](./lingbot-map-integration.md). |
| 3DGS training | **gsplat** (or Brush) on the same GPU host | Bridges LingBot-Map → SuperSplat. |

## 3D processing pipeline

| Stage | Tool | Where it runs |
| --- | --- | --- |
| Reconstruction | **LingBot-Map** (PyTorch 2.8.0 + CUDA 12.8 + FlashInfer) | GPU host (H100/A100/4090) |
| 3DGS training | **gsplat** | Same GPU host |
| Editor / authoring viewer | **SuperSplat** (PlayCanvas, WebGL/WebGPU) | Self-hosted fork at `editor.arcline.app`, embedded via iframe in doctor portal |
| Read-only viewer | Custom viewer using **PlayCanvas Engine** | In-app component at `src/lib/scanning/supersplat-embed.tsx` |

## Asset formats

| Asset | Format | Where stored |
| --- | --- | --- |
| Raw capture | `.mp4` (H.264, 1080p, 30 fps) | Supabase Storage |
| Camera poses | `.npz` (per-frame 4×4 + intrinsics) | Supabase Storage |
| Point cloud | `.ply` | Supabase Storage |
| Gaussian Splat | `.compressed.ply` (SuperSplat's quantized format) | Supabase Storage |
| Annotations | `.json` (sidecar) + Postgres mirror in `scan_annotations` | Both |
| Doctor walkthrough | `.mp4` + `walkthrough.json` (camera path) | Supabase Storage |

## Observability

| Layer | Choice |
| --- | --- |
| Frontend errors | (none yet — add Sentry) |
| Frontend logs | `src/lib/logger.ts` (existing) |
| Backend logs | Supabase Functions log stream |
| GPU host metrics | Prometheus exporter on the FastAPI service (request counts, queue depth, GPU memory, job duration) — to be added |
| Pipeline status UI | Doctor admin page (TBD) |

## Deployment

| Surface | Target |
| --- | --- |
| Web app | Cloudflare Pages or Vercel (static SPA build) |
| Edge Functions | Supabase-managed |
| GPU host | Lambda Cloud / Modal / Fly.io GPU. Single H100 to start; queue-based autoscale |
| SuperSplat fork | Same web host as the SPA, served from `editor.arcline.app` subdomain |

## Compliance posture

- Patient scans are **PHI**. Storage bucket is private, signed URLs only, 1-hour TTL.
- BAA in place with Supabase (their HIPAA tier) and the GPU provider.
- No telemetry / analytics on scan content. App-level analytics scrubbed of any scan blob URLs.
- See [supersplat-integration.md](./supersplat-integration.md) for the SuperSplat fork hardening checklist.

## Versions (current — keep this section current)

| Package | Version |
| --- | --- |
| `react` | 18.x |
| `vite` | 5.x |
| `@react-three/fiber` | ^8.18.0 |
| `@react-three/drei` | ^9.122.0 |
| `three` | (transitive via drei) |
| `@supabase/supabase-js` | ^2.97.0 |
| `@tanstack/react-query` | ^5.83.0 |
| LingBot-Map model | `lingbot-map-long.pt` (HuggingFace `robbyant/lingbot-map`) |
| LingBot-Map server CUDA | 12.8 |
| LingBot-Map server PyTorch | 2.8.0 |

## Future / planned migrations

- **Next.js**: only if we need RSC for the doctor's high-data dashboards. Pure SPA + Supabase Realtime is fine for v1.
- **Mobile native (React Native / Expo)**: required for IMU access in capture. PWA gets us ~80% but not 100%.
- **Local point-cloud preview before upload**: lightweight on-device structure-from-motion (e.g. ARKit/ARCore) to give the patient instant feedback before LingBot-Map runs server-side.
