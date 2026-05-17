/**
 * Reference-board composer for the AI Visual Guide.
 *
 * Composes a single 2x3 PNG from up to 6 mouth photos:
 *   Row 1: LEFT SIDE | FRONT VIEW | RIGHT SIDE
 *   Row 2: UPPER ARCH | BITE VIEW | LOWER ARCH
 *
 * Each cell gets a label + a quality dot (sharp / ok / missing). Sharpness is
 * estimated via a cheap variance-of-Laplacian on a downsampled canvas (no deps).
 */

export type BoardCellKey =
  | "left"
  | "front"
  | "right"
  | "upper"
  | "bite"
  | "lower";

export const BOARD_CELLS: { key: BoardCellKey; label: string }[] = [
  { key: "left", label: "LEFT SIDE" },
  { key: "front", label: "FRONT VIEW" },
  { key: "right", label: "RIGHT SIDE" },
  { key: "upper", label: "UPPER ARCH" },
  { key: "bite", label: "BITE VIEW" },
  { key: "lower", label: "LOWER ARCH" },
];

export type CellQuality = "sharp" | "ok" | "missing";

export interface CellAssignment {
  key: BoardCellKey;
  source: HTMLImageElement | HTMLCanvasElement | null;
  quality: CellQuality;
}

const CELL_W = 720;
const CELL_H = 540;
const COLS = 3;
const ROWS = 2;

export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Could not decode ${file.name}`));
      img.src = url;
    });
    return img;
  } finally {
    // keep blob URL alive while caller might still draw it; revoke later
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/** Cheap sharpness estimate: variance of a 3x3 Laplacian on a 128px gray copy. */
export function estimateSharpness(
  src: HTMLImageElement | HTMLCanvasElement,
): number {
  const W = 128;
  const aspect = ("naturalHeight" in src ? src.naturalHeight : src.height) /
    Math.max(1, "naturalWidth" in src ? src.naturalWidth : src.width);
  const H = Math.max(16, Math.round(W * (aspect || 0.75)));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return 0;
  ctx.drawImage(src, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);
  const gray = new Float32Array(W * H);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  // 3x3 Laplacian
  let mean = 0;
  const lap = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const v =
        -gray[i - W - 1] - gray[i - W] - gray[i - W + 1] -
        gray[i - 1] + 8 * gray[i] - gray[i + 1] -
        gray[i + W - 1] - gray[i + W] - gray[i + W + 1];
      lap[i] = v;
      mean += v;
    }
  }
  const n = (W - 2) * (H - 2);
  mean /= n;
  let varSum = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const d = lap[y * W + x] - mean;
      varSum += d * d;
    }
  }
  return varSum / n;
}

export function qualityFor(score: number): CellQuality {
  if (!isFinite(score) || score <= 0) return "missing";
  if (score >= 250) return "sharp";
  return "ok";
}

/** Sample ~N frames evenly from a video file by seeking + drawing to canvas. */
export async function sampleVideoFrames(
  file: File,
  count = 12,
): Promise<HTMLCanvasElement[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not load video"));
  });
  const duration = isFinite(video.duration) ? video.duration : 0;
  const frames: HTMLCanvasElement[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const t = duration > 0 ? ((i + 0.5) / count) * duration : i;
      video.currentTime = Math.min(t, Math.max(0, duration - 0.05));
      await new Promise<void>((resolve) => {
        const onSeek = () => {
          video.removeEventListener("seeked", onSeek);
          resolve();
        };
        video.addEventListener("seeked", onSeek);
      });
      const c = document.createElement("canvas");
      c.width = video.videoWidth || 640;
      c.height = video.videoHeight || 480;
      const ctx = c.getContext("2d");
      if (ctx) ctx.drawImage(video, 0, 0, c.width, c.height);
      frames.push(c);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
  return frames;
}

/** Best-effort filename → cell auto-tag. */
export function autoTagCellFromName(name: string): BoardCellKey | null {
  const n = name.toLowerCase();
  if (n.includes("left")) return "left";
  if (n.includes("right")) return "right";
  if (n.includes("front")) return "front";
  if (n.includes("upper") || n.includes("maxill")) return "upper";
  if (n.includes("lower") || n.includes("mandib")) return "lower";
  if (n.includes("bite") || n.includes("occlu")) return "bite";
  return null;
}

/** Compose a 2x3 board PNG Blob from current assignments. */
export async function composeBoard(
  assignments: Record<BoardCellKey, CellAssignment>,
): Promise<Blob> {
  const W = CELL_W * COLS;
  const H = CELL_H * ROWS;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, W, H);

  BOARD_CELLS.forEach(({ key, label }, idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const x = col * CELL_W;
    const y = row * CELL_H;

    // Cell border
    ctx.strokeStyle = "#262626";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2);

    const a = assignments[key];
    if (a?.source) {
      const srcW = "naturalWidth" in a.source ? a.source.naturalWidth : a.source.width;
      const srcH = "naturalHeight" in a.source ? a.source.naturalHeight : a.source.height;
      // contain-fit
      const scale = Math.min((CELL_W - 8) / srcW, (CELL_H - 60) / srcH);
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      const dx = x + (CELL_W - drawW) / 2;
      const dy = y + 8 + (CELL_H - 60 - drawH) / 2;
      ctx.drawImage(a.source, dx, dy, drawW, drawH);
    } else {
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(x + 8, y + 8, CELL_W - 16, CELL_H - 60);
      ctx.fillStyle = "#666";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("MISSING", x + CELL_W / 2, y + CELL_H / 2);
    }

    // Label strip
    ctx.fillStyle = "#111";
    ctx.fillRect(x + 4, y + CELL_H - 44, CELL_W - 8, 40);
    ctx.fillStyle = "#fafafa";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 16, y + CELL_H - 24);

    // Quality dot
    const q = a?.quality ?? "missing";
    const color = q === "sharp" ? "#22c55e" : q === "ok" ? "#eab308" : "#a3a3a3";
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(x + CELL_W - 24, y + CELL_H - 24, 8, 0, Math.PI * 2);
    ctx.fill();
  });

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode board PNG"))),
      "image/png",
      0.95,
    );
  });
}
