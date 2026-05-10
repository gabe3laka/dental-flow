# LingBot-Map Integration

GPU-server inference for the Arcline 3D reconstruction stage. LingBot-Map is a feed-forward Geometric Context Transformer that turns a phone-camera video into camera poses + a fused point cloud, **without requiring camera calibration**.

Upstream: <https://github.com/robbyant/lingbot-map> · Apache-2.0.

A snapshot of the upstream README lives at [`/.planning/research/lingbot-map-README.md`](../../.planning/research/lingbot-map-README.md).

## Why LingBot-Map for Arcline

- **No calibration needed.** Patients use unknown phone cameras; LingBot-Map handles arbitrary intrinsics. Single biggest unlock for a consumer scanning product.
- **Streaming inference.** ~20 FPS on 518×378 with paged KV cache via FlashInfer. A 25 s scan reconstructs in ~30 s.
- **Long-sequence support.** 10 000+ frames in `--mode windowed` — enables a single continuous mouth sweep instead of per-zone snapshots.
- **Apache 2.0.** Commercial use is unrestricted.
- **Outputs a `.ply` point cloud directly** — which is exactly what `@react-three/fiber` (already in this repo) consumes via Three.js `PLYLoader`. No bridge step.

## Hardware spec (single-GPU server)

| Component | Recommended | Minimum |
| --- | --- | --- |
| GPU | NVIDIA H100 80 GB or A100 80 GB | RTX 4090 24 GB |
| CPU | 16 vCPU | 8 vCPU |
| RAM | 64 GB | 32 GB |
| Disk | 500 GB NVMe | 200 GB |
| CUDA | 12.8 | 12.x |
| OS | Ubuntu 22.04 / 24.04 | — |

For Arcline production: a managed GPU host (Lambda, Modal, RunPod serverless, Fly.io GPU). One H100 supports ~5 concurrent ~30 s dental scans. Auto-scale by queue depth.

## Server install

```bash
conda create -n lingbot-map python=3.10 -y
conda activate lingbot-map

# PyTorch (CUDA 12.8 — required for Kaolin wheels)
pip install torch==2.8.0 torchvision==0.23.0 \
  --index-url https://download.pytorch.org/whl/cu128

# LingBot-Map
git clone https://github.com/robbyant/lingbot-map.git
cd lingbot-map
pip install -e .

# FlashInfer (paged KV cache attention — strongly recommended)
pip install --index-url https://pypi.org/simple flashinfer-python
pip install flashinfer-jit-cache \
  -f https://flashinfer.ai/whl/cu128/flashinfer-jit-cache/

# Optional: render pipeline (only needed for offline preview rendering)
pip install -e ".[vis,render]"
pip install onnxruntime-gpu
pip install --index-url https://pypi.org/simple kaolin \
  -f https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.8.0_cu128.html
sudo apt install ffmpeg
cd demo_render/render_cuda_ext && python setup.py build_ext --inplace && cd ../..
```

Cache the `lingbot-map-long.pt` checkpoint (HuggingFace `robbyant/lingbot-map`) on the GPU host's NVMe.

## Inference command for dental scans

For a typical Arcline Scope sweep (10–30 s phone video):

```bash
python demo.py \
  --model_path /models/lingbot-map-long.pt \
  --video_path /scratch/{scan_id}/raw.webm \
  --fps 15 \
  --keyframe_interval 2 \
  --camera_num_iterations 2 \
  --conf_threshold 1.5 \
  --save_predictions \
  --output_folder /scratch/{scan_id}
```

| Flag | Reason |
| --- | --- |
| `--keyframe_interval 2` | Halves KV cache size; mouth scans are slow-moving so cache pressure is the limit, not motion. |
| `--camera_num_iterations 2` | Trades one pose-refinement pass for ~25% wall-clock speedup. Two iterations give clinically-usable poses on texture-rich enamel/gingiva. |
| `--save_predictions` | Persist per-frame NPZs for later re-rendering / progress diffs. |
| (no `--mask_sky`) | Sky masking is *off* — there is no sky inside a mouth. |

For Wand sweeps that loop the arch multiple times (typical interior workflow):

```bash
python demo.py \
  --model_path /models/lingbot-map-long.pt \
  --video_path /scratch/{scan_id}/raw.webm \
  --fps 15 \
  --mode windowed --window_size 128 --overlap_keyframes 16 \
  --keyframe_interval 2 \
  --save_predictions
```

The output of interest is `<output_folder>/pointcloud.ply` (or whatever `demo_render/batch_demo.py` names it for a given run).

## HTTP wrapper around the CLI

LingBot-Map ships a CLI, not an HTTP server. Wrap it so the Arcline Edge Function can dispatch jobs:

```python
# server.py — runs on the GPU host
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
import subprocess, pathlib, requests

app = FastAPI()
MODEL = "/models/lingbot-map-long.pt"
SCRATCH = pathlib.Path("/scratch")

class Job(BaseModel):
    scanId: str
    videoUrl: str
    callbackUrl: str
    scanType: str = "scope"        # "scope" | "wand"
    mode: str = "stream"
    fps: int = 15
    keyframeInterval: int = 2
    cameraNumIterations: int = 2

@app.post("/v1/reconstruct")
def reconstruct(job: Job, bg: BackgroundTasks):
    bg.add_task(run_job, job)
    return {"status": "accepted", "scanId": job.scanId}

def run_job(job: Job):
    work = SCRATCH / job.scanId
    work.mkdir(parents=True, exist_ok=True)
    raw = work / "raw.webm"
    raw.write_bytes(requests.get(job.videoUrl, timeout=120).content)

    args = [
        "python", "demo.py",
        "--model_path", MODEL,
        "--video_path", str(raw),
        "--fps", str(job.fps),
        "--keyframe_interval", str(job.keyframeInterval),
        "--camera_num_iterations", str(job.cameraNumIterations),
        "--save_predictions",
        "--output_folder", str(work),
    ]
    if job.mode == "windowed" or job.scanType == "wand":
        args += ["--mode", "windowed", "--window_size", "128", "--overlap_keyframes", "16"]

    subprocess.run(args, check=True)

    ply_path = next(work.glob("*pointcloud*.ply"))
    # PUT to Supabase scan-pointclouds bucket via signed URL embedded in callbackUrl
    # ... (signed PUT URL provisioning omitted)

    requests.post(job.callbackUrl, json={
        "scanId": job.scanId,
        "status": "complete",
        "outputs": {"pointCloudPath": f"{job.scanId}/pointcloud.ply"},
    })
```

Run with `uvicorn server:app --host 0.0.0.0 --port 8000` behind nginx + an internal API token (`LINGBOT_API_TOKEN`).

## Calling from Arcline (Vite + Supabase)

The browser does **not** call LingBot-Map directly. Flow:

1. Patient records video → upload to `scan-videos/{patient_id}/{ts}/raw_video.webm`.
2. Insert row into `scans` with `processing_status='queued'`, `raw_video_url`, `scan_type`.
3. Client calls Edge Function `reconstruct-scan` ([`supabase/functions/reconstruct-scan/index.ts`](../../supabase/functions/reconstruct-scan/index.ts)) with `{ scan_id }`. `verify_jwt = true` — the function additionally re-checks `scans.select` under the caller's JWT so users can't trigger reconstruction on scans they don't own.
4. Edge Function signs a 1-hour read URL for the video and POSTs `/v1/reconstruct` on the GPU host.
5. GPU host runs LingBot-Map, uploads `pointcloud.ply` to `scan-pointclouds` via signed PUT, then POSTs the callback URL with `Authorization: Bearer ${LINGBOT_API_TOKEN}`.
6. Callback handler ([`supabase/functions/reconstruct-scan-callback/index.ts`](../../supabase/functions/reconstruct-scan-callback/index.ts)) validates the token, then updates `scans.pointcloud_url`, `processing_status='complete'`, `reconstructed_at`, `lingbot_metrics`. On failure it sets `processing_status='failed'` with `processing_error`.
7. The browser viewer (`PointCloudViewer`) loads the `.ply` via a fresh signed URL when the user opens the scan.

The TypeScript dispatch contract lives at [`src/lib/scanning/lingbot-client.ts`](../../src/lib/scanning/lingbot-client.ts).

## Required env vars (Edge Function)

| Var | Purpose |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Standard Supabase service-role access |
| `SUPABASE_ANON_KEY` | Used by `reconstruct-scan` to construct a JWT-bound client and verify the caller can see the scan via RLS. Without it, dispatch refuses with 503. |
| `LINGBOT_API_URL` | e.g. `https://lingbot.arcline.app` |
| `LINGBOT_API_TOKEN` | Bearer token shared with the GPU host. **Also used by the callback** (`reconstruct-scan-callback`) to authenticate inbound completion webhooks — required there. |
| `ARCLINE_BASE_URL` | Public base URL where the callback function lives (defaults to `SUPABASE_URL`) |

If `LINGBOT_API_URL` / `LINGBOT_API_TOKEN` are absent the Edge Function still marks the scan `processing` and returns 200 — a worker can pick it up later by polling for queued scans. This keeps local dev unblocked.

## Failure modes

| Symptom | Likely cause | Mitigation |
| --- | --- | --- |
| Pose collapse partway through | Sequence longer than RoPE training range (~320 frames) without windowing | Re-run with `mode='windowed'`. |
| OOM mid-job | Too many in-flight jobs | Lower concurrency, add `--offload_to_cpu`. |
| First few seconds black/blurry | Patient starts with phone against cheek | Mobile capture trims first ~1.5 s; raise this if needed. |
| Patient barely moved → no parallax | Insufficient motion | Reject client-side via IMU motion check before upload (future). |
| LingBot writes succeeded but row never updates | Callback URL unreachable | Add a daily reconciliation job that polls the GPU host's status endpoint and back-fills. |

## Cost envelope

A 25 s scan on H100 ≈ ~30 GPU-seconds. At Lambda H100 on-demand pricing (~$2.49/hr at time of writing), that's ~$0.02/scan in inference cost. Storage is negligible (~10–30 MB per `.ply`). No 3DGS training step → no extra GPU minutes per scan.

## Local development

The Arcline frontend treats the GPU host as a black-box HTTP service. For local dev, leave `LINGBOT_API_URL` unset and pre-populate `pointcloud_url` on a few seed scans pointing at sample `.ply` files in the `scan-pointclouds` bucket — that's enough to develop against the real R3F viewer without a GPU.
