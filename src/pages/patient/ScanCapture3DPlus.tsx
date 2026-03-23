import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { Loader2, FlipHorizontal, Camera, Crosshair, Sparkles } from "lucide-react";

/* ─── Zone config ─── */
const ZONES = [
  { id: "FRONT_SMILE", label: "Front Smile",  instruction: "Face camera straight — show all front teeth, lips apart" },
  { id: "UPPER_ARCH",  label: "Upper Arch",   instruction: "Tilt head back, open wide — upper teeth facing camera" },
  { id: "LOWER_ARCH",  label: "Lower Arch",   instruction: "Tilt chin down, open wide — lower teeth facing camera" },
  { id: "LEFT_BITE",   label: "Left Bite",    instruction: "Turn slightly left — show left side bite" },
  { id: "RIGHT_BITE",  label: "Right Bite",   instruction: "Turn slightly right — show right side bite" },
  { id: "UPPER_CLOSE", label: "Upper Close",  instruction: "Move closer — show upper front teeth and gumline" },
  { id: "LOWER_CLOSE", label: "Lower Close",  instruction: "Move closer — show lower front teeth and gumline" },
];

/* ─── Target positions per zone (% of screen) ─── */
const ZONE_TARGETS: Record<string, { x: number; y: number }> = {
  FRONT_SMILE:  { x: 50, y: 50 },
  UPPER_ARCH:   { x: 50, y: 35 },
  LOWER_ARCH:   { x: 50, y: 65 },
  LEFT_BITE:    { x: 35, y: 50 },
  RIGHT_BITE:   { x: 65, y: 50 },
  UPPER_CLOSE:  { x: 50, y: 42 },
  LOWER_CLOSE:  { x: 50, y: 58 },
};

const STABLE_HOLD_MS = 3000;
const QUALITY_INTERVAL_MS = 150;
const MOTION_THRESHOLD = 18;
const SAMPLE_SIZE = 32;
const DENSE_INTERVAL_S = 0.75; // extract a dense frame every 0.75s

/* ─── TargetDot ─── */
function TargetDot({ progress, active, zoneCaptured }: { progress: number; active: boolean; zoneCaptured: boolean }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(progress, 1);
  const ringColor = zoneCaptured ? "#4ade80" : active ? "#4ade80" : "#3b82f6";
  const bgColor   = zoneCaptured ? "rgba(74,222,128,0.22)" : active ? "rgba(74,222,128,0.12)" : "rgba(59,130,246,0.15)";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
      <div className="absolute inset-0 rounded-full transition-all duration-300" style={{ background: bgColor }} />
      <svg className="-rotate-90 absolute inset-0" width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={ringColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - dash}
          style={{ transition: "stroke-dashoffset 0.1s linear, stroke 0.25s" }}
        />
      </svg>
      <div
        className="w-3 h-3 rounded-full transition-all duration-300"
        style={{ background: ringColor, opacity: active || zoneCaptured ? 1 : 0.55 }}
      />
    </div>
  );
}

/* ─── QualityDot ─── */
function QualityDot({ label, pass }: { label: string; pass: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <div className={`w-1.5 h-1.5 rounded-full ${pass ? "bg-green-400" : "bg-white/30"}`} />
      <span className={`font-mono text-[9px] tracking-widest ${pass ? "text-green-400" : "text-white/30"}`}>{label}</span>
    </div>
  );
}

/* ─── Helpers ─── */
function pickMimeType(): string {
  for (const m of ["video/webm;codecs=vp8", "video/mp4", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "video/webm";
}

function seekAndDraw(
  videoEl: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  timeSec: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    videoEl.currentTime = timeSec;
    videoEl.addEventListener(
      "seeked",
      () => {
        ctx.drawImage(videoEl, 0, 0);
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82);
      },
      { once: true }
    );
  });
}

/* ─── Main component ─── */
type Phase = "intro" | "capture" | "processing";

export default function ScanCapture3DPlus() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>("intro");
  const [currentZone, setCurrentZone] = useState(0);
  const [captured, setCaptured] = useState<(Blob | null)[]>(new Array(ZONES.length).fill(null));
  const [thumbUrls, setThumbUrls] = useState<(string | null)[]>(new Array(ZONES.length).fill(null));
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [stableMs, setStableMs] = useState(0);
  const [brightnessOk, setBrightnessOk] = useState(false);
  const [motionOk, setMotionOk] = useState(false);
  const [capturedFlash, setCapturedFlash] = useState(false);
  const [processingStep, setProcessingStep] = useState(0); // 0=idle,1=extractZone,2=extractDense,3=upload,4=analyze

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const qualityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const stableAccRef = useRef(0);
  const capturedRef = useRef(captured);
  const currentZoneRef = useRef(currentZone);

  // Video recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const captureTimestampsRef = useRef<number[]>([]); // ms offset into video at each zone capture
  const recordingStartRef = useRef<number>(0);
  const mimeTypeRef = useRef<string>("video/webm");

  useEffect(() => { capturedRef.current = captured; }, [captured]);
  useEffect(() => { currentZoneRef.current = currentZone; }, [currentZone]);

  /* ── Camera init ── */
  useEffect(() => {
    if (phase !== "capture") return;
    let cancelled = false;
    setCameraReady(false);
    setCameraError(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    // Stop any previous recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    videoChunksRef.current = [];
    captureTimestampsRef.current = [];

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
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
    };
  }, [phase, facingMode]);

  /* ── Start MediaRecorder once camera is ready ── */
  useEffect(() => {
    if (!cameraReady || phase !== "capture" || !streamRef.current) return;

    const mimeType = pickMimeType();
    mimeTypeRef.current = mimeType;

    try {
      const recorder = new MediaRecorder(streamRef.current, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };
      recorder.start(200); // 200ms timeslices
      recordingStartRef.current = Date.now();
      mediaRecorderRef.current = recorder;
    } catch {
      // MediaRecorder unavailable — capture still works, dense frames won't be extracted
      mediaRecorderRef.current = null;
    }
  }, [cameraReady, phase]);

  /* ── Quality loop ── */
  const sampleCanvas = useRef<HTMLCanvasElement | null>(null);

  const runQualityCheck = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    if (!sampleCanvas.current) {
      sampleCanvas.current = document.createElement("canvas");
      sampleCanvas.current.width = SAMPLE_SIZE;
      sampleCanvas.current.height = SAMPLE_SIZE;
    }
    const ctx = sampleCanvas.current.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;

    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    const brightness = sum / (SAMPLE_SIZE * SAMPLE_SIZE);
    const bOk = brightness > 35 && brightness < 225;

    let motionSum = 0;
    if (prevFrameRef.current) {
      for (let i = 0; i < data.length; i += 4) motionSum += Math.abs(data[i] - prevFrameRef.current[i]);
    }
    const motionScore = motionSum / (SAMPLE_SIZE * SAMPLE_SIZE);
    const mOk = prevFrameRef.current ? motionScore < MOTION_THRESHOLD : false;

    prevFrameRef.current = new Uint8ClampedArray(data);
    setBrightnessOk(bOk);
    setMotionOk(mOk);

    const qualityPass = bOk && mOk;
    if (qualityPass) {
      stableAccRef.current += QUALITY_INTERVAL_MS;
      setStableMs(stableAccRef.current);
      if (stableAccRef.current >= STABLE_HOLD_MS) {
        stableAccRef.current = 0;
        setStableMs(0);
        triggerCapture();
      }
    } else {
      stableAccRef.current = 0;
      setStableMs(0);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!cameraReady || phase !== "capture") return;
    qualityTimerRef.current = setInterval(runQualityCheck, QUALITY_INTERVAL_MS);
    return () => { if (qualityTimerRef.current) clearInterval(qualityTimerRef.current); };
  }, [cameraReady, phase, runQualityCheck]);

  /* ── Capture frame (live video snapshot for thumbnail) ── */
  const captureFrame = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      if (!video) { resolve(null); return; }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 960;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.88);
    });
  }, []);

  const triggerCapture = useCallback(async () => {
    const zone = currentZoneRef.current;

    // Record timestamp offset into recording
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      captureTimestampsRef.current.push(Date.now() - recordingStartRef.current);
    } else {
      captureTimestampsRef.current.push(0);
    }

    const blob = await captureFrame();
    const blobToStore = blob ?? new Blob();

    setCapturedFlash(true);
    setTimeout(() => setCapturedFlash(false), 350);

    setCaptured((prev) => {
      const next = [...prev];
      next[zone] = blobToStore;
      return next;
    });

    if (blob) {
      setThumbUrls((prev) => {
        const next = [...prev];
        if (next[zone]) URL.revokeObjectURL(next[zone]!);
        next[zone] = URL.createObjectURL(blob);
        return next;
      });
    }

    if (zone < ZONES.length - 1) {
      setCurrentZone(zone + 1);
      stableAccRef.current = 0;
      setStableMs(0);
      prevFrameRef.current = null;
    } else {
      if (qualityTimerRef.current) clearInterval(qualityTimerRef.current);
      // Stop recorder — triggers data flush
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      setPhase("processing");
    }
  }, [captureFrame]);

  const handleManualCapture = useCallback(() => {
    stableAccRef.current = 0;
    setStableMs(0);
    triggerCapture();
  }, [triggerCapture]);

  /* ── Submit (runs when phase becomes "processing") ── */
  useEffect(() => {
    if (phase !== "processing") return;
    const timer = setTimeout(() => handleSubmit(), 400);
    return () => clearTimeout(timer);
  }, [phase]); // eslint-disable-line

  const handleSubmit = async () => {
    if (!user) return;
    try {
      const { data: patient } = await supabase
        .from("patients")
        .select("id, total_scans, treatment_category")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!patient) throw new Error("Patient record not found");

      const timestamp = Date.now();
      const base = `${patient.id}/${timestamp}/3dplus`;
      const mimeType = mimeTypeRef.current;
      const videoExt = mimeType.includes("mp4") ? "mp4" : "webm";

      // ── Build video blob from chunks ──
      const videoBlob = videoChunksRef.current.length > 0
        ? new Blob(videoChunksRef.current, { type: mimeType })
        : null;

      // ── Step 1: Extract zone frames from video ──
      setProcessingStep(1);
      let zoneFrameBlobs: (Blob | null)[] = capturedRef.current.slice(); // fallback = live snapshots

      if (videoBlob && videoBlob.size > 0) {
        try {
          const videoEl = document.createElement("video");
          videoEl.src = URL.createObjectURL(videoBlob);
          await new Promise<void>((res) => {
            videoEl.onloadedmetadata = () => res();
            videoEl.onerror = () => res();
          });

          const canvas = document.createElement("canvas");
          canvas.width = videoEl.videoWidth || 1280;
          canvas.height = videoEl.videoHeight || 960;
          const ctx = canvas.getContext("2d")!;

          const videoDurationMs = (videoEl.duration || 10) * 1000;
          const frames: (Blob | null)[] = [];
          for (let i = 0; i < ZONES.length; i++) {
            const tsMs = captureTimestampsRef.current[i] ?? 0;
            // Clamp timestamp to video duration with 200ms buffer
            const clampedSec = Math.min(Math.max(tsMs / 1000, 0.05), (videoDurationMs / 1000) - 0.05);
            const b = await seekAndDraw(videoEl, canvas, ctx, clampedSec);
            frames.push(b);
          }
          // Only replace if we got valid blobs
          if (frames.some((b) => b !== null)) zoneFrameBlobs = frames;

          // ── Step 2: Extract dense frames ──
          setProcessingStep(2);
          const denseTimestamps: number[] = [];
          for (let t = DENSE_INTERVAL_S / 2; t < videoEl.duration - DENSE_INTERVAL_S / 2; t += DENSE_INTERVAL_S) {
            denseTimestamps.push(t);
          }

          const denseBlobs: Blob[] = [];
          for (const t of denseTimestamps) {
            const b = await seekAndDraw(videoEl, canvas, ctx, t);
            if (b) denseBlobs.push(b);
          }

          URL.revokeObjectURL(videoEl.src);

          // ── Step 3: Upload video + frames ──
          setProcessingStep(3);

          // Upload raw video
          let videoPath: string | null = null;
          if (videoBlob.size > 0) {
            videoPath = `${base}/mouth_video.${videoExt}`;
            const { error: vidErr } = await supabase.storage
              .from("scan-videos")
              .upload(videoPath, videoBlob, { contentType: mimeType });
            if (vidErr) throw vidErr;
          }

          // Upload zone frames
          const zonesMeta: Array<{ zone: string; path: string | null; quality?: number }> = [];
          for (let i = 0; i < ZONES.length; i++) {
            const blob = zoneFrameBlobs[i];
            if (!blob || blob.size === 0) {
              zonesMeta.push({ zone: ZONES[i].id, path: null });
              continue;
            }
            const path = `${base}/zone-${i}.jpg`;
            const { error } = await supabase.storage
              .from("scan-videos")
              .upload(path, blob, { contentType: "image/jpeg" });
            if (error) throw error;
            zonesMeta.push({ zone: ZONES[i].id, path });
          }

          // Upload dense frames
          for (let i = 0; i < denseBlobs.length; i++) {
            const path = `${base}/dense-${i}.jpg`;
            const { error } = await supabase.storage
              .from("scan-videos")
              .upload(path, denseBlobs[i], { contentType: "image/jpeg" });
            if (error) throw error;
            // quality field stores fraction × 1000 (0–1000) for sphere interpolation
            const fraction = videoEl.duration > 0 ? denseTimestamps[i] / videoEl.duration : i / denseBlobs.length;
            zonesMeta.push({ zone: `DENSE_${i}`, path, quality: Math.round(fraction * 1000) });
          }

          // ── Step 4: Insert scan + analyze ──
          setProcessingStep(4);
          const { data: scanRow, error: insertError } = await supabase
            .from("scans")
            .insert({
              patient_id: patient.id,
              status: "pending",
              source: "3d_plus",
              video_url: videoPath ?? zonesMeta[0]?.path ?? null,
              zones_captured: zonesMeta,
            })
            .select("id")
            .single();
          if (insertError) throw insertError;

          await supabase
            .from("patients")
            .update({ total_scans: ((patient as any).total_scans ?? 0) + 1 })
            .eq("id", patient.id);

          if (scanRow?.id) {
            try { await supabase.functions.invoke("analyze-scan-quality", { body: { scan_id: scanRow.id } }); } catch { /* non-blocking */ }
            try { await supabase.functions.invoke("analyze-scan-teeth", { body: { scan_id: scanRow.id, treatment_plan: (patient as any).treatment_category || "Standard" } }); } catch { /* non-blocking */ }
          }

          toast({ title: "3D+ Scan complete!", description: "AI is personalizing your 3D map." });
          navigate(`/patient/scans/${scanRow?.id}/results`);
          return;
        } catch (videoErr) {
          // Video processing failed — fall through to legacy path
          logError(videoErr, { operation: "ScanCapture3DPlus/videoProcessing" });
        }
      }

      // ── Legacy path (no video or video failed): upload live snapshots only ──
      setProcessingStep(3);
      const zonesMeta: Array<{ zone: string; path: string | null }> = [];
      for (let i = 0; i < ZONES.length; i++) {
        const blob = capturedRef.current[i];
        if (!blob || blob.size === 0) {
          zonesMeta.push({ zone: ZONES[i].id, path: null });
          continue;
        }
        const path = `${base}/zone-${i}.jpg`;
        const { error } = await supabase.storage
          .from("scan-videos")
          .upload(path, blob, { contentType: "image/jpeg" });
        if (error) throw error;
        zonesMeta.push({ zone: ZONES[i].id, path });
      }

      const { data: scanRow, error: insertError } = await supabase
        .from("scans")
        .insert({
          patient_id: patient.id,
          status: "pending",
          source: "3d_plus",
          video_url: zonesMeta[0]?.path ?? null,
          zones_captured: zonesMeta,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      await supabase
        .from("patients")
        .update({ total_scans: ((patient as any).total_scans ?? 0) + 1 })
        .eq("id", patient.id);

      if (scanRow?.id) {
        try { await supabase.functions.invoke("analyze-scan-quality", { body: { scan_id: scanRow.id } }); } catch { /* non-blocking */ }
        try { await supabase.functions.invoke("analyze-scan-teeth", { body: { scan_id: scanRow.id, treatment_plan: (patient as any).treatment_category || "Standard" } }); } catch { /* non-blocking */ }
      }

      toast({ title: "3D+ Scan complete!", description: "AI is personalizing your 3D map." });
      navigate(`/patient/scans/${scanRow?.id}/results`);
    } catch (e: any) {
      logError(e, { operation: "ScanCapture3DPlus/submit", userId: user?.id });
      toast({ title: "Submission failed", description: e.message, variant: "destructive" });
      setPhase("capture");
      setProcessingStep(0);
    }
  };

  /* ────────────────────────────── RENDER ────────────────────────────── */

  /* Intro */
  if (phase === "intro") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12 max-w-[480px] mx-auto">
        <span className="mono-label text-primary text-[10px] tracking-widest mb-3">DENTAL MAPPING</span>
        <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mb-4">
          <span className="font-mono text-primary text-2xl font-bold">3D+</span>
        </div>
        <h1 className="font-mono text-2xl font-bold text-foreground mb-3">3D+ Scan</h1>
        <p className="text-muted-foreground text-sm text-center mb-8 leading-relaxed max-w-xs">
          Follow the on-screen targets to capture {ZONES.length} guided angles. The camera records your full sweep for a rich 3D mouth reconstruction.
        </p>

        <div className="flex items-start justify-center gap-6 mb-8 w-full">
          {[
            { Icon: Crosshair, label: "Point at target" },
            { Icon: Camera,    label: "Hold steady" },
            { Icon: Sparkles,  label: "AI builds map" },
          ].map(({ Icon, label }, i) => (
            <div key={i} className="flex flex-col items-center gap-2 flex-1">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <span className="mono-label text-muted-foreground text-center" style={{ fontSize: 9 }}>{label.toUpperCase()}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-8">
          {ZONES.map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                <span className="font-mono text-primary text-[10px]">{i + 1}</span>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setPhase("capture")}
          className="w-full py-4 rounded-full bg-primary text-primary-foreground font-mono text-sm tracking-widest uppercase"
        >
          Start Scan
        </button>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 font-mono text-xs text-muted-foreground hover:text-foreground transition"
        >
          Cancel
        </button>
      </div>
    );
  }

  /* Processing */
  if (phase === "processing") {
    const STEPS = [
      "Extracting zone frames",
      "Extracting dense frames",
      "Uploading video & photos",
      "Running AI analysis",
    ];
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-8 px-8">
        <div className="relative w-28 h-28">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: "1.5s" }} />
          <div className="absolute inset-3 rounded-full bg-primary/25 animate-pulse" />
          <div className="absolute inset-6 rounded-full bg-primary/40 flex items-center justify-center">
            <span className="font-mono text-primary text-xs font-bold">3D+</span>
          </div>
        </div>

        <div className="text-center space-y-2">
          <span className="font-mono text-white text-base tracking-widest block">BUILDING YOUR MOUTH MAP</span>
          <p className="text-white/40 text-xs tracking-wide">Reconstructing from video + {ZONES.length} scan zones</p>
        </div>

        <div className="space-y-3 w-full max-w-[260px]">
          {STEPS.map((step, i) => {
            const stepNum = i + 1;
            const done = processingStep > stepNum;
            const active = processingStep === stepNum;
            return (
              <div key={i} className="flex items-center gap-3">
                {done ? (
                  <div className="w-3 h-3 rounded-full bg-green-400 flex-shrink-0" />
                ) : active ? (
                  <Loader2 className="w-3 h-3 text-primary animate-spin flex-shrink-0" />
                ) : (
                  <div className="w-3 h-3 rounded-full bg-white/15 flex-shrink-0" />
                )}
                <span className={`font-mono text-[10px] tracking-wide ${active ? "text-white/80" : done ? "text-green-400/70" : "text-white/20"}`}>
                  {step.toUpperCase()}
                </span>
              </div>
            );
          })}
        </div>

        <span className="font-mono text-white/15 text-[9px] tracking-widest text-center">
          Feel free to leave — we'll notify you when ready
        </span>
      </div>
    );
  }

  /* Capture */
  const qualityPass = brightnessOk && motionOk;
  const progress = stableMs / STABLE_HOLD_MS;
  const target = ZONE_TARGETS[ZONES[currentZone].id] ?? { x: 50, y: 50 };
  const zoneCaptured = !!captured[currentZone];

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* Live video */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        style={{ display: cameraReady ? "block" : "none" }}
      />

      {/* Capture flash overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-50 transition-opacity duration-300"
        style={{ background: "white", opacity: capturedFlash ? 0.4 : 0 }}
      />

      {/* Camera initializing */}
      {!cameraReady && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-white/50 text-xs tracking-widest">STARTING CAMERA...</span>
        </div>
      )}
      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8">
          <span className="font-mono text-white/50 text-xs tracking-widest">CAMERA UNAVAILABLE</span>
          <p className="text-white/30 text-xs text-center">Grant camera permissions to use 3D+ scan.</p>
          <button onClick={() => navigate(-1)} className="font-mono text-white/50 text-xs border border-white/20 px-4 py-2 rounded-full">
            Go Back
          </button>
        </div>
      )}

      {/* REC indicator */}
      {cameraReady && mediaRecorderRef.current && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="font-mono text-white/50 text-[9px] tracking-widest">REC</span>
        </div>
      )}

      {/* Framing rectangle */}
      <div className="absolute inset-[14%] rounded-2xl border border-white/20 pointer-events-none" />

      {/* Corner brackets */}
      {[
        ["top-[14%] left-[14%]", "border-t-2 border-l-2"],
        ["top-[14%] right-[14%]", "border-t-2 border-r-2"],
        ["bottom-[14%] left-[14%]", "border-b-2 border-l-2"],
        ["bottom-[14%] right-[14%]", "border-b-2 border-r-2"],
      ].map(([pos, border], i) => (
        <div key={i} className={`absolute ${pos} w-6 h-6 ${border} border-white/60 pointer-events-none`} />
      ))}

      {/* Zone label + instruction — top */}
      <div className="absolute top-12 left-0 right-0 text-center pointer-events-none">
        <span className="font-mono text-white/55 text-[10px] tracking-widest">
          {qualityPass ? "HOLD STEADY..." : "POINT AT BLUE TARGET"}
        </span>
        <p className="font-mono text-white text-sm tracking-wider mt-0.5">
          {ZONES[currentZone].label.toUpperCase()}
        </p>
        <p className="text-white/40 text-[11px] mt-1 px-10">
          {ZONES[currentZone].instruction}
        </p>
      </div>

      {/* Quality indicators — top right */}
      <div className="absolute top-14 right-5 flex flex-col gap-1.5 pointer-events-none">
        <QualityDot label="LIGHT" pass={brightnessOk} />
        <QualityDot label="STILL" pass={motionOk} />
      </div>

      {/* Target dot */}
      <div
        className="absolute pointer-events-none transition-all duration-500"
        style={{ left: `${target.x}%`, top: `${target.y}%`, transform: "translate(-50%, -50%)" }}
      >
        <TargetDot progress={progress} active={qualityPass} zoneCaptured={zoneCaptured} />
      </div>

      {/* Cancel — top left */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-12 left-4 z-20 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center"
      >
        <span className="text-white text-lg leading-none">×</span>
      </button>

      {/* Camera flip button */}
      {cameraReady && (
        <button
          onClick={() => {
            stableAccRef.current = 0;
            setStableMs(0);
            prevFrameRef.current = null;
            setFacingMode((m) => m === "environment" ? "user" : "environment");
          }}
          className="absolute top-12 right-4 z-20 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center"
        >
          <FlipHorizontal className="w-4 h-4 text-white" />
        </button>
      )}

      {/* Zone progress dots */}
      <div className="absolute bottom-32 left-0 right-0 flex justify-center gap-2.5 pointer-events-none">
        {ZONES.map((z, i) => (
          <div
            key={z.id}
            className={`rounded-full transition-all duration-300 ${
              i < currentZone
                ? "w-2.5 h-2.5 bg-green-400"
                : i === currentZone
                  ? "w-3.5 h-3.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]"
                  : "w-2 h-2 bg-white/25"
            }`}
          />
        ))}
      </div>

      {/* X of N counter */}
      <div className="absolute bottom-[6.5rem] left-0 right-0 text-center pointer-events-none">
        <span className="font-mono text-white/65 text-xs tracking-widest">
          {currentZone + 1} of {ZONES.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-20 left-8 right-8 h-[3px] bg-white/15 rounded-full overflow-hidden pointer-events-none">
        <div
          className="h-full bg-green-400 rounded-full transition-all duration-500"
          style={{ width: `${(currentZone / ZONES.length) * 100}%` }}
        />
      </div>

      {/* Manual capture fallback */}
      <button
        onClick={handleManualCapture}
        className="absolute bottom-6 right-6 font-mono text-[9px] text-white/25 hover:text-white/60 transition tracking-widest"
      >
        TAP TO CAPTURE
      </button>
    </div>
  );
}
