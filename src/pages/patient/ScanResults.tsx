import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TeethVisualization } from "@/components/3d/TeethVisualization";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { ArrowLeft, Send, BookmarkPlus, CheckCircle2, AlertTriangle, ChevronRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface ScanData {
  id: string;
  quality_score: number | null;
  ai_analysis: any;
  detection_tags: string[] | null;
  sent_to_doctor: boolean;
  status: string;
  zones_captured: any;
  patient_id: string;
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

  const color =
    targetScore >= 80 ? "text-status-success" : targetScore >= 50 ? "text-status-warning" : "text-destructive";

  return (
    <div className="flex flex-col items-center gap-2 py-6">
      <span className="mono-label text-muted-foreground">SCAN QUALITY</span>
      <span className={`font-mono text-5xl font-bold ${color}`}>{displayScore}</span>
      <span className="mono-label text-muted-foreground">/ 100</span>
    </div>
  );
}

export default function ScanResults() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [scan, setScan] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [patientNote, setPatientNote] = useState("");
  const [viewMode, setViewMode] = useState<"3d" | "analysis">("analysis");

  useEffect(() => {
    if (!scanId || !user) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("scans")
          .select("id, quality_score, ai_analysis, detection_tags, sent_to_doctor, status, zones_captured, patient_id")
          .eq("id", scanId)
          .single();
        if (data) {
          setScan({
            ...data,
            detection_tags: Array.isArray(data.detection_tags) ? (data.detection_tags as string[]) : null,
            sent_to_doctor: (data as any).sent_to_doctor ?? false,
            ai_analysis: (data as any).ai_analysis,
          });
        }
      } catch (e) {
        logError(e, { operation: "ScanResults/load", userId: user?.id });
      } finally {
        setLoading(false);
      }
    })();
  }, [scanId, user]);

  const handleSendToDoctor = async () => {
    if (!scan || !user) return;
    setSending(true);
    try {
      const { data: patient } = await supabase
        .from("patients")
        .select("assigned_doctor_id")
        .eq("id", scan.patient_id)
        .single();

      if (!patient?.assigned_doctor_id) {
        toast({ title: "No doctor assigned", description: "Find a doctor first in the Chat tab.", variant: "destructive" });
        setSending(false);
        return;
      }

      // Create scan review for doctor
      await supabase.from("scan_reviews").insert({
        scan_id: scan.id,
        doctor_id: patient.assigned_doctor_id,
        ai_analysis: scan.ai_analysis?.teeth || [],
        review_notes: patientNote || "Patient submitted for review",
        action_type: "none" as const,
      });

      // Update scan as sent
      await supabase.from("scans").update({
        sent_to_doctor: true,
        sent_to_doctor_at: new Date().toISOString(),
        patient_note: patientNote || null,
      } as any).eq("id", scan.id);

      setScan((prev) => prev ? { ...prev, sent_to_doctor: true } : prev);
      toast({ title: "Sent to doctor!", description: "Your doctor will review this scan." });
      setShowNoteInput(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-5 py-8 max-w-[480px] mx-auto pb-24">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-40 rounded-card mb-4" />
        <Skeleton className="h-32 rounded-card mb-4" />
        <Skeleton className="h-12 rounded-pill" />
        <PatientBottomNav />
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="min-h-screen bg-background px-5 py-8 max-w-[480px] mx-auto pb-24 flex flex-col items-center justify-center">
        <p className="text-muted-foreground">Scan not found</p>
        <Button variant="outline" onClick={() => navigate("/patient/scans")} className="mt-4 rounded-pill">
          Back to Scans
        </Button>
        <PatientBottomNav />
      </div>
    );
  }

  const teethData = scan.ai_analysis?.teeth || [];
  const detections = scan.detection_tags || [];
  const overallAssessment = detections.length === 0 ? "on_track" : detections.length <= 2 ? "needs_attention" : "urgent";

  return (
    <div className="min-h-screen bg-background px-5 py-8 max-w-[480px] mx-auto pb-24">
      {/* Header */}
      <button onClick={() => navigate("/patient/scans")} className="flex items-center gap-1 mono-label text-muted-foreground hover:text-foreground transition mb-6">
        <ArrowLeft className="w-3.5 h-3.5" />
        SCAN RESULTS
      </button>

      {/* Quality Score */}
      <div className="rounded-card bg-card border border-border p-4 mb-4">
        <QualityScoreAnimation targetScore={scan.quality_score ?? 85} />
        <div className="h-2 rounded-full overflow-hidden bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              (scan.quality_score ?? 0) >= 80 ? "bg-status-success" : (scan.quality_score ?? 0) >= 50 ? "bg-status-warning" : "bg-destructive"
            }`}
            style={{ width: `${scan.quality_score ?? 0}%` }}
          />
        </div>
      </div>

      {/* AI Analysis Breakdown */}
      <div className="rounded-card bg-card border border-border p-4 mb-4">
        <span className="mono-label text-primary mb-3 block">AI ANALYSIS</span>

        {teethData.length > 0 ? (
          <div className="space-y-2">
            {teethData.map((tooth: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2">
                  {tooth.status === "on_track" || tooth.status === "healthy" ? (
                    <CheckCircle2 className="w-4 h-4 text-status-success" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-status-warning" />
                  )}
                  <span className="text-sm font-medium">{tooth.zone || `Tooth ${tooth.id}`}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="mono-label text-muted-foreground">{tooth.confidence}</span>
                  <span className={`mono-label ${
                    tooth.status === "on_track" || tooth.status === "healthy" ? "text-status-success" : "text-status-warning"
                  }`}>
                    {tooth.status?.toUpperCase().replace("_", " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">AI analysis processing...</p>
        )}
      </div>

      {/* Detection Tags */}
      {detections.length > 0 && (
        <div className="rounded-card bg-card border border-border p-4 mb-4">
          <span className="mono-label text-muted-foreground mb-3 block">DETECTIONS</span>
          <div className="flex flex-wrap gap-1.5">
            {detections.map((tag, i) => (
              <span key={i} className="mono-label px-3 py-1.5 rounded-pill bg-primary/15 text-primary cursor-pointer hover:bg-primary/25 transition">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setViewMode("analysis")}
          className={`flex-1 py-2 rounded-pill mono-label transition ${
            viewMode === "analysis" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          ANALYSIS
        </button>
        <button
          onClick={() => setViewMode("3d")}
          className={`flex-1 py-2 rounded-pill mono-label transition ${
            viewMode === "3d" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          3D MAP
        </button>
      </div>

      {viewMode === "3d" && (
        <div className="rounded-card overflow-hidden bg-card border border-border mb-4 dark">
          <div className="px-3 pt-3 pb-3 bg-card">
            <TeethVisualization compact showLegend={false} showToggle={false} />
          </div>
        </div>
      )}

      {/* CTAs */}
      <div className="space-y-3 mt-6">
        {!scan.sent_to_doctor ? (
          <>
            {showNoteInput ? (
              <div className="rounded-card bg-card border border-border p-4 space-y-3">
                <span className="mono-label text-muted-foreground">ADD A NOTE FOR YOUR DOCTOR (OPTIONAL)</span>
                <Textarea
                  value={patientNote}
                  onChange={(e) => setPatientNote(e.target.value)}
                  placeholder="e.g. I noticed this area looks different from last time..."
                  className="text-sm resize-none"
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => setShowNoteInput(false)}
                    variant="outline"
                    className="flex-1 rounded-pill mono-label"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSendToDoctor}
                    disabled={sending}
                    className="flex-1 rounded-pill mono-label bg-primary text-primary-foreground"
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    {sending ? "Sending..." : "Send"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={() => setShowNoteInput(true)}
                className="w-full rounded-pill mono-label bg-primary text-primary-foreground py-6"
              >
                <Send className="w-4 h-4 mr-2" />
                Send to Doctor for Review
              </Button>
            )}
            <Button
              onClick={() => navigate("/patient/scans")}
              variant="outline"
              className="w-full rounded-pill mono-label py-6"
            >
              <BookmarkPlus className="w-4 h-4 mr-2" />
              Save & Track Progress
            </Button>
          </>
        ) : (
          <div className="rounded-card bg-status-success/10 border border-status-success/30 p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-status-success flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Sent to your doctor</p>
              <p className="mono-label text-muted-foreground mt-0.5">They'll review and respond soon</p>
            </div>
          </div>
        )}

        {/* Marketplace CTA when detections exist */}
        {detections.length > 0 && (
          <button
            onClick={() => navigate("/patient/chat", { state: { activeTab: "find", fromDetection: true } })}
            className="w-full rounded-card bg-card border border-border p-4 flex items-center justify-between hover:border-primary/30 transition"
          >
            <div className="text-left">
              <p className="text-sm font-medium">Find a Specialist</p>
              <p className="mono-label text-muted-foreground mt-0.5">Get professional care for detected issues</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      <PatientBottomNav />
    </div>
  );
}
