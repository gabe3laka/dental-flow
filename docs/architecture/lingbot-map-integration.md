# LingBot-Map Integration

GPU-server inference for the Arcline 3D reconstruction stage. LingBot-Map is a feed-forward Geometric Context Transformer that turns a phone-camera video into camera poses + a fused point cloud, without requiring camera calibration.

Upstream: <https://github.com/robbyant/lingbot-map> · Apache-2.0.

## Why LingBot-Map for Arcline

- **No calibration needed.** Patients use an unknown phone camera; LingBot-Map handles arbitrary intrinsics. This is the single biggest unlock for a consumer scanning product.
- **Streaming inference.** ~20 FPS on 518×378, paged KV cache via FlashInfer. A 30 s scan reconstructs in ~30 s.
- **Long-sequence support.** 10 000+ frames via windowed mode — enables "scan your whole mouth in one continuous sweep" rather than zone-by-zone.
- **Apache 2.0.** Commercial use is unrestricted.

## Hardware spec (single-GPU server)

| Component | Recommended | Minimum |
| --- | --- | --- |
| GPU | NVIDIA H100 80 GB or A100 80 GB | RTX 4090 24 GB |
| CPU | 16 vCPU | 8 vCPU |
| RAM | 64 GB | 32 GB |
| Disk | 500 GB NVMe (model + scratch) | 200 GB |
| CUDA | 12.8 | 12.x |
| OS | Ubuntu 22.04 / 24.04 | — |

For Arcline production, run on a managed GPU host (Lambda, Modal, RunPod serverless, or Fly.io GPU). A single H100 supports ~5 concurrent dental scans (each ~30–60 s). Auto-scaling is straightforward — each job is independent.

## Server install

```bash
# 1. Conda env
conda create -n lingbot-map python=3.10 -y
conda activate lingbot-map

# 2. PyTorch (CUDA 12.8 — required for Kaolin wheels)
pip install torch==2.8.0 torchvision==0.23.0 \
  --index-url https://download.pytorch.org/whl/cu128

# 3. LingBot-Map
git clone https://github.com/robbyant/lingbot-map.git
cd lingbot-map
pip install -e .

# 4. FlashInfer (paged KV cache attention — strongly recommended)
pip install --index-url https://pypi.org/simple flashinfer-python
# Optional: prebuilt JIT cache for faster first-use
pip install flashinfer-jit-cache \
  -f https://flashinfer.ai/whl/cu128/flashinfer-jit-cache/

# 5. Render pipeline (only needed if we ship point-cloud previews)
pip install -e ".[vis,render]"
pip install onnxruntime-gpu
pip install --index-url https://pypi.org/simple kaolin \
  -f https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.8.0_cu128.html
sudo apt install ffmpeg
cd demo_render/render_cuda_ext && python setup.py build_ext --inplace && cd ../..
```

Download the `lingbot-map-long.pt` checkpoint from <https://huggingface.co/robbyant/lingbot-map> on first boot and cache it on the GPU host's NVMe.

## Inference command for dental scans

For a typical Arcline scan (10–60 s phone video):

```bash
python demo.py \
  --model_path /models/lingbot-map-long.pt \
  --video_path /scratch/{scan_id}/raw.mp4 \
  --fps 15 \
  --keyframe_interval 2 \
  --camera_num_iterations 2 \
  --conf_threshold 1.5 \
  --save_predictions
```

Flag rationale:

| Flag | Reason |
| --- | --- |
| `--keyframe_interval 2` | Halves KV cache size; mouth scans are slow-moving so cache pressure is the limit, not motion. |
| `--camera_num_iterations 2` | Trade one pose-refinement pass for ~25% wall-clock speedup. Dental scenes are texture-rich (enamel, gingiva), so two iterations give clinically usable poses. |
| `--save_predictions` | Persist per-frame NPZs for the 3DGS bridge step. |

For continuous sweeps that loop multiple times around the arch (typical Wand workflow), switch to windowed:

```bash
python demo.py \
  --model_path /models/lingbot-map-long.pt \
  --video_path /scratch/{scan_id}/raw.mp4 \
  --fps 15 \
  --mode windowed --window_size 128 --overlap_keyframes 16 \
  --keyframe_interval 2 \
  --save_predictions
```

**Sky masking** (`--mask_sky`) is intentionally *off* for dental scans — there is no sky and the segmentation model would mis-classify oral mucosa.

## Wrapping LingBot-Map as an HTTP service

LingBot-Map ships a CLI, not an HTTP server. Wrap it in a thin FastAPI process so the Arcline backend (Supabase Edge Function) can dispatch jobs:

```python
# server.py — runs on the GPU host
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
import subprocess, uuid, pathlib, requests

app = FastAPI()
MODEL = "/models/lingbot-map-long.pt"
SCRATCH = pathlib.Path("/scratch")

class Job(BaseModel):
    scan_id: str
    video_url: str       # signed Supabase URL
    callback_url: str    # signed callback URL on Arcline backend
    mode: str = "stream" # or "windowed"

@app.post("/v1/reconstruct")
def reconstruct(job: Job, bg: BackgroundTasks):
    bg.add_task(run_job, job)
    return {"status": "accepted", "scan_id": job.scan_id}

def run_job(job: Job):
    work = SCRATCH / job.scan_id
    work.mkdir(parents=True, exist_ok=True)
    raw = work / "raw.mp4"
    raw.write_bytes(requests.get(job.video_url, timeout=120).content)

    args = ["python", "demo.py",
            "--model_path", MODEL,
            "--video_path", str(raw),
            "--fps", "15",
            "--keyframe_interval", "2",
            "--camera_num_iterations", "2",
            "--save_predictions",
            "--output_folder", str(work)]
    if job.mode == "windowed":
        args += ["--mode", "windowed",
                 "--window_size", "128",
                 "--overlap_keyframes", "16"]
    subprocess.run(args, check=True)

    # Upload poses.npz + points.ply + frames/ back to Supabase via signed PUTs
    # (omitted — see lingbot-client.ts for the URL contract)
    requests.post(job.callback_url, json={"scan_id": job.scan_id, "status": "complete"})
```

Run with `uvicorn server:app --host 0.0.0.0 --port 8000` behind nginx + an internal API token. Concurrency is bound by GPU memory; serialize with a queue if you exceed ~5 in-flight jobs per GPU.

## Calling from Arcline (Vite + Supabase)

The browser does **not** call LingBot-Map directly. Flow:

1. Phone uploads `raw.mp4` to Supabase Storage (`scans/{patient}/{scan}/raw.mp4`).
2. Insert row into `scan_sessions` with `status='uploaded'`.
3. A Supabase Edge Function (`reconstruct-dispatch`) listens for the row, signs a 1-hour read URL for the video and a write URL for the outputs, then POSTs to the GPU host's `/v1/reconstruct`.
4. GPU host runs LingBot-Map, uploads outputs to Supabase Storage via the signed PUT URLs, and POSTs the callback.
5. Edge Function callback handler updates `scan_sessions.status='reconstructed'` and triggers the 3DGS bridge job (or marks as monitoring-tier complete).

The TypeScript client used by the Edge Function lives at [`src/lib/scanning/lingbot-client.ts`](../../src/lib/scanning/lingbot-client.ts).

## Failure modes

| Symptom | Likely cause | Mitigation |
| --- | --- | --- |
| "Pose collapse" partway through | Sequence longer than RoPE training range (~320 frames) without windowing | Switch job to `mode='windowed'` and re-run. |
| OOM mid-job | Too many in-flight jobs | Lower `--keyframe_interval`-based caching, add `--offload_to_cpu`, drop concurrency. |
| Black/blurry first 50 frames | Dental video starts with the device against the cheek before the patient opens | Mobile capture flow already trims the first 1.5 s; raise this if needed. |
| Reconstruction works but 3DGS step fails | Insufficient parallax (patient barely moved) | Reject scan client-side via IMU motion check before upload. |

## Cost envelope

A 30-second scan on H100 ≈ 30 GPU-seconds for LingBot-Map alone. At Lambda H100 on-demand pricing (~$2.49/hr at time of writing), that's ~$0.02/scan inference cost. 3DGS training adds ~$0.20–0.40/scan. Storage is negligible (~50 MB per scan).

## Local development

The Arcline frontend treats the GPU host as a black-box HTTP service. For local dev, point `VITE_LINGBOT_API_URL` at a stub returning a fixed sample splat — no GPU required to develop the doctor portal or annotation UX.
