# Arcline 3D Pipeline

End-to-end architecture for capturing, reconstructing, displaying, annotating, and reviewing a patient's intra/extra-oral scan.

## Hardware

| Device | Where it sits | Capture mode |
| --- | --- | --- |
| **Arcline Scope** | Phone-exterior attachment (clip-on macro lens / ring light) | Outside-mouth video — captures full smile, lip lines, occlusion from the front. Phone camera is the sensor; Scope adds optics + light. |
| **Arcline Wand** | Standalone tethered wand (small lens tip + ring of LEDs) | Inside-mouth video — small form factor reaches molars, lingual surfaces, and palate. LEDs eliminate cast shadows for stable photometry on enamel. |

Both devices stream video via the patient's phone (BLE control + USB-C/Lightning data, or Wi-Fi Direct for the Wand). The phone uploads to Supabase Storage in chunks during capture.

## Pipeline overview

```
┌──────────────┐    ┌──────────────────┐    ┌────────────────────┐
│ Phone        │ →  │ Supabase Storage │ →  │ LingBot-Map        │
│ (Scope/Wand) │    │ scan-videos/     │    │ GPU server         │
│ video chunks │    │   raw_video.webm │    │ (FastAPI)          │
└──────────────┘    └──────────────────┘    └────────────────────┘
                                                       │
                                                       ▼
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│ Doctor Review        │ ←  │ R3F PointCloudViewer │ ←  │ Supabase Storage     │
│ (timestamped         │    │ (browser, in-app)    │    │ scan-pointclouds/    │
│  comments + video)   │    │                      │    │   pointcloud.ply     │
└──────────────────────┘    └──────────────────────┘    └──────────────────────┘
```

Three stages, no bridge step. LingBot's `.ply` is exactly what `@react-three/fiber`'s `PLYLoader` consumes.

### Stage 1 — Capture

- Patient runs `/patient/scan` ([`src/pages/patient/ScanSubmission.tsx`](../../src/pages/patient/ScanSubmission.tsx)).
- Records 10–45 s of `MediaRecorder` video (target 25 s) with on-screen guidance ("open wide", "tilt down", "turn left", etc.).
- During recording the page also captures a still keyframe every ~3 s on a hidden `<canvas>` — these go to `scan-videos/{patient_id}/{ts}/frame-NN.jpg` and feed the existing `analyze-scan-teeth` Edge Function (multi-modal Gemini call).
- Uploads the raw `.webm` to `scan-videos/{patient_id}/{ts}/raw_video.webm`.
- Inserts a `scans` row with `processing_status='queued'`, `scan_type` (scope/wand), `raw_video_url`, `zones_captured` (the keyframes).

### Stage 2 — Dispatch

- The client calls Edge Function `reconstruct-scan` ([`supabase/functions/reconstruct-scan/index.ts`](../../supabase/functions/reconstruct-scan/index.ts)) with `{ scan_id }`.
- The function signs a 1-hour read URL for the video and POSTs `/v1/reconstruct` on the GPU host.
- Marks `processing_status='processing'` so the UI can show a loading state.
- A Postgres trigger (`notify_lingbot_queue`) also fires `pg_notify('lingbot_queue', …)` — a long-running worker on the GPU host can consume this directly as an alternative to HTTP dispatch.

### Stage 3 — Reconstruction

- LingBot-Map runs `demo.py` (or the equivalent batch entrypoint) with `lingbot-map-long.pt`.
- Streaming mode for Scope (single-pass sweep). Windowed mode (`--mode windowed --window_size 128 --overlap_keyframes 16`) for Wand (multi-loop arch sweep).
- Output: `pointcloud.ply` (confidence-thresholded fused point cloud, with per-point colors from the source video).
- The GPU host PUTs the file to `scan-pointclouds/{patient_id}/{scan_id}/pointcloud.ply` via a signed URL.
- Posts back to the callback handler: sets `pointcloud_url`, `processing_status='complete'`, `reconstructed_at`, `lingbot_metrics`.

### Stage 4 — Display

- `PointCloudViewer` ([`src/lib/scanning/PointCloudViewer.tsx`](../../src/lib/scanning/PointCloudViewer.tsx)) loads the `.ply` via Three.js's `PLYLoader`, recenters the geometry, auto-frames the camera, and renders a `<points>` mesh with vertex colors when present.
- Used in:
  - Patient: `Progress` (hero — own latest scan), `ScanResults` (3D MAP tab).
  - Doctor: `ScanReview` (alongside per-tooth status), `ScanCompare` (side-by-side), `RecordResponse` (sidebar reference while recording).

### Stage 5 — Doctor review with timestamped comments

- Doctor opens `/doctor/scans/:scanId`, clicks "Record Response" → lands on `/doctor/record/:scanId`.
- During recording, doctor types comments in the sidebar and presses ⏎ to drop them at the current timecode (`performance.now()` delta from recording start).
- On send, the response video uploads to `response-videos/`, and the `scan_reviews` row is inserted with `comments` JSONB (an array of `{id, t_ms, text, author_id, created_at, position?}`) and `video_duration_ms`.
- Patient sees the video on `/patient/response/:id` with the comment timeline (UI for which is deferred — schema is ready).

### Stage 6 — Patient progress tracking

- Each scan stores its `pointcloud_url`. Longitudinal deltas live in the new `progress_snapshots` table — `from_scan_id`, `to_scan_id`, computed per-tooth deltas (recession mm, movement mm, decay surface mm²).
- Diff jobs are out of scope for v1; the schema is ready so a periodic cron-style Edge Function can backfill.

## Data contracts

See [`src/lib/scanning/types.ts`](../../src/lib/scanning/types.ts). Key entities:

- `ScanSession` — one capture event (raw video upload).
- `ScanResult` — output of LingBot-Map (point cloud URL, pose data, quality metrics).
- `ToothAnnotation` — a doctor-placed marker tied to a tooth (FDI / Universal numbering).
- `DoctorReview` — the video walkthrough plus the timestamped comment list.
- `ScanProgressDelta` — longitudinal per-tooth deltas.

## Quality tiers

| Tier | Pipeline | Purpose |
| --- | --- | --- |
| **Monitoring** | LingBot-Map → R3F point-cloud viewer | Default for every scan. Side-by-side progress comparisons, gum-line tracking. |
| **Clinical-grade** | Out of scope. Send patient in for an iTero / Trios scan when fabrication (crowns, aligners, implants) is required. | See [scanning-flow.md](./scanning-flow.md). |

There is no "visualization tier" with a 3DGS bridge step — we render the raw point cloud directly. This is faster (no 3DGS training step), cheaper (no extra GPU minutes), and good enough for the monitoring use case.

## Latency budget

| Stage | Wall-clock (target, 25 s scan) |
| --- | --- |
| Capture + upload | 25–60 s (depends on connection) |
| LingBot-Map inference | 30–60 s on a single A100 (~20 FPS @ 518×378) |
| First paint of point cloud in R3F | <2 s after `pointcloud_url` is signed |

Total turnaround: under 2 minutes from end-of-scan to "ready for doctor review."
