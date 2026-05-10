"""RunPod Serverless handler for the LingBot-Map worker.

Job contract (sent by Arcline's `reconstruct-scan` Edge Function):

    {
      "input": {
        "video_url":   "<signed scan-videos URL>",
        "scan_id":     "<uuid>",
        "scan_type":   "scope" | "wand",
        "callback_url": "<arcline reconstruct-scan-callback URL>"
      }
    }

Return value (becomes `output` in RunPod's webhook payload, which the
`reconstruct-scan-callback` Edge Function then writes to `scans`):

    {
      "pointcloud_url": "<patient_id>/<scan_id>/pointcloud.ply",
      "metrics":       { "wall_clock_sec": float, "ply_bytes": int, ... }
    }

On failure, raises so RunPod posts `status: FAILED` with the error message.
The `callback_url` field is intentionally unused — RunPod's native webhook
(set by the dispatcher's `webhook` field) delivers the result.

Env vars (set on the RunPod endpoint, NOT baked into the image):
  SUPABASE_URL                  project URL
  SUPABASE_SERVICE_ROLE_KEY     for scans lookup + scan-pointclouds upload
  LINGBOT_MODEL_PATH            defaults to /models/lingbot-map-long.pt
  SCRATCH_DIR                   defaults to /scratch
"""

from __future__ import annotations

import os
import shutil
import subprocess
import time
import traceback
from pathlib import Path
from typing import Any

import requests
import runpod
from supabase import Client, create_client

LINGBOT_REPO = Path("/opt/lingbot-map")
MODEL_PATH = Path(os.environ.get("LINGBOT_MODEL_PATH", "/models/lingbot-map-long.pt"))
SCRATCH = Path(os.environ.get("SCRATCH_DIR", "/scratch"))
POINTCLOUD_BUCKET = "scan-pointclouds"


# ─── Tiny helpers for clearer errors + RunPod log visibility ─────────────────
def _require_input(inp: dict, key: str) -> str:
    v = inp.get(key)
    if not isinstance(v, str) or not v:
        raise ValueError(f"input.{key} is required (got {type(v).__name__})")
    return v


def _require_env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise RuntimeError(f"env var {name} is required")
    return v


def _progress(job: dict, msg: str) -> None:
    """Stream a stage update into the RunPod job log."""
    print(msg, flush=True)
    try:
        runpod.serverless.progress_update(job, msg)
    except Exception:
        # Never let log-plumbing failures take down a job.
        pass


# ─── Supabase client (lazy) ──────────────────────────────────────────────────
_supabase: Client | None = None


def supabase() -> Client:
    global _supabase
    if _supabase is None:
        url = _require_env("SUPABASE_URL")
        key = _require_env("SUPABASE_SERVICE_ROLE_KEY")
        _supabase = create_client(url, key)
    return _supabase


# ─── Pipeline steps ──────────────────────────────────────────────────────────
def lookup_patient_id(scan_id: str) -> str:
    """Patient_id is needed for the scan-pointclouds storage path (RLS)."""
    res = (
        supabase()
        .table("scans")
        .select("patient_id")
        .eq("id", scan_id)
        .single()
        .execute()
    )
    if not res.data or "patient_id" not in res.data:
        raise RuntimeError(f"scan {scan_id} not found")
    return res.data["patient_id"]


def download_video(video_url: str, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with requests.get(video_url, stream=True, timeout=180) as r:
        r.raise_for_status()
        with dest.open("wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):  # 1 MiB
                if chunk:
                    f.write(chunk)
                    written += len(chunk)
    return written


def find_pointcloud(output_dir: Path) -> Path:
    """LingBot-Map's demo.py / batch_demo.py write `*pointcloud*.ply`."""
    candidates = sorted(output_dir.rglob("*pointcloud*.ply"))
    if not candidates:
        candidates = sorted(output_dir.rglob("*.ply"))
    if not candidates:
        raise RuntimeError(
            f"no .ply file produced under {output_dir} — check LingBot logs"
        )
    # Prefer the largest file when several .ply siblings exist (e.g. partials).
    candidates.sort(key=lambda p: p.stat().st_size, reverse=True)
    return candidates[0]


def run_lingbot(
    job: dict,
    video_path: Path,
    output_dir: Path,
    scan_type: str,
) -> dict[str, Any]:
    """Invoke LingBot-Map's demo.py. Returns rough timing metrics."""
    output_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "python",
        "-u",
        str(LINGBOT_REPO / "demo.py"),
        "--model_path",
        str(MODEL_PATH),
        "--video_path",
        str(video_path),
        "--fps",
        "15",
        "--keyframe_interval",
        "2",
        "--camera_num_iterations",
        "2",
        "--conf_threshold",
        "1.5",
        "--save_predictions",
        "--output_folder",
        str(output_dir),
    ]
    if scan_type == "wand":
        # Multi-loop arch sweeps exceed the 320-frame RoPE training range.
        cmd += [
            "--mode",
            "windowed",
            "--window_size",
            "128",
            "--overlap_keyframes",
            "16",
        ]
    # Streaming mode is the LingBot default — pass no `--mode` flag for it.

    _progress(job, f"Running LingBot-Map (scan_type={scan_type})…")
    t0 = time.monotonic()
    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    wall = time.monotonic() - t0
    # Echo stdout so RunPod's job log captures the LingBot output for debugging.
    if proc.stdout:
        print(proc.stdout, flush=True)
    if proc.returncode != 0:
        # Surface the tail so the failure shows up in the API response too.
        tail = (proc.stdout or "")[-2000:]
        raise RuntimeError(f"lingbot exited {proc.returncode}: {tail}")

    return {
        "wall_clock_sec": round(wall, 2),
        "scan_type": scan_type,
    }


def upload_pointcloud(local_path: Path, storage_path: str) -> None:
    """Upload .ply to scan-pointclouds bucket via service role."""
    with local_path.open("rb") as f:
        body = f.read()
    # `x-upsert: true` so a re-run of the same scan overwrites the prior result
    # rather than 409-ing.
    supabase().storage.from_(POINTCLOUD_BUCKET).upload(
        path=storage_path,
        file=body,
        file_options={
            "content-type": "application/octet-stream",
            "x-upsert": "true",
        },
    )


# ─── RunPod handler ──────────────────────────────────────────────────────────
def handler(job: dict[str, Any]) -> dict[str, Any]:
    job_input = job.get("input") or {}
    work: Path | None = None

    try:
        scan_id = _require_input(job_input, "scan_id")
        video_url = _require_input(job_input, "video_url")
        scan_type = (job_input.get("scan_type") or "scope").lower()
        if scan_type not in {"scope", "wand"}:
            raise ValueError(f"invalid scan_type {scan_type!r}; expected scope|wand")

        work = SCRATCH / scan_id
        raw_video = work / "raw_video"  # extension irrelevant to ffmpeg/decoder
        output_dir = work / "out"

        _progress(job, f"Creating scratch workspace at {work}…")
        work.mkdir(parents=True, exist_ok=True)

        _progress(job, "Looking up patient_id for storage path…")
        patient_id = lookup_patient_id(scan_id)

        _progress(job, "Downloading input video…")
        bytes_downloaded = download_video(video_url, raw_video)
        _progress(job, f"Downloaded {bytes_downloaded:,} bytes")

        timing = run_lingbot(job, raw_video, output_dir, scan_type)

        _progress(job, "Locating .ply output…")
        ply = find_pointcloud(output_dir)
        ply_size = ply.stat().st_size

        storage_path = f"{patient_id}/{scan_id}/pointcloud.ply"
        _progress(job, f"Uploading {ply_size:,}-byte .ply to {POINTCLOUD_BUCKET}/{storage_path}…")
        upload_pointcloud(ply, storage_path)

        _progress(job, "Done.")
        return {
            "pointcloud_url": storage_path,
            "metrics": {
                "wall_clock_sec": timing["wall_clock_sec"],
                "ply_bytes": ply_size,
                "video_bytes": bytes_downloaded,
                "model": MODEL_PATH.name,
                "scan_type": scan_type,
            },
        }
    except Exception as e:
        # Re-raise so RunPod surfaces status=FAILED with the message; the
        # callback writes it to scans.processing_error.
        traceback.print_exc()
        raise RuntimeError(f"reconstruction failed: {e}") from e
    finally:
        # Best-effort scratch cleanup so workers don't fill up between jobs.
        if work and work.exists():
            try:
                _progress(job, f"Cleaning up {work}…")
                shutil.rmtree(work, ignore_errors=True)
            except Exception:
                pass


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
