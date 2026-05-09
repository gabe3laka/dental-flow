import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { FlipHorizontal, Loader2 } from "lucide-react";
import type { ScanType } from "@/lib/scanning/types";

const MIN_DURATION_SEC = 10;
const TARGET_DURATION_SEC = 25;
const MAX_DURATION_SEC = 45;

const STAGE_GUIDANCE = [
  { upTo: 5,  text: "Open wide — show your upper arch" },
  { upTo: 10, text: "Tilt down — show your lower arch" },
  { upTo: 15, text: "Turn slowly to your left side" },
  { upTo: 20, text: "Now slowly to your right side" },
  { upTo: 25, text: "Hold still on your front smile" },
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
  return "webm";
}

type Phase = "intro" | "recording" | "reviewing" | "uploading" | "processing";

export default function ScanSubmission() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("intro");
  const [scanType, setScanType] = useState<ScanType>("scope");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<string>("video/webm");
  const keyframesRef = useRef<Array<{ tSec: number; blob: Blob }>>([]);
  const keyframeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    setPhase("recording");
  }, [recordedUrl]);

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

      // 1. Upload raw video to scan-videos bucket
      setUploadPercent(10);
      const { error: vidErr } = await supabase.storage
        .from("scan-videos")
        .upload(videoPath, recordedBlob, { contentType: mimeRef.current, upsert: false });
      if (vidErr) throw vidErr;

      // 2. Upload keyframe stills (used by analyze-scan-teeth) — non-fatal on failure
      const keyframeMeta: Array<{ zone: string; path: string; t_sec: number }> = [];
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

      setUploadPercent(80);

      // 3. Insert scans row
      const { data: scanRow, error: insErr } = await supabase
        .from("scans")
        .insert({
          patient_id: patient.id,
          status: "pending",
          source: scanType, // 'scope' | 'wand' — replaces legacy '3d_plus'
          video_url: videoPath,
          zones_captured: keyframeMeta.length > 0 ? keyframeMeta : null,
          // New columns (added by 20260509 migration). Cast keeps this compiling
          // against the older generated types.ts until it's regenerated.
          scan_type: scanType,
          raw_video_url: videoPath,
          processing_status: "queued",
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
      //    the GPU server processes). The Edge Function signs URLs and POSTs
      //    to the LingBot host; if the function isn't deployed yet the scan
      //    still lands in the DB and can be reprocessed manually.
      if (scanRow?.id) {
        try {
          await supabase.functions.invoke("reconstruct-scan", {
            body: { scan_id: scanRow.id, scan_type: scanType },
          });
        } catch (e) {
          logError(e, { operation: "ScanSubmission/dispatchReconstruct", scanId: scanRow.id });
        }

        // 6. Kick off the existing AI analysis on the keyframes, in parallel
        //    with reconstruction. Both update the scans row independently.
        try { await supabase.functions.invoke("analyze-scan-quality", { body: { scan_id: scanRow.id } }); } catch { /* non-blocking */ }
        try {
          await supabase.functions.invoke("analyze-scan-teeth", {
            body: { scan_id: scanRow.id, treatment_plan: (patient as { treatment_category?: string | null }).treatment_category || "Standard" },
          });
        } catch { /* non-blocking */ }
      }

      setUploadPercent(100);
      toast({ title: "Scan uploaded!", description: "Building your 3D map…" });
      navigate(`/patient/scans/${scanRow?.id}/results`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Submission failed";
      logError(e, { operation: "ScanSubmission/handleSubmit", userId: user?.id });
      toast({ title: "Submission failed", description: msg, variant: "destructive" });
      setPhase("reviewing");
    }
  }, [user, recordedBlob, scanType, navigate]);

  /* ────────────────────────────── INTRO ────────────────────────────── */
  if (phase === "intro") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12 max-w-[480px] mx-auto">
        <span className="mono-label text-primary text-[10px] tracking-widest mb-3">DENTAL MAPPING</span>
        <h1 className="font-display text-2xl font-semibold text-foreground mb-3">3D Map Scan</h1>
        <p className="text-muted-foreground text-sm text-center mb-8 leading-relaxed max-w-xs">
          Slowly pan your phone around your mouth for {TARGET_DURATION_SEC} seconds. We turn the video into a 3D map of your teeth.
        </p>

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

        <button
          onClick={() => setPhase("recording")}
          className="w-full py-4 rounded-full bg-primary text-primary-foreground font-mono text-sm tracking-widest uppercase"
        >
          Start Recording
        </button>
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

  /* ────────────────────────────── REVIEWING ────────────────────────── */
  if (phase === "reviewing" && recordedUrl) {
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
            Re-record
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={elapsed < MIN_DURATION_SEC}
            className="flex-1 rounded-pill mono-label bg-primary text-primary-foreground"
          >
            {elapsed < MIN_DURATION_SEC ? `Hold ≥${MIN_DURATION_SEC}s` : "Build 3D Map"}
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
  const recording = !!recorderRef.current && recorderRef.current.state === "recording";
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
