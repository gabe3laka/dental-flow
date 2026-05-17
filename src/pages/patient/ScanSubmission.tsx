import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { FlipHorizontal, Loader2, Video, Upload, Camera } from "lucide-react";
import type { ScanType } from "@/lib/scanning/types";
import {
  BOARD_CELLS,
  composeBoard,
  estimateSharpness,
  qualityFor,
  sampleVideoFrames,
  type BoardCellKey,
  type CellAssignment,
} from "@/lib/scanning/referenceBoard";

const MIN_DURATION_SEC = 10;
const TARGET_DURATION_SEC = 34;
const MAX_DURATION_SEC = 45;

// Uploaded-video constraints (Upload Video path only).
const UPLOAD_MIN_DURATION_SEC = 4;
const UPLOAD_MAX_DURATION_SEC = 60;        // hard cap
const UPLOAD_SOFT_WARN_DURATION_SEC = 40;  // soft warning above this
const UPLOAD_MAX_BYTES = 200 * 1024 * 1024;
const UPLOAD_ALLOWED_MIMES = ["video/mp4", "video/webm", "video/quicktime"];

// Build-time feature flag. When false (default) the LingBot GPU pipeline is
// paused: ScanSubmission still uploads video + keyframes, still inserts the
// scans row, still runs analyze-scan-quality / analyze-scan-teeth — it just
// skips the `reconstruct-scan` Edge Function invocation and stores the row
// with processing_status=null instead of "queued" so the UI doesn't sit on
// "BUILDING…" forever. Flip to "true" in build env to re-enable.
// Pipeline gates are now SERVER-SIDE. The client always invokes both edge
// functions; each edge function independently no-ops if its required secrets
// (LINGBOT_API_URL / SPLAT_API_URL + LINGBOT_API_TOKEN) are missing. This
// avoids a Vite rebuild every time we want to flip a pipeline on/off — just
// add or remove the relevant Supabase secret.
const LINGBOT_ENABLED = true;
// SuperSplat pipeline disabled — only LingBot point cloud runs on new scans.
// Flip to true to re-enable gsplat/COLMAP dispatch via reconstruct-splat.
const SPLAT_ENABLED = false;

const STAGE_GUIDANCE = [
  { upTo: 6,  text: "Open wide — show your upper arch" },
  { upTo: 13, text: "Tilt down — show your lower arch" },
  { upTo: 20, text: "Turn slowly to your left side" },
  { upTo: 27, text: "Now slowly to your right side" },
  { upTo: 34, text: "Hold still on your front smile" },
  { upTo: 99, text: "Great — keep the camera steady" },
];

function pickGuidance(elapsed: number): string {
  for (const g of STAGE_GUIDANCE) if (elapsed <= g.upTo) return g.text;
  return STAGE_GUIDANCE[STAGE_GUIDANCE.length - 1].text;
}

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return "video/webm";
}

function extFromMime(mime: string): string {
  if (mime.startsWith("video/mp4")) return "mp4";
  if (mime.startsWith("video/quicktime")) return "mov";
  return "webm";
}

type Phase =
  | "intro"
  | "picker"
  | "recording"
  | "uploading_file"
  | "reviewing"
  | "uploading"
  | "processing";

type InputSource = "live" | "upload_video";

const DISCLAIMER = "For visual guidance only. Not a medical device or diagnosis.";

type PipelineChoice = { lingbot: boolean; splat: boolean; aiGuide: boolean };
const PIPELINE_PREF_KEY = "arcline.lastPipelineChoice.v1";
const DEFAULT_PIPELINES: PipelineChoice = { lingbot: true, splat: false, aiGuide: false };

function loadPipelinePref(): PipelineChoice {
  try {
    const raw = localStorage.getItem(PIPELINE_PREF_KEY);
    if (!raw) return DEFAULT_PIPELINES;
    const parsed = JSON.parse(raw) as Partial<PipelineChoice>;
    return {
      lingbot: parsed.lingbot ?? DEFAULT_PIPELINES.lingbot,
      splat: parsed.splat ?? DEFAULT_PIPELINES.splat,
      aiGuide: parsed.aiGuide ?? DEFAULT_PIPELINES.aiGuide,
    };
  } catch {
    return DEFAULT_PIPELINES;
  }
}

export default function ScanSubmission() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("intro");
  const [scanType, setScanType] = useState<ScanType>("scope");
  const [inputSource, setInputSource] = useState<InputSource>("live");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadFileError, setUploadFileError] = useState<string | null>(null);
  const [uploadedDuration, setUploadedDuration] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<string>("video/webm");
  const keyframesRef = useRef<Array<{ tSec: number; blob: Blob }>>([]);
  const keyframeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Camera init ── */
  useEffect(() => {
    if (phase !== "recording") return;
    let cancelled = false;
    setCameraReady(false);
    setCameraError(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch {
        if (!cancelled) setCameraError(true);
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [phase, facingMode]);

  /* ── Cleanup on unmount ── */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (keyframeTimerRef.current) clearInterval(keyframeTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try { recorderRef.current?.stop(); } catch { /* ignore */ }
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  /* ── Capture keyframe still from the live video ── */
  const captureKeyframe = useCallback(async (tSec: number) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const blob: Blob | null = await new Promise((r) =>
      canvas.toBlob((b) => r(b), "image/jpeg", 0.85)
    );
    if (blob) keyframesRef.current.push({ tSec, blob });
  }, []);

  /* ── Start recording ── */
  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    keyframesRef.current = [];
    setElapsed(0);

    const mime = pickMimeType();
    mimeRef.current = mime;
    const recorder = new MediaRecorder(streamRef.current, { mimeType: mime });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      setRecordedBlob(blob);
      const url = URL.createObjectURL(blob);
      setRecordedUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      setPhase("reviewing");
    };
    recorder.start(250);
    recorderRef.current = recorder;
    setRecording(true);

    timerRef.current = setInterval(() => {
      setElapsed((e) => {
        const next = e + 1;
        if (next >= MAX_DURATION_SEC) stopRecording();
        return next;
      });
    }, 1000);

    // Capture a keyframe every ~3s so the AI analysis still has stills to work on
    // alongside the LingBot point cloud.
    captureKeyframe(0);
    keyframeTimerRef.current = setInterval(() => {
      captureKeyframe(Math.round(performance.now() / 1000));
    }, 3000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureKeyframe]);

  /* ── Stop recording ── */
  const stopRecording = useCallback(() => {
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (keyframeTimerRef.current) { clearInterval(keyframeTimerRef.current); keyframeTimerRef.current = null; }
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const handleRetake = useCallback(() => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setElapsed(0);
    setUploadedDuration(null);
    setUploadFileError(null);
    if (inputSource === "upload_video") {
      setPhase("uploading_file");
    } else {
      setPhase("recording");
    }
  }, [recordedUrl, inputSource]);

  /* ── Validate a user-picked video file ── */
  const handleFilePicked = useCallback(async (file: File) => {
    setUploadFileError(null);
    setUploadedDuration(null);

    if (!UPLOAD_ALLOWED_MIMES.includes(file.type)) {
      setUploadFileError("Unsupported format. Use MP4, WebM, or MOV.");
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      setUploadFileError("File too large. Max 200 MB.");
      return;
    }

    // Probe duration via a hidden <video> element.
    const url = URL.createObjectURL(file);
    const probed = await new Promise<number | null>((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = url;
      v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : null);
      v.onerror = () => resolve(null);
    });

    if (probed == null) {
      URL.revokeObjectURL(url);
      setUploadFileError("Couldn't read this video. Try a different file.");
      return;
    }
    if (probed < UPLOAD_MIN_DURATION_SEC) {
      URL.revokeObjectURL(url);
      setUploadFileError(`Video too short. Minimum ${UPLOAD_MIN_DURATION_SEC}s.`);
      return;
    }
    if (probed > UPLOAD_MAX_DURATION_SEC) {
      URL.revokeObjectURL(url);
      setUploadFileError(
        `Video too long. Maximum ${UPLOAD_MAX_DURATION_SEC}s — please trim and re-upload.`,
      );
      return;
    }
    if (probed > UPLOAD_SOFT_WARN_DURATION_SEC) {
      toast({
        title: "Long video",
        description:
          "Long videos increase the chance reconstruction fails. 30–40 s works best.",
      });
    }

    // Accept — wire up as the recorded blob and move into the shared review phase.
    mimeRef.current = file.type;
    keyframesRef.current = [];
    setRecordedBlob(file);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(url);
    setElapsed(Math.round(probed));
    setUploadedDuration(probed);
    setPhase("reviewing");
  }, [recordedUrl]);

  /* ── Upload via the Supabase SDK (matches the working live-camera path).
     Earlier we used a custom XHR PUT to a signed upload URL to get real byte
     progress, but that returned 400 on some clients (notably iOS .mov via the
     camera roll). Using the SDK upload aligns the upload-video path with the
     proven live-camera path byte-for-byte; we surface coarse progress instead. */
  const uploadFileWithProgress = useCallback(
    async (path: string, blob: Blob, contentType: string): Promise<void> => {
      setUploadPercent(15);
      const { error } = await supabase.storage
        .from("scan-videos")
        .upload(path, blob, { contentType, upsert: false });
      if (error) throw error;
      setUploadPercent(80);
    },
    [],
  );

  /* ── Upload + dispatch reconstruction ── */
  const handleSubmit = useCallback(async () => {
    if (!user || !recordedBlob) return;
    setPhase("uploading");
    setUploadPercent(0);

    try {
      const { data: patient } = await supabase
        .from("patients")
        .select("id, total_scans, treatment_category")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!patient) {
        logError("Patient record not found", { operation: "ScanSubmission/handleSubmit", userId: user?.id });
        throw new Error("Patient record not found");
      }

      const ext = extFromMime(mimeRef.current);
      const scanFolder = `${patient.id}/${Date.now()}`;
      const videoPath = `${scanFolder}/raw_video.${ext}`;

      const isUpload = inputSource === "upload_video";
      const keyframeMeta: Array<{ zone: string; path: string; t_sec: number }> = [];

      if (isUpload) {
        // 1. Upload raw video via XHR for real byte progress.
        await uploadFileWithProgress(videoPath, recordedBlob, mimeRef.current);
        // No client keyframes for uploaded videos in v1.
      } else {
        // 1. Upload raw video to scan-videos bucket
        setUploadPercent(10);
        const { error: vidErr } = await supabase.storage
          .from("scan-videos")
          .upload(videoPath, recordedBlob, { contentType: mimeRef.current, upsert: false });
        if (vidErr) throw vidErr;

        // 2. Upload keyframe stills (used by analyze-scan-teeth) — non-fatal on failure
        for (let i = 0; i < keyframesRef.current.length; i++) {
          const k = keyframesRef.current[i];
          const path = `${scanFolder}/frame-${i.toString().padStart(2, "0")}.jpg`;
          try {
            const { error } = await supabase.storage.from("scan-videos").upload(path, k.blob, {
              contentType: "image/jpeg",
              upsert: false,
            });
            if (!error) keyframeMeta.push({ zone: `FRAME_${i}`, path, t_sec: k.tSec });
          } catch { /* skip individual frame failures */ }
          setUploadPercent(10 + Math.round(((i + 1) / Math.max(keyframesRef.current.length, 1)) * 60));
        }
      }

      setUploadPercent(80);

      // Pipeline contract uses scan_type ('scope' | 'wand'); provenance uses
      // `source`. Uploaded videos run the same splat pipeline as live captures,
      // so persist scan_type = scanType for both paths and only differentiate
      // via `source`.
      const pipelineScanType: ScanType = scanType;
      const sourceTag: string = isUpload ? "upload_video" : scanType;

      // 3. Insert scans row
      const { data: scanRow, error: insErr } = await supabase
        .from("scans")
        .insert({
          patient_id: patient.id,
          status: "pending",
          source: sourceTag,
          video_url: videoPath,
          zones_captured: keyframeMeta.length > 0 ? keyframeMeta : null,
          // New columns (added by 20260509 migration). Cast keeps this compiling
          // against the older generated types.ts until it's regenerated.
          scan_type: pipelineScanType,
          raw_video_url: videoPath,
          // LingBot-aware: only mark "queued" when LingBot is on. With LingBot
          // off no callback ever fires, so leave the status NULL — Progress.tsx
          // treats that as the legacy-scan branch instead of "BUILDING…" forever.
          processing_status: LINGBOT_ENABLED ? "queued" : null,
          // Splat-aware: same pattern. Independent of LINGBOT.
          splat_processing_status: SPLAT_ENABLED ? "queued" : null,
        } as never)
        .select("id")
        .single();
      if (insErr) throw insErr;

      // 4. Bump patient scan count
      await supabase
        .from("patients")
        .update({ total_scans: ((patient as { total_scans?: number | null }).total_scans ?? 0) + 1 })
        .eq("id", patient.id);

      setUploadPercent(90);

      // 5. Dispatch LingBot reconstruction job (non-blocking; UI proceeds while
      //    the GPU server processes). Gated behind VITE_ENABLE_LINGBOT so we
      //    can pause the GPU pipeline without removing the code path.
      if (scanRow?.id) {
          // Dispatch breadcrumbs — surfaces in browser console so we can tell
          // from the client side whether each pipeline branch actually ran.
          console.info("[scan-dispatch] build-env", {
            VITE_ENABLE_SPLAT_raw: import.meta.env.VITE_ENABLE_SPLAT,
            VITE_ENABLE_LINGBOT_raw: import.meta.env.VITE_ENABLE_LINGBOT,
            SPLAT_ENABLED_resolved: import.meta.env.VITE_ENABLE_SPLAT === "true",
            LINGBOT_ENABLED_resolved: import.meta.env.VITE_ENABLE_LINGBOT === "true",
            MODE: import.meta.env.MODE,
          });
          console.info("[scan-dispatch] flags", {
            scan_id: scanRow.id,
            LINGBOT_ENABLED,
            SPLAT_ENABLED,
            isUpload,
            pipelineScanType,
          });
          if (LINGBOT_ENABLED) {
          console.info("[scan-dispatch] invoking reconstruct-scan", { scan_id: scanRow.id });
          try {
            await supabase.functions.invoke("reconstruct-scan", {
                body: { scan_id: scanRow.id, scan_type: pipelineScanType },
            });
            console.info("[scan-dispatch] reconstruct-scan invoke returned", { scan_id: scanRow.id });
          } catch (e) {
            console.error("[scan-dispatch] reconstruct-scan threw", e);
            logError(e, {
              operation: "ScanSubmission/dispatchReconstruct",
              extra: { scanId: scanRow.id },
            });
          }
        }

        // 5b. Dispatch splat (gsplat + COLMAP) reconstruction job. Non-blocking,
        //     completely independent of lingbot — both can land terminal callbacks
        //     on the same scan; the callback routes by ?pipeline=splat.
        if (SPLAT_ENABLED) {
          console.info("[scan-dispatch] invoking reconstruct-splat", { scan_id: scanRow.id });
          try {
            await supabase.functions.invoke("reconstruct-splat", {
              body: { scan_id: scanRow.id, scan_type: pipelineScanType },
            });
            console.info("[scan-dispatch] reconstruct-splat invoke returned", { scan_id: scanRow.id });
          } catch (e) {
            console.error("[scan-dispatch] reconstruct-splat threw", e);
            logError(e, {
              operation: "ScanSubmission/dispatchSplat",
              extra: { scanId: scanRow.id },
            });
          }
        } else {
          console.warn("[scan-dispatch] SPLAT_ENABLED is false — skipping reconstruct-splat. Set VITE_ENABLE_SPLAT=true in build env.");
        }

        // 6. Kick off the existing AI analysis on the keyframes, in parallel
        //    with reconstruction. Both update the scans row independently.
        try { await supabase.functions.invoke("analyze-scan-quality", { body: { scan_id: scanRow.id } }); } catch { /* non-blocking */ }
        // TODO(phase2): extract keyframes from uploaded video to restore analyze-scan-teeth.
        if (!isUpload) {
          try {
            await supabase.functions.invoke("analyze-scan-teeth", {
              body: { scan_id: scanRow.id, treatment_plan: (patient as { treatment_category?: string | null }).treatment_category || "Standard" },
            });
          } catch { /* non-blocking */ }
        }
      }

      setUploadPercent(100);
      toast({
        title: "Scan uploaded!",
        description: (LINGBOT_ENABLED || SPLAT_ENABLED) ? "Building your 3D map…" : "Analyzing your scan…",
      });
      navigate(`/patient/scans/${scanRow?.id}/results`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Submission failed";
      logError(e, { operation: "ScanSubmission/handleSubmit", userId: user?.id });
      toast({ title: "Submission failed", description: msg, variant: "destructive" });
      setPhase("reviewing");
    }
  }, [user, recordedBlob, scanType, inputSource, navigate, uploadFileWithProgress]);

  /* ────────────────────────────── INTRO ────────────────────────────── */
  if (phase === "intro") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12 max-w-[480px] mx-auto">
        <span className="mono-label text-primary text-[10px] tracking-widest mb-3">DENTAL MAPPING</span>
        <h1 className="font-display text-2xl font-semibold text-foreground mb-3">3D Map Scan</h1>
        <p className="text-muted-foreground text-sm text-center mb-8 leading-relaxed max-w-xs">
          Slowly pan your phone around your mouth for {TARGET_DURATION_SEC} seconds. We turn the video into a 3D map of your teeth.
        </p>

        {/* Persistent disclaimer */}
        <div className="w-full mb-6 rounded-card border border-border bg-muted/30 px-3 py-2">
          <span className="mono-label text-muted-foreground text-[10px]">DISCLAIMER</span>
          <p className="text-xs text-foreground mt-0.5">{DISCLAIMER}</p>
        </div>

        {/* Scope vs Wand chooser */}
        <div className="w-full mb-8">
          <span className="mono-label text-muted-foreground block mb-2">CAPTURE DEVICE</span>
          <div className="grid grid-cols-2 gap-2">
            {(["scope", "wand"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setScanType(t)}
                className={`rounded-card border px-3 py-3 text-left transition ${
                  scanType === t ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <span className="mono-label text-[10px] text-primary block">
                  {t === "scope" ? "ARCLINE SCOPE" : "ARCLINE WAND"}
                </span>
                <span className="text-xs text-foreground mt-1 block">
                  {t === "scope" ? "Phone + clip-on lens (exterior)" : "Tethered wand (interior)"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Input picker */}
        <div className="w-full mb-4 grid grid-cols-1 gap-2">
          <button
            onClick={() => { setInputSource("live"); setPhase("recording"); }}
            className="rounded-card border border-border bg-card hover:border-primary/40 px-4 py-3 flex items-center gap-3 text-left transition"
          >
            <Camera className="w-4 h-4 text-primary" />
            <span className="flex-1">
              <span className="mono-label text-[10px] text-primary block">LIVE CAMERA</span>
              <span className="text-xs text-foreground mt-0.5 block">
                Record a {TARGET_DURATION_SEC}s scan with your phone camera
              </span>
            </span>
          </button>
          <button
            onClick={() => {
              setInputSource("upload_video");
              setUploadFileError(null);
              setPhase("uploading_file");
            }}
            className="rounded-card border border-border bg-card hover:border-primary/40 px-4 py-3 flex items-center gap-3 text-left transition"
          >
            <Video className="w-4 h-4 text-primary" />
            <span className="flex-1">
              <span className="mono-label text-[10px] text-primary block">UPLOAD VIDEO</span>
              <span className="text-xs text-foreground mt-0.5 block">
                Pick a short clip ({UPLOAD_MIN_DURATION_SEC}–{UPLOAD_MAX_DURATION_SEC}s) from your device
              </span>
            </span>
          </button>
        </div>

        <button
          onClick={() => navigate(-1)}
          className="mt-4 font-mono text-xs text-muted-foreground hover:text-foreground transition"
        >
          Cancel
        </button>

        <PatientBottomNav />
      </div>
    );
  }

  /* ────────────────────────────── UPLOAD FILE PICKER ────────────────── */
  if (phase === "uploading_file") {
    return (
      <div className="min-h-screen bg-background px-6 py-10 max-w-[480px] mx-auto pb-28">
        <button
          onClick={() => setPhase("intro")}
          className="mono-label text-muted-foreground hover:text-foreground text-[11px] mb-4 inline-flex items-center gap-1"
        >
          ← BACK
        </button>
        <span className="mono-label text-primary block mb-2">UPLOAD VIDEO</span>
        <h1 className="font-display text-xl font-semibold text-foreground mb-3">
          Pick a short video
        </h1>
        <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
          MP4, WebM, or MOV · {UPLOAD_MIN_DURATION_SEC}–{UPLOAD_MAX_DURATION_SEC} seconds · up to 200 MB.
          For best results, slowly pan around your mouth.
        </p>

        <div className="rounded-card border border-border bg-muted/30 px-3 py-2 mb-6">
          <span className="mono-label text-muted-foreground text-[10px]">DISCLAIMER</span>
          <p className="text-xs text-foreground mt-0.5">{DISCLAIMER}</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFilePicked(f);
            // Reset so picking the same file twice still fires onChange.
            e.target.value = "";
          }}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-card border border-dashed border-border bg-card hover:border-primary/60 transition px-4 py-10 flex flex-col items-center gap-3"
        >
          <Upload className="w-6 h-6 text-primary" />
          <span className="mono-label text-[11px] text-foreground">CHOOSE A VIDEO</span>
          <span className="text-xs text-muted-foreground">From your camera roll or files</span>
        </button>

        {uploadFileError && (
          <div className="mt-4 rounded-card border border-destructive/40 bg-destructive/5 px-3 py-2">
            <span className="mono-label text-destructive text-[10px]">CAN'T USE THIS FILE</span>
            <p className="text-xs text-foreground mt-0.5">{uploadFileError}</p>
          </div>
        )}

        <PatientBottomNav />
      </div>
    );
  }

  /* ────────────────────────────── REVIEWING ────────────────────────── */
  if (phase === "reviewing" && recordedUrl) {
    const isUpload = inputSource === "upload_video";
    const effectiveMin = isUpload ? UPLOAD_MIN_DURATION_SEC : MIN_DURATION_SEC;
    return (
      <div className="min-h-screen bg-background px-5 py-8 max-w-[480px] mx-auto pb-28">
        <span className="mono-label text-primary block mb-2">REVIEW SCAN</span>
        <h1 className="font-display text-xl font-semibold text-foreground mb-5">Looks good?</h1>

        <div className="aspect-[3/4] rounded-card overflow-hidden bg-card border border-border mb-4">
          <video
            ref={previewRef}
            src={recordedUrl}
            className="w-full h-full object-cover bg-black"
            controls
            playsInline
          />
        </div>

        <div className="flex items-center justify-between text-sm mb-6">
          <span className="mono-label text-muted-foreground">DURATION</span>
          <span className="font-mono text-foreground">{elapsed}s</span>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleRetake} variant="outline" className="flex-1 rounded-pill mono-label">
            {isUpload ? "Pick different video" : "Re-record"}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={elapsed < effectiveMin}
            className="flex-1 rounded-pill mono-label bg-primary text-primary-foreground"
          >
            {elapsed < effectiveMin ? `Need ≥${effectiveMin}s` : "Build 3D Map"}
          </Button>
        </div>

        <PatientBottomNav />
      </div>
    );
  }

  /* ────────────────────────────── UPLOADING / PROCESSING ───────────── */
  if (phase === "uploading") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-8 px-8">
        <div className="relative w-28 h-28">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: "1.5s" }} />
          <div className="absolute inset-3 rounded-full bg-primary/25 animate-pulse" />
          <div className="absolute inset-6 rounded-full bg-primary/40 flex items-center justify-center">
            <span className="font-mono text-primary text-xs font-bold">3D</span>
          </div>
        </div>
        <div className="text-center space-y-2">
          <span className="font-mono text-white text-base tracking-widest block">UPLOADING SCAN · {uploadPercent}%</span>
          <p className="text-white/40 text-xs tracking-wide">Building your 3D map next</p>
        </div>
        <Loader2 className="w-4 h-4 text-white/50 animate-spin" />
      </div>
    );
  }

  /* ────────────────────────────── RECORDING ────────────────────────── */
  const progress = Math.min(elapsed / TARGET_DURATION_SEC, 1);
  const guidance = pickGuidance(elapsed);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        style={{ display: cameraReady ? "block" : "none" }}
      />

      {!cameraReady && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-white/50 text-xs tracking-widest">STARTING CAMERA…</span>
        </div>
      )}
      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8">
          <span className="font-mono text-white/50 text-xs tracking-widest">CAMERA UNAVAILABLE</span>
          <p className="text-white/30 text-xs text-center">Grant camera permissions to record a scan.</p>
          <button onClick={() => navigate(-1)} className="font-mono text-white/50 text-xs border border-white/20 px-4 py-2 rounded-full">
            Go Back
          </button>
        </div>
      )}

      {/* Framing rectangle */}
      <div className="absolute inset-[10%] rounded-2xl border border-white/20 pointer-events-none" />

      {/* Top guidance */}
      <div className="absolute top-12 left-0 right-0 text-center pointer-events-none px-8">
        <span className="font-mono text-white/55 text-[10px] tracking-widest">
          {recording ? "RECORDING" : "READY"}
        </span>
        <p className="font-mono text-white text-sm tracking-wider mt-0.5">
          {recording ? guidance : "Hold steady — tap below to record"}
        </p>
      </div>

      {/* Cancel */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-12 left-4 z-20 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center"
        aria-label="Cancel scan"
      >
        <span className="text-white text-lg leading-none">×</span>
      </button>

      {/* Camera flip */}
      {cameraReady && !recording && (
        <button
          onClick={() => setFacingMode((m) => (m === "environment" ? "user" : "environment"))}
          className="absolute top-12 right-4 z-20 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center"
          aria-label="Flip camera"
        >
          <FlipHorizontal className="w-4 h-4 text-white" />
        </button>
      )}

      {/* Progress ring at bottom */}
      <div className="absolute bottom-0 left-0 right-0 pb-12 flex flex-col items-center gap-4">
        <div className="w-full max-w-xs px-8">
          <div className="h-[3px] bg-white/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="font-mono text-white/45 text-[10px] tracking-widest">{elapsed}s</span>
            <span className="font-mono text-white/45 text-[10px] tracking-widest">TARGET {TARGET_DURATION_SEC}s</span>
          </div>
        </div>

        {!recording ? (
          <button
            onClick={startRecording}
            disabled={!cameraReady}
            className="w-20 h-20 rounded-full bg-primary text-primary-foreground border-4 border-white/30 disabled:opacity-50"
            aria-label="Start recording"
          >
            <span className="font-mono text-xs tracking-widest">REC</span>
          </button>
        ) : (
          <button
            onClick={stopRecording}
            disabled={elapsed < MIN_DURATION_SEC}
            className="w-20 h-20 rounded-full bg-white text-black border-4 border-white/30 disabled:opacity-50"
            aria-label="Stop recording"
          >
            <span className="block w-7 h-7 mx-auto rounded-md bg-red-500" />
          </button>
        )}

        <span className="font-mono text-white/35 text-[10px] tracking-widest">
          {scanType.toUpperCase()} · {Math.max(0, MIN_DURATION_SEC - elapsed)}s MORE TO UNLOCK STOP
        </span>
      </div>
    </div>
  );
}
