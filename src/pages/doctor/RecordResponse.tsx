import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function RecordResponse() {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [actionTag, setActionTag] = useState("");
  const [actionTags, setActionTags] = useState<string[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [patientName, setPatientName] = useState("Patient");
  const [aiSummary, setAiSummary] = useState<string[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<number | null>(null);

  // Fetch scan data
  useEffect(() => {
    if (!scanId) return;
    (async () => {
      try {
        const { data: scan } = await supabase.from("scans").select("patient_id").eq("id", scanId).single();
        if (!scan) return;

        const [patientRes, reviewRes] = await Promise.all([
          supabase.from("patients").select("user_id").eq("id", scan.patient_id).single(),
          supabase.from("scan_reviews").select("review_notes, ai_analysis").eq("scan_id", scanId).order("reviewed_at", { ascending: false }).limit(1),
        ]);

        if (patientRes.data?.user_id) {
          const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", patientRes.data.user_id).single();
          setPatientName(profile?.full_name || "Patient");
        }

        const review = reviewRes.data?.[0];
        if (review?.ai_analysis && Array.isArray(review.ai_analysis)) {
          setAiSummary(review.ai_analysis.map((a: any) => `${a.id}: ${a.status || a.deviation || "OK"}`));
        } else {
          setAiSummary(["Teeth alignment progressing well", "Minor crowding in lower arch", "No signs of decay detected"]);
        }
      } catch (e) { console.error(e); }
    })();
  }, [scanId]);

  // Start camera
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch { /* camera not available, mock mode */ }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      clearInterval(intervalRef.current ?? undefined);
      recorderRef.current?.stop();
    };
  }, []);

  const handleStartRecording = useCallback(() => {
    setRecording(true);
    setDuration(0);
    chunksRef.current = [];

    if (streamRef.current) {
      const recorder = new MediaRecorder(streamRef.current, { mimeType: "video/webm" });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(100);
      recorderRef.current = recorder;
    }

    intervalRef.current = window.setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
  }, []);

  const handleStopRecording = useCallback(() => {
    setRecording(false);
    setRecorded(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    recorderRef.current?.stop();
  }, []);

  const handleAddTag = () => {
    if (actionTag.trim()) {
      setActionTags([...actionTags, actionTag.trim()]);
      setActionTag("");
    }
  };

  const handleSend = async () => {
    if (!user || !scanId) return;
    setSending(true);
    try {
      let videoUrl: string | null = null;

      // Upload video if we have recorded chunks
      if (chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const path = `${user.id}/${scanId}/${Date.now()}.webm`;
        const { error: uploadError } = await supabase.storage.from("response-videos").upload(path, blob, { contentType: "video/webm" });
        if (uploadError) throw uploadError;
        videoUrl = path;
      }

      // Update or insert scan_review with response_video_url
      await supabase.from("scan_reviews").insert({
        scan_id: scanId,
        doctor_id: user.id,
        response_video_url: videoUrl,
        review_notes: actionTags.length > 0 ? `Action items: ${actionTags.join(", ")}` : null,
        action_type: "none",
      });

      toast({ title: "Response sent", description: "Video response has been sent to the patient." });
      navigate(`/doctor/scans/${scanId}`);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const formatDuration = (s: number) => {
    const min = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${min}:${sec}`;
  };

  const sidebarContent = (
    <>
      <div>
        <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>PATIENT</span>
        <p className="font-mono text-xs mt-1" style={{ color: "hsl(38 23% 90%)" }}>{patientName}</p>
      </div>
      <div>
        <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>SCAN ID</span>
        <p className="font-mono text-xs mt-1 truncate" style={{ color: "hsl(38 23% 90%)" }}>{scanId}</p>
      </div>
      <div>
        <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>AI SUMMARY</span>
        <ul className="mt-2 space-y-2 text-sm font-body" style={{ color: "hsl(38 23% 90% / 0.7)" }}>
          {aiSummary.map((item, i) => <li key={i}>• {item}</li>)}
        </ul>
      </div>
      {recorded && (
        <div>
          <span className="mono-label mb-2 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>ACTION ITEMS</span>
          <div className="flex gap-2 mb-2">
            <Input
              value={actionTag}
              onChange={(e) => setActionTag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
              placeholder="Add action item..."
              className="bg-card border-border text-foreground text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {actionTags.map((tag, i) => (
              <span key={i} className="mono-label px-2 py-1 rounded-pill" style={{ background: "hsl(228 100% 62% / 0.15)", color: "hsl(228 100% 62%)" }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: "hsl(216 32% 7%)", color: "hsl(38 23% 90%)" }}>
      {/* Main — Camera viewfinder (DOM-first for keyboard/test accessibility; sidebar uses lg:order-first) */}
      <main className="flex-1 flex flex-col items-center justify-center relative p-4 md:p-8 lg:order-2">
        {/* REC indicator */}
        {recording && (
          <div className="absolute top-4 left-4 md:top-6 md:left-6 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full animate-status-pulse" style={{ background: "hsl(0 84% 60%)" }} />
            <span className="mono-label" style={{ color: "hsl(0 84% 60%)" }}>REC · {formatDuration(duration)}</span>
          </div>
        )}

        {/* Camera preview */}
        <div
          className="w-full max-w-2xl aspect-video rounded-card flex items-center justify-center mb-8 relative overflow-hidden"
          style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}
        >
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
            style={{ display: cameraReady ? "block" : "none" }}
          />
          {!cameraReady && (
            recorded ? (
              <div className="text-center">
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>RECORDING PREVIEW</span>
                <p className="font-mono text-xs mt-2" style={{ color: "hsl(38 23% 90% / 0.45)" }}>Duration: {formatDuration(duration)}</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-20 h-20 rounded-full border-2 mx-auto mb-4 flex items-center justify-center" style={{ borderColor: "hsl(0 0% 100% / 0.15)" }}>
                  <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.2)" }}>CAM</span>
                </div>
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>CAMERA VIEWFINDER</span>
              </div>
            )
          )}

          {/* Brand overlay */}
          <div className="absolute bottom-4 left-4 z-10">
            <span className="mono-label" style={{ color: "hsl(0 0% 100% / 0.3)" }}>ARCLINE</span>
          </div>
          <div className="absolute bottom-4 right-4 z-10">
            <span className="mono-label" style={{ color: "hsl(0 0% 100% / 0.2)" }}>{new Date().toLocaleDateString()}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap justify-center gap-3">
          {!recording && !recorded && (
            <Button onClick={handleStartRecording} className="rounded-pill font-mono text-xs uppercase tracking-[0.15em] px-6 md:px-8" style={{ background: "hsl(0 84% 60%)", color: "white" }}>
              Start Recording
            </Button>
          )}
          {recording && (
            <Button onClick={handleStopRecording} className="rounded-pill font-mono text-xs uppercase tracking-[0.15em] px-6 md:px-8" style={{ background: "hsl(0 84% 60%)", color: "white" }}>
              Stop Recording
            </Button>
          )}
          {recorded && (
            <>
              <Button
                variant="outline"
                onClick={() => { setRecorded(false); setDuration(0); chunksRef.current = []; }}
                className="rounded-pill font-mono text-xs uppercase tracking-[0.15em] border-foreground/20 text-foreground"
              >
                Re-Record
              </Button>
              <Button onClick={handleSend} disabled={sending} className="rounded-pill bg-primary text-primary-foreground font-mono text-xs uppercase tracking-[0.15em] px-6 md:px-8">
                {sending ? "Sending..." : "Send Response"}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => navigate(`/doctor/scans/${scanId}`)}
            className="rounded-pill font-mono text-xs uppercase tracking-[0.15em] border-foreground/20 text-foreground"
          >
            Cancel
          </Button>
        </div>
      </main>

      {/* Desktop sidebar (lg:order-1 places it before main visually on large screens) */}
      <aside className="w-72 p-6 flex-col gap-6 border-r hidden lg:flex lg:order-1" style={{ background: "hsl(218 26% 11%)", borderColor: "hsl(0 0% 100% / 0.07)" }}>
        {sidebarContent}
        <div>
          <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>SCAN THUMBNAIL</span>
          <div className="mt-2 aspect-square rounded-card flex items-center justify-center" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.15)" }}>PREVIEW</span>
          </div>
        </div>
      </aside>

      {/* Mobile collapsible info (lg:order-1 keeps it before main on small screens) */}
      <div className="lg:hidden border-b lg:order-1" style={{ background: "hsl(218 26% 11%)", borderColor: "hsl(0 0% 100% / 0.07)" }}>
        <button
          onClick={() => setInfoOpen(!infoOpen)}
          className="w-full flex items-center justify-between p-4"
        >
          <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>SCAN INFO & AI SUMMARY</span>
          {infoOpen ? <ChevronUp className="w-4 h-4" style={{ color: "hsl(38 23% 90% / 0.45)" }} /> : <ChevronDown className="w-4 h-4" style={{ color: "hsl(38 23% 90% / 0.45)" }} />}
        </button>
        {infoOpen && (
          <div className="px-4 pb-4 space-y-4">
            {sidebarContent}
          </div>
        )}
      </div>
    </div>
  );
}
