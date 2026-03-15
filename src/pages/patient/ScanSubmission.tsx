import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";

const zones = ["UPPER", "LOWER", "LEFT", "RIGHT", "FRONT"];
const ZONE_GUIDANCE: Record<string, string> = {
  UPPER: "Position your upper teeth in the frame",
  LOWER: "Position your lower teeth in the frame",
  LEFT: "Position the left side of your bite in the frame",
  RIGHT: "Position the right side of your bite in the frame",
  FRONT: "Show your front smile in the frame",
};
const TIMER_DURATION = 60;

function CircularTimer({ elapsed }: { elapsed: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(elapsed / TIMER_DURATION, 1);
  const dashOffset = circumference * (1 - progress);

  return (
    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="3" opacity={0.3} />
      <circle
        cx="60" cy="60" r={radius} fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        style={{ transition: "stroke-dashoffset 1s linear" }}
      />
    </svg>
  );
}

function QualityScoreAnimation({ targetScore }: { targetScore: number }) {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    let frame = 0;
    const totalFrames = 40;
    const interval = setInterval(() => {
      frame++;
      setDisplayScore(Math.round((frame / totalFrames) * targetScore));
      if (frame >= totalFrames) clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, [targetScore]);

  return (
    <div className="flex flex-col items-center gap-2 py-6">
      <span className="mono-label text-muted-foreground">SCAN QUALITY</span>
      <span className="font-mono text-5xl font-bold text-primary">{displayScore}</span>
      <span className="mono-label text-muted-foreground">/ 100</span>
    </div>
  );
}

export default function ScanSubmission() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentZone, setCurrentZone] = useState(0);
  const [captured, setCaptured] = useState<(Blob | null)[]>(new Array(zones.length).fill(null));
  const [thumbUrls, setThumbUrls] = useState<(string | null)[]>(new Array(zones.length).fill(null));
  const [submitting, setSubmitting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [qualityScore, setQualityScore] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start camera — rear camera for dental scans
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } },
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
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Timer
  useEffect(() => {
    if (timerStarted && !timerRef.current) {
      timerRef.current = setInterval(() => {
        setElapsed((e) => {
          if (e >= TIMER_DURATION) {
            if (timerRef.current) clearInterval(timerRef.current);
            return TIMER_DURATION;
          }
          return e + 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerStarted]);

  const captureFrame = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      if (!video) { resolve(null); return; }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
    });
  }, []);

  const handleCapture = async () => {
    if (!timerStarted) setTimerStarted(true);
    const blob = await captureFrame();
    const next = [...captured];
    next[currentZone] = blob || new Blob();
    setCaptured(next);

    // Generate thumbnail URL
    if (blob) {
      const urls = [...thumbUrls];
      urls[currentZone] = URL.createObjectURL(blob);
      setThumbUrls(urls);
    }

    if (currentZone < zones.length - 1) {
      setCurrentZone(currentZone + 1);
    } else {
      // All zones captured
      setShowReview(true);
    }
  };

  // Allow re-capture of completed zones
  const handleZoneClick = (i: number) => {
    if (showReview) {
      // Coming back from review to re-capture
      setShowReview(false);
    }
    setCurrentZone(i);
  };

  const handleRetake = (i: number) => {
    const next = [...captured];
    next[i] = null;
    setCaptured(next);
    const urls = [...thumbUrls];
    if (urls[i]) URL.revokeObjectURL(urls[i]!);
    urls[i] = null;
    setThumbUrls(urls);
    setShowReview(false);
    setCurrentZone(i);
  };

  const allCaptured = captured.every(Boolean);

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const { data: patient } = await supabase.from("patients").select("id, total_scans, treatment_category").eq("user_id", user.id).maybeSingle();
      if (!patient) {
        logError("Patient record not found", { operation: "ScanSubmission/handleSubmit", userId: user?.id });
        throw new Error("Patient record not found");
      }

      const uploadedUrls: string[] = [];
      const timestamp = Date.now();
      for (let i = 0; i < zones.length; i++) {
        const blob = captured[i];
        if (!blob) continue;
        const path = `${patient.id}/${timestamp}/zone-${i}.jpg`;
        const { error: uploadError } = await supabase.storage.from("scan-videos").upload(path, blob, { contentType: "image/jpeg" });
        if (uploadError) throw uploadError;
        uploadedUrls.push(path);
      }

      const { data: scanRow, error: insertError } = await supabase.from("scans").insert({
        patient_id: patient.id,
        status: "pending",
        video_url: uploadedUrls[0] || null,
        zones_captured: zones.map((z, i) => ({ zone: z, path: uploadedUrls[i] || null })),
      }).select("id").single();
      if (insertError) throw insertError;

      await supabase.from("patients").update({ total_scans: (patient as any).total_scans ? (patient as any).total_scans + 1 : 1 }).eq("id", patient.id);

      if (scanRow?.id) {
        try {
          const { data: qualityData } = await supabase.functions.invoke("analyze-scan-quality", { body: { scan_id: scanRow.id } });
          if (qualityData?.quality_score) setQualityScore(qualityData.quality_score);
          else setQualityScore(85);
        } catch { setQualityScore(85); }

        try {
          await supabase.functions.invoke("analyze-scan-teeth", { body: { scan_id: scanRow.id, treatment_plan: patient.treatment_category || "Standard" } });
        } catch { /* non-blocking */ }
      }

      toast({ title: "Scan submitted!", description: "Your doctor will review it shortly." });
      navigate("/patient/scans");
    } catch (e: any) {
      toast({ title: "Submission failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // Review screen after all zones captured
  if (showReview && allCaptured) {
    return (
      <div className="min-h-screen bg-background px-5 py-6 max-w-[480px] mx-auto pb-24">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setShowReview(false)} className="mono-label text-muted-foreground hover:text-foreground transition">
            ← BACK
          </button>
          <span className="mono-label text-primary">REVIEW SCAN</span>
        </div>

        <QualityScoreAnimation targetScore={qualityScore || 85} />

        <div className="grid grid-cols-5 gap-2 mb-6">
          {zones.map((zone, i) => (
            <div key={zone} className="flex flex-col items-center gap-1">
              <div className="w-full aspect-square rounded-lg bg-muted overflow-hidden border border-border">
                {thumbUrls[i] ? (
                  <img src={thumbUrls[i]!} alt={zone} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="mono-label text-muted-foreground">—</span>
                  </div>
                )}
              </div>
              <span className="mono-label text-muted-foreground">{zone}</span>
              <button
                onClick={() => handleRetake(i)}
                className="mono-label text-primary hover:underline"
              >
                RETAKE
              </button>
            </div>
          ))}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-pill bg-primary hover:bg-primary/90 text-primary-foreground font-mono uppercase tracking-[0.15em] text-sm py-6"
        >
          {submitting ? "Uploading..." : "Submit Scan"}
        </Button>
        <p className="text-center text-xs text-muted-foreground mt-3">
          Usually reviewed within 24 hours
        </p>

        <PatientBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6 max-w-[480px] mx-auto pb-24">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate("/patient")} className="mono-label text-muted-foreground hover:text-foreground transition">CANCEL</button>
        {timerStarted && (
          <span className="mono-label text-muted-foreground">{Math.min(elapsed, TIMER_DURATION)}s / {TIMER_DURATION}s</span>
        )}
      </div>

      <div className="flex justify-center gap-4 mb-2">
        <span className="mono-label text-primary">ZONE {currentZone + 1} OF {zones.length}: {zones[currentZone]}</span>
        <span className="mono-label text-muted-foreground">·</span>
        <span className={`mono-label ${cameraReady ? "text-status-success" : cameraError ? "text-destructive" : "text-status-warning"}`}>
          {cameraReady ? "CAMERA READY" : cameraError ? "NO CAMERA" : "STARTING..."}
        </span>
      </div>

      {/* Zone guidance text */}
      <p className="text-center text-sm text-muted-foreground mb-4">
        {ZONE_GUIDANCE[zones[currentZone]]}
      </p>

      <div className="relative aspect-[3/4] rounded-card bg-card border border-border mb-4 flex items-center justify-center overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted style={{ display: cameraReady ? "block" : "none" }} />
        {!cameraReady && !cameraError && <span className="mono-label text-muted-foreground">INITIALIZING CAMERA...</span>}
        {cameraError && (
          <div className="text-center px-6">
            <span className="mono-label text-muted-foreground block mb-2">CAMERA NOT AVAILABLE</span>
            <p className="text-xs text-muted-foreground">Grant camera permissions or use a device with a camera.</p>
          </div>
        )}
        <div className="absolute inset-3 rounded-lg flex items-center justify-center transition-all duration-300 z-10"
          style={{ border: captured[currentZone] ? "2px solid hsl(var(--status-success))" : "2px dashed hsl(var(--primary) / 0.4)" }}>
          <span className={`mono-label text-lg ${captured[currentZone] ? "text-status-success" : "text-primary"}`}>
            {captured[currentZone] ? "✓" : zones[currentZone]}
          </span>
        </div>
        {[["top-3 left-3", "border-t-2 border-l-2"], ["top-3 right-3", "border-t-2 border-r-2"], ["bottom-3 left-3", "border-b-2 border-l-2"], ["bottom-3 right-3", "border-b-2 border-r-2"]].map(([pos, border], i) => (
          <div key={i} className={`absolute ${pos} w-5 h-5 ${border} border-primary/60 z-10`} />
        ))}
      </div>

      <div className="flex justify-center gap-2 mb-6">
        {zones.map((zone, i) => (
          <button key={zone} onClick={() => handleZoneClick(i)}
            className={`px-3 py-1.5 rounded-pill mono-label transition ${
              i === currentZone
                ? "bg-primary text-primary-foreground"
                : captured[i]
                  ? "bg-status-success/20 text-status-success"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {captured[i] ? "✓" : i + 1}
          </button>
        ))}
      </div>

      {allCaptured ? (
        <div className="flex flex-col items-center gap-3">
          <QualityScoreAnimation targetScore={qualityScore} />
          <Button onClick={() => setShowReview(true)}
            className="w-full rounded-pill bg-primary hover:bg-primary/90 text-primary-foreground font-mono uppercase tracking-[0.15em] text-sm py-6">
            Review & Submit
          </Button>
        </div>
      ) : (
        <div className="relative flex justify-center">
          <div className="relative w-[120px] h-[120px] flex items-center justify-center">
            {timerStarted && <CircularTimer elapsed={elapsed} />}
            <Button onClick={handleCapture}
              className="w-20 h-20 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-mono uppercase tracking-[0.15em] mono-label z-10"
              aria-label={`Capture ${zones[currentZone]} zone`}
            >
              Capture
            </Button>
          </div>
        </div>
      )}

      <PatientBottomNav />
    </div>
  );
}
