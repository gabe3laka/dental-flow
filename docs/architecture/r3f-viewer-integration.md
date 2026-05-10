# R3F Point-Cloud Viewer Integration

In-browser 3D viewer for LingBot-Map's `.ply` point clouds. Implemented with **`@react-three/fiber`** (already in `package.json`) — no new runtime dependency.

Component: [`src/lib/scanning/PointCloudViewer.tsx`](../../src/lib/scanning/PointCloudViewer.tsx)
URL-signing helper: [`src/lib/scanning/usePointCloudUrl.ts`](../../src/lib/scanning/usePointCloudUrl.ts)

## Why R3F (not SuperSplat / PlayCanvas)

- LingBot-Map outputs **point clouds** (`.ply`), not Gaussian Splats. SuperSplat is a Gaussian Splat editor — wrong tool for our output.
- `@react-three/fiber` + Three.js `PLYLoader` already covers point-cloud rendering. The deps are present:

  | Package | Version |
  | --- | --- |
  | `@react-three/fiber` | ^8.18.0 |
  | `@react-three/drei` | ^9.122.0 |
  | `@types/three` | ^0.160.0 |

- The rest of the app (`MouthPanorama`, `TeethVisualization`) is already R3F. Same renderer, same conventions.

## Component contract

```tsx
import { PointCloudViewer } from "@/lib/scanning/PointCloudViewer";
import { usePointCloudUrl } from "@/lib/scanning/usePointCloudUrl";

function ScanView({ scan }: { scan: { pointcloud_url: string | null } }) {
  const { url } = usePointCloudUrl(scan.pointcloud_url);
  return <PointCloudViewer plyUrl={url} height={360} />;
}
```

Props:

| Prop | Type | Notes |
| --- | --- | --- |
| `plyUrl` | `string \| null` | Signed Storage URL or `null` for empty state |
| `height` | `number \| string` | CSS height. Default `420px`. |
| `pointSize` | `number?` | Override; auto-tuned by point count when omitted |
| `background` | `string?` | Canvas bg color. Default `#0a0e16`. |
| `overlay` | `ReactNode?` | Pointer-events-none layer (badges, hotspots) |
| `emptyState` | `ReactNode?` | Custom render when `plyUrl` is null |

When `plyUrl` is null the component renders the empty state — no Canvas, no Three.js, no ratchet on the GPU.

## What it does

1. **Loads** the `.ply` via Three.js's `PLYLoader` (lives in `three/examples/jsm/loaders/PLYLoader`).
2. **Recenters** geometry to the bounding sphere (LingBot's coordinate frame is roughly metric but not anchored to the origin).
3. **Auto-frames** the camera based on the bounding sphere radius.
4. **Sizes points** automatically — denser clouds get smaller points to keep visual density consistent. Override via `pointSize`.
5. **Vertex colors** when present (LingBot's PLYs carry per-point color from the source video frames). Falls back to a neutral grey otherwise.
6. **Orbit, pan, zoom** via `@react-three/drei`'s `OrbitControls`. Damping enabled for a smooth feel.

## Storage URL signing

Point clouds live in the private `scan-pointclouds` Supabase bucket (created by the `20260509_lingbot_pipeline.sql` migration). The viewer needs a *URL*, not a path — `usePointCloudUrl(path)` signs a 1-hour URL on mount and re-signs whenever `path` changes.

RLS policy is per-patient folder: `{patient_id}/{scan_id}/pointcloud.ply`. Patients see their own; doctors see their assigned patients'; service role writes (LingBot uploads via signed PUT).

## Performance

| Cloud size | First paint (M1 Pro) | Steady-state FPS |
| --- | --- | --- |
| 50k points | <0.5 s | 60 |
| 200k points | ~1 s | 60 |
| 500k points | ~2 s | 60 |
| 2M points | ~5 s | 30–60 |

LingBot's confidence threshold (default `--conf_threshold 1.5`) typically yields 100k–500k points for a dental scan. Stay in this range — beyond ~1M points the loader allocation and per-frame cost on lower-end mobile GPUs gets noticeable.

`.ply` files larger than ~50 MB should be either confidence-thresholded harder or downsampled server-side via `--downsample_factor`.

## Where it's used

| Surface | Purpose |
| --- | --- |
| `src/pages/patient/Progress.tsx` | Patient hero — their own latest 3D map |
| `src/pages/patient/ScanResults.tsx` | "3D MAP" tab on a single scan |
| `src/pages/doctor/ScanReview.tsx` | Doctor review — patient's actual scan |
| `src/pages/doctor/RecordResponse.tsx` | Sidebar reference while the doctor records video commentary |
| `src/pages/doctor/ScanCompare.tsx` | Side-by-side longitudinal compare |

## Future extensions

- **Hotspot annotations.** Project per-tooth annotation positions to screen-space each frame and render DOM overlay buttons on top of the canvas. The current viewer accepts `overlay` for this — wire `useFrame` + camera matrix to position the overlay children. Annotation schema is already in `src/lib/scanning/types.ts` (`ToothAnnotation`).
- **Camera path replay.** During doctor-recorded walkthroughs, persist the camera pose at 10 Hz to a sidecar JSON and lerp it on patient playback. Pose schema already in `DoctorReview.cameraPath` (deferred from v1).
- **Mesh reconstruction toggle.** If we later run Poisson / TSDF on the GPU host, swap the `<points>` for `<mesh>` here and reuse all the rest.

## Out of scope

- **Gaussian Splats.** No SuperSplat, no PlayCanvas, no `.splat` file format.
- **Per-tooth segmentation.** Future ML pass would label points by tooth — not implemented.
- **Real-time collaborative orbiting.** Doctor and patient view independently.
