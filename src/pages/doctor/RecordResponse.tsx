import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, MessageSquarePlus, Trash2 } from "lucide-react";
import { logError } from "@/lib/logger";
import { PointCloudViewer } from "@/lib/scanning/PointCloudViewer";
import { usePointCloudUrl } from "@/lib/scanning/usePointCloudUrl";

interface PendingComment {
  id: string;
  tMs: number;
  text: string;
  createdAt: string;
}

function formatDuration(s: number): string {
  const min = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function formatTimecode(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  return formatDuration(totalSec);
}

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
  const [comments, setComments] = useState<PendingComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [scanPointcloudPath, setScanPointcloudPath] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number>(0);

  const { url: pointcloudUrl } = usePointCloudUrl(scanPointcloudPath);

  /* ── Fetch scan + patient + prior review ── */
  useEffect(() => {
    if (!scanId) return;
    (async () => {
      try {
        const { data: scan } = await supabase
          .from("scans")
          .select("*")
          .eq("id", scanId)
          .maybeSingle();
        if (!scan) {
          logError("Scan not found", { operation: "RecordResponse/loadData", userId: user?.id });
          return;
        }
        const sd = scan as Record<string, unknown>;
        setScanPointcloudPath((sd.pointcloud_url as string | null) ?? null);

        const [patientResult, reviewResult] = await Promise.allSettled([
          supabase.from("patients").select("user_id").eq("id", scan.patient_id).maybeSingle(),
          supabase
            .from("scan_reviews")
            .select("review_notes, ai_analysis")
            .eq("scan_id", scanId)
            .order("reviewed_at", { ascending: false })
            .limit(1),
        ]);

        if (patientResult.status === "rejected") {
          logError(patientResult.reason, { operation: "RecordResponse/fetchPatient", userId: user?.id });
        }
        if (reviewResult.status === "rejected") {
          logError(reviewResult.reason, { operation: "RecordResponse/fetchReview", userId: user?.id });
        }

        const patientData = patientResult.status === "fulfilled" ? patientResult.value.data : null;
        const reviewData = reviewResult.status === "fulfilled" ? reviewResult.value.data : null;

        if (patientData?.user_id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", patientData.user_id)
            .maybeSingle();
          setPatientName(profile?.full_name || "Patient");
        }

        const review = reviewData?.[0];
        if (review?.ai_analysis && Array.isArray(review.ai_analysis)) {
          setAiSummary(review.ai_analysis.map((a: { id?: string; status?: string; deviation?: string }) =>
            `${a.id}: ${a.status || a.deviation || "OK"}`
          ));
        } else {
          setAiSummary(["Awaiting AI analysis on this scan"]);
        }
      } catch (e) {
        logError(e, { operation: "RecordResponse/loadData", userId: user?.id });
      }
    })();
  }, [scanId, user?.id]);

  /* ── Camera ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch {
        /* mock mode */
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      try { recorderRef.current?.stop(); } catch { /* ignore */ }
    };
  }, []);

  const handleStartRecording = useCallback(() => {
    setRecording(true);
    setDuration(0);
    setComments([]);
    chunksRef.current = [];
    recordingStartedAtRef.current = performance.now();

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
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
  }, []);

  const handleAddTag = () => {
    if (actionTag.trim()) {
      setActionTags([...actionTags, actionTag.trim()]);
      setActionTag("");
    }
  };

  /* ── Drop a timestamped comment at the current playhead. ── */
  const handleDropComment = useCallback(() => {
    if (!recording || !commentDraft.trim()) return;
    const tMs = Math.max(0, performance.now() - recordingStartedAtRef.current);
    const id = (crypto && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setComments((prev) => [
      ...prev,
      { id, tMs, text: commentDraft.trim(), createdAt: new Date().toISOString() },
    ]);
    setCommentDraft("");
  }, [recording, commentDraft]);

  const handleRemoveComment = (id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  };

  /* ── Send: upload video, write scan_reviews row with comments JSONB. ── */
  const handleSend = async () => {
    if (!user || !scanId) return;
    setSending(true);
    try {
      let videoUrl: string | null = null;

      if (chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const path = `${user.id}/${scanId}/${Date.now()}.webm`;
        const { error: uploadError } = await supabase.storage
          .from("response-videos")
          .upload(path, blob, { contentType: "video/webm" });
        if (uploadError) throw uploadError;
        videoUrl = path;
      }

      const commentsForDb = comments.map((c) => ({
        id: c.id,
        t_ms: Math.round(c.tMs),
        text: c.text,
        author_id: user.id,
        created_at: c.createdAt,
      }));

      // `comments` and `video_duration_ms` are added by the 20260509 migration.
      // Cast around the older generated supabase types until they're regenerated.
      await supabase.from("scan_reviews").insert({
        scan_id: scanId,
        doctor_id: user.id,
        response_video_url: videoUrl,
        review_notes: actionTags.length > 0 ? `Action items: ${actionTags.join(", ")}` : null,
        action_type: "none",
        comments: commentsForDb,
        video_duration_ms: duration * 1000,
      } as never);

      toast({
        title: "Response sent",
        description: `${comments.length} timestamped comment${comments.length === 1 ? "" : "s"} attached.`,
      });
      navigate(`/doctor/scans/${scanId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSending(false);
    }
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

      {/* Live thumbnail of the patient's actual 3D map */}
      <div>
        <span className="mono-label mb-2 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>PATIENT 3D MAP</span>
        {scanPointcloudPath ? (
          <PointCloudViewer plyUrl={pointcloudUrl} height={180} />
        ) : (
          <div className="aspect-square rounded-card flex items-center justify-center" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.2)" }}>NO 3D MAP YET</span>
          </div>
        )}
      </div>

      <div>
        <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>AI SUMMARY</span>
        <ul className="mt-2 space-y-2 text-sm font-body" style={{ color: "hsl(38 23% 90% / 0.7)" }}>
          {aiSummary.map((item, i) => <li key={i}>• {item}</li>)}
        </ul>
      </div>

      {/* Live timestamped comments — addable while recording */}
      {(recording || comments.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>TIMESTAMPED COMMENTS</span>
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{comments.length}</span>
          </div>
          {recording && (
            <div className="flex gap-2 mb-2">
              <Input
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleDropComment()}
                placeholder="Comment at current timecode…"
                className="bg-card border-border text-foreground text-xs"
              />
              <Button
                onClick={handleDropComment}
                disabled={!commentDraft.trim()}
                size="sm"
                className="rounded-pill bg-primary text-primary-foreground"
                aria-label="Drop timestamped comment"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            {comments.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-2 rounded-tag p-2"
                style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.06)" }}
              >
                <span
                  className="mono-label flex-shrink-0"
                  style={{ color: "hsl(228 100% 62%)" }}
                >
                  {formatTimecode(c.tMs)}
                </span>
                <p className="flex-1 text-xs" style={{ color: "hsl(38 23% 90%)" }}>{c.text}</p>
                <button
                  onClick={() => handleRemoveComment(c.id)}
                  className="flex-shrink-0 text-muted-foreground hover:text-destructive transition"
                  aria-label="Remove comment"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
              <span
                key={i}
                className="mono-label px-2 py-1 rounded-pill"
                style={{ background: "hsl(228 100% 62% / 0.15)", color: "hsl(228 100% 62%)" }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row"
      style={{ background: "hsl(216 32% 7%)", color: "hsl(38 23% 90%)" }}
    >
      <main className="flex-1 flex flex-col items-center justify-center relative p-4 md:p-8 lg:order-2">
        {recording && (
          <div className="absolute top-4 left-4 md:top-6 md:left-6 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full animate-status-pulse" style={{ background: "hsl(0 84% 60%)" }} />
            <span className="mono-label" style={{ color: "hsl(0 84% 60%)" }}>REC · {formatDuration(duration)}</span>
          </div>
        )}

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

          <div className="absolute bottom-4 left-4 z-10">
            <span className="mono-label" style={{ color: "hsl(0 0% 100% / 0.3)" }}>ARCLINE</span>
          </div>
          <div className="absolute bottom-4 right-4 z-10">
            <span className="mono-label" style={{ color: "hsl(0 0% 100% / 0.2)" }}>{new Date().toLocaleDateString()}</span>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          {!recording && !recorded && (
            <Button
              onClick={handleStartRecording}
              className="rounded-pill font-mono text-xs uppercase tracking-[0.15em] px-6 md:px-8"
              style={{ background: "hsl(0 84% 60%)", color: "white" }}
            >
              Start Recording
            </Button>
          )}
          {recording && (
            <Button
              onClick={handleStopRecording}
              className="rounded-pill font-mono text-xs uppercase tracking-[0.15em] px-6 md:px-8"
              style={{ background: "hsl(0 84% 60%)", color: "white" }}
            >
              Stop Recording
            </Button>
          )}
          {recorded && (
            <>
              <Button
                variant="outline"
                onClick={() => { setRecorded(false); setDuration(0); setComments([]); chunksRef.current = []; }}
                className="rounded-pill font-mono text-xs uppercase tracking-[0.15em] border-foreground/20 text-foreground"
              >
                Re-Record
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending}
                className="rounded-pill bg-primary text-primary-foreground font-mono text-xs uppercase tracking-[0.15em] px-6 md:px-8"
              >
                {sending ? "Sending..." : `Send Response${comments.length > 0 ? ` (${comments.length})` : ""}`}
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

      {/* Desktop sidebar */}
      <aside
        className="w-72 p-6 flex-col gap-6 border-r hidden lg:flex lg:order-1"
        style={{ background: "hsl(218 26% 11%)", borderColor: "hsl(0 0% 100% / 0.07)" }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile collapsible info */}
      <div
        className="lg:hidden border-b lg:order-1"
        style={{ background: "hsl(218 26% 11%)", borderColor: "hsl(0 0% 100% / 0.07)" }}
      >
        <button
          onClick={() => setInfoOpen(!infoOpen)}
          className="w-full flex items-center justify-between p-4"
        >
          <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>SCAN INFO · 3D MAP · COMMENTS</span>
          {infoOpen
            ? <ChevronUp className="w-4 h-4" style={{ color: "hsl(38 23% 90% / 0.45)" }} />
            : <ChevronDown className="w-4 h-4" style={{ color: "hsl(38 23% 90% / 0.45)" }} />}
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
