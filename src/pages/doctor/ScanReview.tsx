import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PillNav } from "@/components/ui/pill-nav";
import { VerticalLabel } from "@/components/ui/vertical-label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToothArch } from "@/components/patient/ToothArch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";

const tabs = [
  { id: "analysis", label: "ANALYSIS" },
  { id: "history", label: "HISTORY" },
  { id: "notes", label: "NOTES" },
  { id: "copilot", label: "COPILOT" },
];

const DETECTION_TAGS = ["PLAQUE", "INFLAMMATION", "BONE CHANGE", "TARTAR", "RECESSION", "APPLIANCE FIT"];

interface ScanData {
  id: string;
  status: string;
  submitted_at: string;
  quality_score: number | null;
  zones_captured: any;
  video_url: string | null;
  patient_id: string;
  detection_tags: any;
}

export default function ScanReview() {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("analysis");
  const [updating, setUpdating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scan, setScan] = useState<ScanData | null>(null);
  const [patientName, setPatientName] = useState("Patient");
  const [treatmentCategory, setTreatmentCategory] = useState<string | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewNotes, setReviewNotes] = useState("");
  const [aiAnalysis, setAiAnalysis] = useState<any[]>([]);
  const [copilotNote, setCopilotNote] = useState<string | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);

  useEffect(() => {
    if (!scanId) return;
    (async () => {
      try {
        const { data: scanData } = await supabase
          .from("scans")
          .select("*")
          .eq("id", scanId)
          .maybeSingle();
        if (!scanData) {
          logError("Scan not found", { operation: "ScanReview/loadData", userId: user?.id });
          setLoading(false);
          return;
        }
        setScan(scanData as ScanData);

        const [patientResult, reviewsResult] = await Promise.allSettled([
          supabase.from("patients").select("user_id, treatment_category").eq("id", scanData.patient_id).maybeSingle(),
          supabase.from("scan_reviews").select("*").eq("scan_id", scanId).order("reviewed_at", { ascending: false }),
        ]);

        if (patientResult.status === "rejected") {
          logError(patientResult.reason, { operation: "ScanReview/fetchPatient", userId: user?.id });
        }
        if (reviewsResult.status === "rejected") {
          logError(reviewsResult.reason, { operation: "ScanReview/fetchReviews", userId: user?.id });
        }

        const patientData = patientResult.status === "fulfilled" ? patientResult.value.data : null;
        const reviewsData = reviewsResult.status === "fulfilled" ? reviewsResult.value.data : null;

        setTreatmentCategory(patientData?.treatment_category || null);
        setReviews(reviewsData || []);

        const latestReview = reviewsData?.[0];
        if (latestReview?.ai_analysis && Array.isArray(latestReview.ai_analysis)) {
          setAiAnalysis(latestReview.ai_analysis);
        }

        if (patientData?.user_id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", patientData.user_id)
            .maybeSingle();
          setPatientName(profile?.full_name || "Patient");
        }
      } catch (e) { logError(e, { operation: "ScanReview/loadData", userId: user?.id }); }
      finally { setLoading(false); }
    })();
  }, [scanId]);

  // Load copilot note when tab is selected
  useEffect(() => {
    if (activeTab === "copilot" && !copilotNote && !copilotLoading) {
      setCopilotLoading(true);
      (async () => {
        try {
          const { data, error } = await supabase.functions.invoke("generate-copilot-note", {
            body: {
              ai_analysis: aiAnalysis.length > 0 ? aiAnalysis : null,
              patient_name: patientName,
              treatment_category: treatmentCategory,
              quality_score: scan?.quality_score,
            },
          });
          if (error) throw error;
          setCopilotNote(data?.note || "Unable to generate clinical note.");
        } catch (e) {
          logError(e, { operation: "ScanReview/generateCopilotNote", userId: user?.id });
          setCopilotNote(
            `Clinical Note — ${patientName}\n\nAssessment:\n- Scan quality: ${scan?.quality_score || "N/A"}\n- Treatment: ${treatmentCategory || "General"}\n- Continue current protocol\n- Next review in 7 days`
          );
        } finally {
          setCopilotLoading(false);
        }
      })();
    }
  }, [activeTab, copilotNote, copilotLoading, patientName, treatmentCategory, scan, aiAnalysis]);

  const updateScanStatus = async (status: "reviewed" | "flagged") => {
    if (!scanId || !user) return;
    setUpdating(true);
    try {
      const { error: scanError } = await supabase
        .from("scans")
        .update({ status })
        .eq("id", scanId);
      if (scanError) throw scanError;

      if (status === "reviewed" || status === "flagged") {
        await supabase.from("scan_reviews").insert({
          scan_id: scanId,
          doctor_id: user.id,
          review_notes: reviewNotes || null,
          action_type: status === "flagged" ? "schedule_visit" : "none",
        });
      }

      setScan(scan ? { ...scan, status } : null);
      toast({
        title: status === "reviewed" ? "Scan marked as reviewed" : "Scan flagged for visit",
        description: status === "flagged" ? "Patient will be notified to schedule a visit." : undefined,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  const saveNotes = async () => {
    if (!scanId || !user || !reviewNotes.trim()) return;
    try {
      await supabase.from("scan_reviews").insert({
        scan_id: scanId,
        doctor_id: user.id,
        review_notes: reviewNotes.trim(),
        action_type: "none",
      });
      toast({ title: "Notes saved" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleShareScan = async () => {
    if (!scanId || !user) return;
    try {
      const { data: share, error } = await supabase.from("scan_shares").insert({
        scan_id: scanId,
        shared_by: user.id,
      }).select("share_token").single();
      if (error) throw error;
      const url = `${window.location.origin}/shared/${share.share_token}`;
      await navigator.clipboard.writeText(url);
      toast({ title: "Share link copied", description: "The scan share link has been copied to your clipboard." });
    } catch (e: any) {
      toast({ title: "Error sharing scan", description: e.message, variant: "destructive" });
    }
  };
  // Build tooth data from AI analysis
  const toothData = useMemo(() => {
    const data: Record<string, string> = {};
    if (aiAnalysis.length > 0) {
      aiAnalysis.forEach((item: any) => {
        const id = item.id || "";
        const status = item.status?.toLowerCase().includes("ahead") || item.status?.toLowerCase().includes("on track")
          ? "on_track"
          : item.status?.toLowerCase().includes("deviation") ? "deviation" : "attention";
        data[id] = status;
      });
    }
    return Object.keys(data).length > 0 ? data : undefined;
  }, [aiAnalysis]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(216 32% 7%)" }}>
        <Skeleton className="w-96 h-96 rounded-card" />
      </div>
    );
  }

  const displayAnalysis = aiAnalysis.length > 0 ? aiAnalysis : [
    { id: "T14", zone: "UPPER", deviation: "+2.3°", target: "0°", confidence: "94%", status: "AHEAD OF PLAN" },
    { id: "T22", zone: "LOWER", deviation: "-0.8°", target: "0°", confidence: "89%", status: "ON TRACK" },
  ];

  const detectedTags: string[] = (scan?.detection_tags as string[]) || [];
  const qualityScore = scan?.quality_score || 0;
  const qualityColor = qualityScore >= 80 ? "hsl(142 71% 45%)" : qualityScore >= 50 ? "hsl(43 50% 54%)" : "hsl(0 84% 60%)";

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: "hsl(216 32% 7%)" }}>
      {/* Left Panel */}
      <div className="w-full lg:w-[60%] relative p-4 md:p-8 flex flex-col items-center justify-center min-h-[50vh] lg:min-h-screen">
        <button onClick={() => navigate(-1)} className="absolute top-4 left-4 md:top-6 md:left-6 mono-label text-muted-foreground hover:text-foreground transition-colors z-10">
          ← BACK
        </button>
        <VerticalLabel text={`SCAN · ${scan?.status?.toUpperCase() || "IN REVIEW"}`} className="left-4 right-auto hidden lg:flex" />

        {/* Main visualization card */}
        <div
          className="relative w-full max-w-xl rounded-card p-6 space-y-5"
          style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}
        >
          {/* Floating pill: Alignment */}
          <div
            className="absolute -top-3 left-4 rounded-pill px-3 py-1 backdrop-blur-md"
            style={{ background: "hsl(0 0% 100% / 0.08)", border: "1px solid hsl(0 0% 100% / 0.1)" }}
          >
            <span className="mono-label" style={{ color: "hsl(142 71% 45%)" }}>
              ALIGNMENT {scan?.quality_score || 0}%
            </span>
          </div>

          {/* Floating pill: AI Analysis */}
          {reviews.length > 0 && (
            <div
              className="absolute -top-3 right-4 rounded-pill px-3 py-1 backdrop-blur-md"
              style={{ background: "hsl(0 0% 100% / 0.08)", border: "1px solid hsl(0 0% 100% / 0.1)" }}
            >
              <span className="mono-label" style={{ color: "hsl(228 100% 62%)" }}>
                AI ANALYSIS · {(() => {
                  const mins = Math.round((Date.now() - new Date(reviews[0].reviewed_at).getTime()) / 60000);
                  return mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
                })()}
              </span>
            </div>
          )}

          {/* Patient info row */}
          <div className="flex items-center justify-between pt-4">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(142 71% 45%)" }} />
              <span className="font-display text-sm font-semibold" style={{ color: "hsl(38 23% 90%)" }}>
                {patientName}
              </span>
              {treatmentCategory && (
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.4)" }}>
                  · {treatmentCategory.toUpperCase()}
                </span>
              )}
            </div>
            <span
              className="mono-label px-2 py-0.5 rounded-pill"
              style={{ background: "hsl(142 71% 45% / 0.12)", color: "hsl(142 71% 45%)", border: "1px solid hsl(142 71% 45% / 0.2)" }}
            >
              ACTIVE
            </span>
          </div>

          {/* Tooth Arch */}
          <ToothArch data={toothData} className="text-foreground" />

          {/* Quality Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>QUALITY</span>
              <span className="font-mono text-xs font-semibold" style={{ color: qualityColor }}>
                {scan?.quality_score || 0}%
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full" style={{ background: "hsl(0 0% 100% / 0.08)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${scan?.quality_score || 0}%`, background: qualityColor }}
              />
            </div>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-tag p-3" style={{ background: "hsl(220 24% 16%)" }}>
              <span className="mono-label block mb-1" style={{ color: "hsl(38 23% 90% / 0.4)" }}>TEETH ANALYZED</span>
              <span className="font-mono text-lg font-semibold" style={{ color: "hsl(38 23% 90%)" }}>
                {aiAnalysis.length > 0 ? aiAnalysis.length : 28}
                <span className="text-xs" style={{ color: "hsl(38 23% 90% / 0.3)" }}>/32</span>
              </span>
            </div>
            <div className="rounded-tag p-3" style={{ background: "hsl(220 24% 16%)" }}>
              <span className="mono-label block mb-1" style={{ color: "hsl(38 23% 90% / 0.4)" }}>ISSUES FOUND</span>
              <span className="font-mono text-lg font-semibold" style={{ color: detectedTags.length > 0 ? "hsl(0 84% 60%)" : "hsl(142 71% 45%)" }}>
                {detectedTags.length}
              </span>
            </div>
          </div>

          {/* View Full Report Button */}
          <Button
            onClick={() => setActiveTab("analysis")}
            className="w-full rounded-pill font-mono text-[10px] uppercase tracking-[0.15em]"
            style={{ background: "hsl(228 100% 62%)", color: "white" }}
          >
            View Full Report
          </Button>
        </div>

        {/* Detection Tags */}
        <div className="flex flex-wrap gap-2 mt-4 max-w-xl w-full">
          {DETECTION_TAGS.map((tag) => {
            const detected = detectedTags.includes(tag.toLowerCase());
            return (
              <span
                key={tag}
                className="mono-label px-2.5 py-1 rounded-pill"
                style={{
                  background: detected ? "hsl(0 84% 60% / 0.15)" : "hsl(142 71% 45% / 0.1)",
                  color: detected ? "hsl(0 84% 60%)" : "hsl(142 71% 45%)",
                  border: `1px solid ${detected ? "hsl(0 84% 60% / 0.3)" : "hsl(142 71% 45% / 0.2)"}`,
                }}
              >
                {detected ? "⚠ " : "✓ "}{tag}
              </span>
            );
          })}
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-[40%] flex flex-col relative" style={{ background: "hsl(218 26% 11%)" }}>
        <VerticalLabel text="AI ANALYSIS · LIVE" className="hidden lg:flex" />

        <div className="p-4 md:p-6 border-b" style={{ borderColor: "hsl(0 0% 100% / 0.06)" }}>
          <PillNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-6">
          {activeTab === "analysis" && (
            <div className="space-y-6">
              {aiAnalysis.length === 0 && (
                <p className="mono-label mb-4" style={{ color: "hsl(38 23% 90% / 0.3)" }}>
                  No AI analysis available yet. Showing placeholder data.
                </p>
              )}
              {displayAnalysis.map((tooth: any, idx: number) => (
                <div key={tooth.id || idx}>
                  <h3 className="font-mono text-xs uppercase tracking-[0.15em] text-foreground mb-3">
                    TOOTH {(tooth.id || `T${idx}`).replace("T", "")}
                  </h3>
                  <div className="rounded-tag p-4 space-y-2" style={{ background: "hsl(220 24% 16%)" }}>
                    {[
                      ["DEVIATION", tooth.deviation || "—"],
                      ["PLAN TARGET", tooth.target || "0°"],
                      ["CONFIDENCE", tooth.confidence || "—"],
                      ["STATUS", tooth.status || "PENDING"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between items-center">
                        <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{label}</span>
                        <span className="font-mono text-[11px] tracking-[0.1em] text-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-3">
              {reviews.length === 0 ? (
                <p className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>No previous reviews for this scan.</p>
              ) : reviews.map((r) => (
                <div key={r.id} className="rounded-tag p-4" style={{ background: "hsl(220 24% 16%)" }}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="mono-label" style={{ color: "hsl(228 100% 62%)" }}>{r.action_type?.toUpperCase() || "REVIEW"}</span>
                    <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>{new Date(r.reviewed_at).toLocaleDateString()}</span>
                  </div>
                  {r.review_notes && (
                    <p className="text-sm font-body" style={{ color: "hsl(38 23% 90% / 0.7)" }}>{r.review_notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === "notes" && (
            <div className="space-y-3">
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add review notes..."
                className="w-full h-40 rounded-tag p-4 font-mono text-xs resize-none text-foreground placeholder:text-muted-foreground"
                style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}
              />
              <Button
                onClick={saveNotes}
                disabled={!reviewNotes.trim()}
                className="rounded-pill font-mono text-[10px] uppercase tracking-[0.15em]"
                style={{ background: "hsl(228 100% 62%)", color: "white" }}
              >
                Save Notes
              </Button>
            </div>
          )}

          {activeTab === "copilot" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="mono-label" style={{ color: "hsl(228 100% 62%)" }}>AI COPILOT</span>
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>· GENERATED NOTE</span>
              </div>
              {copilotLoading ? (
                <div className="flex items-center gap-3 py-8 justify-center">
                  <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>GENERATING...</span>
                </div>
              ) : copilotNote ? (
                <>
                  <div className="rounded-tag p-4" style={{ background: "hsl(220 24% 16%)" }}>
                    <pre className="text-xs font-mono whitespace-pre-wrap" style={{ color: "hsl(38 23% 90% / 0.8)" }}>
                      {copilotNote}
                    </pre>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        navigator.clipboard.writeText(copilotNote);
                        toast({ title: "Copied to clipboard" });
                      }}
                      variant="outline"
                      className="rounded-pill font-mono text-[10px] uppercase tracking-[0.15em] border-foreground/20 text-foreground"
                    >
                      Copy to Clipboard
                    </Button>
                    <Button
                      onClick={() => {
                        setReviewNotes(copilotNote);
                        setActiveTab("notes");
                        toast({ title: "Added to notes", description: "Switch to Notes tab to review and save." });
                      }}
                      className="rounded-pill font-mono text-[10px] uppercase tracking-[0.15em]"
                      style={{ background: "hsl(228 100% 62%)", color: "white" }}
                    >
                      Add to Patient Record
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="p-4 md:p-6 flex flex-col sm:flex-row gap-3 border-t" style={{ borderColor: "hsl(0 0% 100% / 0.06)" }}>
          <Button
            className="flex-1 rounded-pill bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-[0.15em]"
            disabled={updating}
            onClick={() => navigate(`/doctor/record/${scanId}`)}
          >
            Record Response
          </Button>
          <Button
            variant="outline"
            className="flex-1 rounded-pill font-mono text-[10px] uppercase tracking-[0.15em] border-foreground/20 text-foreground"
            onClick={() => updateScanStatus("reviewed")}
            disabled={updating}
          >
            Mark Reviewed
          </Button>
          <Button
            className="flex-1 rounded-pill font-mono text-[10px] uppercase tracking-[0.15em]"
            style={{ background: "hsl(43 50% 54%)", color: "white" }}
            onClick={() => updateScanStatus("flagged")}
            disabled={updating}
          >
            Flag for Visit
          </Button>
          <Button
            variant="outline"
            className="rounded-pill font-mono text-[10px] uppercase tracking-[0.15em] border-foreground/20 text-foreground"
            onClick={handleShareScan}
          >
            Share
          </Button>
        </div>
      </div>
    </div>
  );
}
