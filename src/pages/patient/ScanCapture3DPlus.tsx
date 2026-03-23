import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { Loader2, FlipHorizontal } from "lucide-react";

/* ─── Zone config ─── */
const ZONES = [
  { id: "FRONT_SMILE", label: "Front Smile",  instruction: "Show all front teeth, lips apart, camera level" },
  { id: "UPPER_ARCH",  label: "Upper Arch",   instruction: "Tilt head back, open wide — upper teeth facing camera" },
  { id: "LOWER_ARCH",  label: "Lower Arch",   instruction: "Tilt chin down, open wide — lower teeth facing camera" },
  { id: "LEFT_BITE",   label: "Left Bite",    instruction: "Turn slightly left, show left side bite" },
  { id: "RIGHT_BITE",  label: "Right Bite",   instruction: "Turn slightly right, show right side bite" },
  { id: "UPPER_CLOSE", label: "Upper Close",  instruction: "Close-up of upper front teeth and gumline" },
  { id: "LOWER_CLOSE", label: "Lower Close",  instruction: "Close-up of lower front teeth and gumline" },
];

const STABLE_HOLD_MS = 3000;    // auto-capture after 3s steady hold
const QUALITY_INTERVAL_MS = 150;
const MOTION_THRESHOLD = 18;    // pixel-diff threshold
const SAMPLE_SIZE = 32;         // 32×32 canvas for brightness/motion

/* ─── StabilityRing ─── */
function StabilityRing({ progress, active }: { progress: number; active: boolean }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(progress, 1);
  const color = active ? (progress > 0.99 ? "#4ade80" : "#ffffff") : "rgba(255,255,255,0.2)";

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="-rotate-90 absolute inset-0" width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - dash}
          style={{ transition: "stroke-dashoffset 0.1s linear, stroke 0.2s" }}
        />
      </svg>
      {/* Center dot */}
      <div className={`w-4 h-4 rounded-full border-2 transition-colors ${
        active ? "border-white bg-white/30" : "border-white/30 bg-transparent"
      }`} />
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
  const [submitting, setSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const qualityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const stableAccRef = useRef(0);
  const capturedRef = useRef(captured);
  const currentZoneRef = useRef(currentZone);

  // Keep refs in sync
  useEffect(() => { capturedRef.current = captured; }, [captured]);
  useEffect(() => { currentZoneRef.current = currentZone; }, [currentZone]);

  /* ── Camera init ── */
  useEffect(() => {
    if (phase !== "capture") return;
    let cancelled = false;
    setCameraReady(false);
    setCameraError(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());

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

    // Brightness
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    const brightness = sum / (SAMPLE_SIZE * SAMPLE_SIZE);
    const bOk = brightness > 35 && brightness < 225;

    // Motion
    let motionSum = 0;
    if (prevFrameRef.current) {
      for (let i = 0; i < data.length; i += 4) {
        motionSum += Math.abs(data[i] - prevFrameRef.current[i]);
      }
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
        // Auto-capture!
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

  /* ── Capture frame ── */
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
    const blob = await captureFrame();
    const blobToStore = blob ?? new Blob();

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

    // Advance to next zone or finish
    if (zone < ZONES.length - 1) {
      setCurrentZone(zone + 1);
      stableAccRef.current = 0;
      setStableMs(0);
      prevFrameRef.current = null;
    } else {
      // All done — stop quality loop and start submission
      if (qualityTimerRef.current) clearInterval(qualityTimerRef.current);
      setPhase("processing");
    }
  }, [captureFrame]);

  const handleManualCapture = useCallback(() => {
    stableAccRef.current = 0;
    setStableMs(0);
    triggerCapture();
  }, [triggerCapture]);

  /* ── Submit ── */
  useEffect(() => {
    if (phase !== "processing") return;
    // Give React a tick to render processing screen, then submit
    const timer = setTimeout(() => handleSubmit(), 300);
    return () => clearTimeout(timer);
  }, [phase]); // eslint-disable-line

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const { data: patient } = await supabase
        .from("patients")
        .select("id, total_scans, treatment_category")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!patient) throw new Error("Patient record not found");

      const timestamp = Date.now();
      const zonesMeta: Array<{ zone: string; path: string | null }> = [];

      for (let i = 0; i < ZONES.length; i++) {
        const blob = capturedRef.current[i];
        if (!blob || blob.size === 0) {
          zonesMeta.push({ zone: ZONES[i].id, path: null });
          continue;
        }
        const path = `${patient.id}/${timestamp}/3dplus/zone-${i}.jpg`;
        const { error } = await supabase.storage.from("scan-videos").upload(path, blob, { contentType: "image/jpeg" });
        if (error) throw error;
        zonesMeta.push({ zone: ZONES[i].id, path });
      }

      const { data: scanRow, error: insertError } = await supabase
        .from("scans")
        .insert({
          patient_id: patient.id,
          status: "pending",
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
      setPhase("capture"); // Let user retry
    } finally {
      setSubmitting(false);
    }
  };

  /* ────────────────────────────── RENDER ────────────────────────────── */

  /* Intro */
  if (phase === "intro") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12 max-w-[480px] mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mb-6">
          <span className="font-mono text-primary text-2xl font-bold">3D+</span>
        </div>
        <h1 className="font-mono text-2xl font-bold text-foreground mb-2">3D+ Scan</h1>
        <p className="text-muted-foreground text-sm text-center mb-8 leading-relaxed">
          Guided {ZONES.length}-zone capture. Hold steady at each position — the camera auto-captures when stable. AI generates a personalized 3D dental map.
        </p>

        {/* Zone preview */}
        <div className="w-full mb-8 space-y-2">
          {ZONES.map((z, i) => (
            <div key={z.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
              <span className="font-mono text-xs text-muted-foreground w-4">{i + 1}</span>
              <div className="flex-1">
                <span className="font-mono text-xs text-foreground">{z.label.toUpperCase()}</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">{z.instruction}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setPhase("capture")}
          className="w-full py-4 rounded-full bg-primary text-primary-foreground font-mono text-sm tracking-widest uppercase"
        >
          Start Capture
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
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 px-8">
        <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
        <span className="font-mono text-white text-lg tracking-widest">GENERATING 3D+ MAP</span>
        <p className="text-white/50 text-sm text-center leading-relaxed">
          AI is analyzing your {ZONES.length} scan zones.{"\n"}This takes about 30 seconds.
        </p>
        <span className="font-mono text-white/25 text-[10px] tracking-widest">
          Feel free to leave the app and come back
        </span>
      </div>
    );
  }

  /* Capture */
  const qualityPass = brightnessOk && motionOk;
  const progress = stableMs / STABLE_HOLD_MS;

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

      {/* Framing rectangle */}
      <div className="absolute inset-[14%] rounded-2xl border border-white/25 pointer-events-none" />

      {/* Corner brackets */}
      {[
        ["top-[14%] left-[14%]", "border-t-2 border-l-2"],
        ["top-[14%] right-[14%]", "border-t-2 border-r-2"],
        ["bottom-[14%] left-[14%]", "border-b-2 border-l-2"],
        ["bottom-[14%] right-[14%]", "border-b-2 border-r-2"],
      ].map(([pos, border], i) => (
        <div key={i} className={`absolute ${pos} w-6 h-6 ${border} border-white/70 pointer-events-none`} />
      ))}

      {/* Zone label + instruction — top */}
      <div className="absolute top-12 left-0 right-0 text-center pointer-events-none">
        <span className="font-mono text-white text-sm tracking-widest">
          {ZONES[currentZone].label.toUpperCase()}
        </span>
        <p className="text-white/50 text-[11px] mt-1 px-8">
          {ZONES[currentZone].instruction}
        </p>
      </div>

      {/* Quality indicators — top right */}
      <div className="absolute top-14 right-5 flex flex-col gap-1.5 pointer-events-none">
        <QualityDot label="LIGHT" pass={brightnessOk} />
        <QualityDot label="STILL" pass={motionOk} />
      </div>

      {/* Stability ring — center */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <StabilityRing progress={progress} active={qualityPass} />
      </div>

      {/* Camera flip button */}
      {cameraReady && (
        <button
          onClick={() => {
            stableAccRef.current = 0;
            setStableMs(0);
            prevFrameRef.current = null;
            setFacingMode((m) => m === "environment" ? "user" : "environment");
          }}
          className="absolute top-12 right-16 z-20 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center"
        >
          <FlipHorizontal className="w-4 h-4 text-white" />
        </button>
      )}

      {/* Cancel — top left */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-12 left-4 z-20 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center"
      >
        <span className="text-white text-lg leading-none">×</span>
      </button>

      {/* Zone progress dots */}
      <div className="absolute bottom-32 left-0 right-0 flex justify-center gap-2.5 pointer-events-none">
        {ZONES.map((z, i) => (
          <div
            key={z.id}
            className={`rounded-full transition-all duration-300 ${
              i < currentZone
                ? "w-2.5 h-2.5 bg-green-400"
                : i === currentZone
                  ? "w-3.5 h-3.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
                  : "w-2 h-2 bg-white/25"
            }`}
          />
        ))}
      </div>

      {/* X of N counter */}
      <div className="absolute bottom-[6.5rem] left-0 right-0 text-center pointer-events-none">
        <span className="font-mono text-white/70 text-xs tracking-widest">
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
        className="absolute bottom-6 right-6 font-mono text-[9px] text-white/30 hover:text-white/60 transition tracking-widest"
      >
        TAP TO CAPTURE
      </button>

      {/* Hold-still hint when quality not passing */}
      {cameraReady && !qualityPass && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
          <span className="font-mono text-[9px] text-white/30 tracking-widest">
            {!brightnessOk ? "MORE LIGHT NEEDED" : "HOLD STILL"}
          </span>
        </div>
      )}
    </div>
  );
}
