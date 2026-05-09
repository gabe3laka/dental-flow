# Arcline 3D Pipeline

End-to-end architecture for capturing, reconstructing, displaying, annotating, and reviewing a patient's intra/extra-oral scan.

## Hardware

| Device | Where it sits | Capture mode |
| --- | --- | --- |
| **Arcline Scope** | Phone-exterior attachment (clip-on macro lens / ring light) | Outside-mouth video — captures full smile, lip lines, occlusion from the front. Phone camera is the sensor; Scope adds optics + light. |
| **Arcline Wand** | Standalone tethered wand (small lens tip + ring of LEDs) | Inside-mouth video — small form factor reaches molars, lingual surfaces, and palate. LEDs eliminate cast shadows for stable photometry on enamel. |

Both devices stream H.264/H.265 video via the patient's phone (BLE control + USB-C/Lightning data, or Wi-Fi Direct for the Wand). The phone uploads chunks to Supabase Storage as the patient scans.

## Pipeline overview

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌──────────────────────┐
│ Phone (Scope│ →  │ Supabase Storage │ →  │ LingBot-Map GPU │ →  │ 3DGS Training        │
│ or Wand)    │    │ (raw video)      │    │ Server          │    │ (gsplat / Brush)     │
│ video chunks│    │                  │    │ poses + points  │    │ → .ply / .splat      │
└─────────────┘    └──────────────────┘    └─────────────────┘    └──────────────────────┘
                                                                              │
                                                                              ▼
┌──────────────────────┐    ┌────────────────────┐    ┌────────────────────────────┐
│ Doctor Review        │ ←  │ SuperSplat Viewer  │ ←  │ Supabase Storage           │
│ (timestamped video   │    │ (browser, embedded)│    │ (.splat + annotations.json)│
│  + splat annotations)│    │ + dental hotspots  │    │                            │
└──────────────────────┘    └────────────────────┘    └────────────────────────────┘
```

### Stage 1 — Capture (phone)

- Patient runs the Arcline mobile flow (or PWA), follows the on-screen guide ([scanning-flow.md](./scanning-flow.md)) and records a sweep.
- Phone uploads the raw `.mp4` (and IMU sidecar if available) to a per-scan path in Supabase Storage: `scans/{patient_id}/{scan_id}/raw.mp4`.
- A row is inserted into `scan_sessions` with `status='uploaded'`. Realtime fires a Postgres change to the GPU dispatcher.

### Stage 2 — 3D reconstruction (LingBot-Map)

- Dispatcher pulls the next `uploaded` row, signs a download URL, and POSTs a job to the LingBot-Map GPU server (see [lingbot-map-integration.md](./lingbot-map-integration.md)).
- LingBot-Map runs `demo_render/batch_demo.py` (or an equivalent inference service wrapper) with the model weights `lingbot-map-long.pt`.
- For dental sequences (typically 10–60 s, 300–1800 frames) windowed mode is unnecessary — `--keyframe_interval 2` with the streaming path is sufficient. For Wand sequences that loop multiple passes around the arch, enable `--mode windowed --window_size 128 --overlap_keyframes 16 --keyframe_interval 2`.
- LingBot-Map emits, per scan:
  - `poses.npz` — per-frame camera intrinsics + extrinsics
  - `points.ply` — fused point cloud (confidence-thresholded)
  - `frames/*.npz` — per-frame depth + point predictions (only when `--save_predictions` is set)

### Stage 3 — Splat training (bridge step)

LingBot-Map outputs point clouds, **not** Gaussian Splats. SuperSplat consumes `.ply`/`.splat` Gaussian Splat files. A trainer must run between them:

- Reference implementations: [gsplat](https://github.com/nerfstudio-project/gsplat), [Brush](https://github.com/ArthurBrussee/brush) (WebGPU, Rust), Inria 3DGS reference.
- Inputs: LingBot-Map's `poses.npz` + frame images + `points.ply` (used as Gaussian initialization). This skips COLMAP entirely — LingBot-Map already gives us calibrated poses, which is the slow step in classical 3DGS.
- Output: `scan.splat` (PLY-style Gaussian Splat) → uploaded to `scans/{patient_id}/{scan_id}/scan.splat`.
- For dental scans (small, well-lit volume) ~3–5 minutes on an A100/H100 is realistic.

If a 3DGS-quality result is not needed (e.g. monitoring-grade only), Stage 3 can be skipped: render the LingBot-Map point cloud directly via Three.js — but it will look like points, not photoreal.

### Stage 4 — Display + annotate (SuperSplat)

- The doctor portal embeds a SuperSplat-based viewer (see [supersplat-integration.md](./supersplat-integration.md)) pointed at the signed `.splat` URL.
- Annotations: tooth-numbered hotspots (FDI / Universal numbering), decay markers, gum-line traces, recession deltas vs prior scan, custom freeform notes.
- Annotations are stored as a sidecar JSON in `scans/{patient_id}/{scan_id}/annotations.json` and mirrored to a `scan_annotations` Postgres table for querying / progress.

### Stage 5 — Doctor video review

- Doctor records a video walkthrough of the scan (their own webcam + screen-grab of the splat viewer they're rotating through).
- During recording, every annotation drop is timestamped against the video clock.
- Patient sees the video with a clickable annotation timeline; clicking a marker jumps the SuperSplat viewer to the matching pose.

### Stage 6 — Patient progress tracking

- Each scan stores a stable canonical pose (registered to the patient's first-ever scan via ICP on the splat point cloud).
- Diff views: gum-line height, tooth movement (mm), decay surface area — computed by registering scan N to scan N-1 in the canonical frame and writing deltas to `scan_progress`.

## Data contracts

See [`src/lib/scanning/types.ts`](../../src/lib/scanning/types.ts) for the full TypeScript contracts. Key entities:

- `ScanSession` — one capture event (raw video upload).
- `ScanResult` — output of LingBot-Map + 3DGS training (splat URL, pose data, quality metrics).
- `ToothAnnotation` — a doctor-placed marker on a tooth (FDI number, severity, note).
- `DoctorReview` — a video walkthrough + ordered list of timestamped annotation events.

## Quality tiers

| Tier | Pipeline | Purpose |
| --- | --- | --- |
| **Monitoring** | LingBot-Map point cloud, no 3DGS step | Fast turnaround (<2 min). Side-by-side progress comparisons, gum-line tracking. Not suitable for fabrication. |
| **Visualization** | LingBot-Map → 3DGS training → SuperSplat | Photoreal scan for patient education and doctor review. Sub-mm visual fidelity but not metrologically calibrated. |
| **Clinical-grade** | Out of scope for Scope/Wand monitoring tier. Send patient in for an iTero / Trios scan when fabrication (grills, mouthguards, retainers, aligners) is required. | See [scanning-flow.md](./scanning-flow.md). |

## Latency budget

| Stage | Wall-clock (target, 30 s scan) |
| --- | --- |
| Capture + upload | 30–90 s (depends on connection) |
| LingBot-Map inference | 30–60 s on a single A100 (~20 FPS @ 518×378) |
| 3DGS training (optional) | 3–5 min on A100/H100 |
| SuperSplat first paint | <2 s after splat URL is signed |

Total monitoring-tier turnaround: under 2 minutes from end-of-scan to "ready for doctor review." Visualization-tier: 5–8 minutes.
