# LingBot-Map worker for RunPod Serverless.
#
# Build:    docker build -t lingbot-map-worker .
# Push:     docker push <registry>/lingbot-map-worker
# Deploy:   point a RunPod Serverless endpoint at the pushed image.
#
# Required GPU at runtime: any single CUDA 12.x card with ≥24 GB VRAM
# (H100 / A100 / 4090). RunPod handles selection.
#
# Env vars expected at runtime (set in the RunPod endpoint config — NOT baked
# into the image):
#   SUPABASE_URL              project URL, e.g. https://xxxx.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY service role key (for storage upload + scan lookup)
#   LINGBOT_MODEL_PATH        defaults to /models/lingbot-map-long.pt
#   SCRATCH_DIR               defaults to /scratch
#
# The Supabase callback (reconstruct-scan-callback) is invoked by RunPod's
# native webhook — this worker does NOT call it. The handler returns a dict
# that RunPod posts as the `output` field; the callback function reads
# `output.pointcloud_url` to update the scans row.

FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HUB_ENABLE_HF_TRANSFER=1

# ─── System deps ─────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.10 python3.10-venv python3-pip \
        git ffmpeg ca-certificates curl build-essential \
    && ln -sf /usr/bin/python3.10 /usr/bin/python \
    && ln -sf /usr/bin/python3.10 /usr/bin/python3 \
    && python -m pip install --upgrade pip setuptools wheel \
    && rm -rf /var/lib/apt/lists/*

# ─── PyTorch (CUDA 12.8 — required for LingBot's pinned wheel set) ───────────
RUN python -m pip install \
        torch==2.8.0 torchvision==0.23.0 \
        --index-url https://download.pytorch.org/whl/cu128

# ─── LingBot-Map ─────────────────────────────────────────────────────────────
# Pin to a specific commit before going to production. Using `main` here so
# fresh builds pick up upstream fixes during integration; flip this to a
# `git checkout <sha>` after the first successful end-to-end scan.
WORKDIR /opt
RUN git clone https://github.com/robbyant/lingbot-map.git \
    && cd lingbot-map \
    && python -m pip install -e .

# ─── FlashInfer (paged KV cache attention) ───────────────────────────────────
RUN python -m pip install --index-url https://pypi.org/simple flashinfer-python \
    && python -m pip install flashinfer-jit-cache \
        -f https://flashinfer.ai/whl/cu128/flashinfer-jit-cache/ \
    || echo "flashinfer-jit-cache not available; will JIT on first call"

# ─── Worker deps ─────────────────────────────────────────────────────────────
RUN python -m pip install \
        runpod>=1.6.0 \
        supabase>=2.5.0 \
        requests>=2.32.0 \
        huggingface_hub[hf_transfer]>=0.24.0

# ─── Pre-download the model so cold starts don't pay the download cost ───────
ENV LINGBOT_MODEL_PATH=/models/lingbot-map-long.pt
RUN mkdir -p /models \
    && python -c "from huggingface_hub import hf_hub_download; \
                  p = hf_hub_download(repo_id='robbyant/lingbot-map', \
                                      filename='lingbot-map-long.pt', \
                                      local_dir='/models', \
                                      local_dir_use_symlinks=False); \
                  print('downloaded', p)"

# ─── Worker code ─────────────────────────────────────────────────────────────
WORKDIR /app
COPY rp_handler.py /app/rp_handler.py

ENV SCRATCH_DIR=/scratch
RUN mkdir -p ${SCRATCH_DIR}

# RunPod expects the handler to be the container's main process.
CMD ["python", "-u", "/app/rp_handler.py"]
