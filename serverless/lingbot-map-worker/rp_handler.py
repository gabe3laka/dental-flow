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
      "metrics":       { "frames_processed": int, "wall_clock_sec": float, ... }
    }

On failure, raises so RunPod posts `status: FAILED` with the error message.

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

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")


# ─── Supabase client (lazy) ──────────────────────────────────────────────────
_supabase: Client | None = None


def supabase() -> Client:
    global _supabase
    if _supabase is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required env vars"
            )
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _supabase


# ─── Helpers ─────────────────────────────────────────────────────────────────
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


def download_video(video_url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(video_url, stream=True, timeout=180) as r:
        r.raise_for_status()
        with dest.open("wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):  # 1 MiB
                if chunk:
                    f.write(chunk)


def find_pointcloud(output_dir: Path) -> Path:
    """LingBot-Map's demo.py / batch_demo.py write `*pointcloud*.ply`."""
    candidates = sorted(output_dir.rglob("*pointcloud*.ply"))
    if not candidates:
        candidates = sorted(output_dir.rglob("*.ply"))
    if not candidates:
        raise RuntimeError(
            f"no .ply file produced under {output_dir} — check LingBot logs"
        )
    return candidates[0]


def run_lingbot(video_path: Path, output_dir: Path, scan_type: str) -> dict[str, Any]:
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

    t0 = time.monotonic()
    proc = subprocess.run(cmd, capture_output=True, text=True)
    wall = time.monotonic() - t0
    if proc.returncode != 0:
        # Surface the tail of stderr so the failure shows up in RunPod logs.
        tail = proc.stderr[-2000:] if proc.stderr else ""
        raise RuntimeError(f"lingbot exited {proc.returncode}: {tail}")

    return {
        "wall_clock_sec": round(wall, 2),
        "scan_type": scan_type,
    }


def upload_pointcloud(local_path: Path, storage_path: str) -> None:
    """Upload .ply to scan-pointclouds bucket via service role."""
    with local_path.open("rb") as f:
        body = f.read()
    # `upsert=True` so a re-run of the same scan overwrites the prior result
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

    scan_id = job_input.get("scan_id")
    video_url = job_input.get("video_url")
    scan_type = (job_input.get("scan_type") or "scope").lower()

    if not scan_id:
        raise RuntimeError("input.scan_id required")
    if not video_url:
        raise RuntimeError("input.video_url required")
    if scan_type not in {"scope", "wand"}:
        raise RuntimeError(f"invalid scan_type {scan_type!r}; expected scope|wand")

    work = SCRATCH / scan_id
    work.mkdir(parents=True, exist_ok=True)
    raw_video = work / "raw_video"  # extension irrelevant to ffmpeg/decoder
    output_dir = work / "out"

    try:
        patient_id = lookup_patient_id(scan_id)
        download_video(video_url, raw_video)

        timing = run_lingbot(raw_video, output_dir, scan_type)

        ply = find_pointcloud(output_dir)
        ply_size = ply.stat().st_size

        storage_path = f"{patient_id}/{scan_id}/pointcloud.ply"
        upload_pointcloud(ply, storage_path)

        return {
            "pointcloud_url": storage_path,
            "metrics": {
                "wall_clock_sec": timing["wall_clock_sec"],
                "ply_bytes": ply_size,
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
        try:
            shutil.rmtree(work, ignore_errors=True)
        except Exception:
            pass


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
