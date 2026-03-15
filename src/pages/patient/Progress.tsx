import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { ProgressRing } from "@/components/ui/progress-ring";
import { TeethVisualization } from "@/components/3d/TeethVisualization";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePatientData } from "@/hooks/use-patient-data";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { ChevronRight } from "lucide-react";
import { logError } from "@/lib/logger";

interface Milestone {
  id: string;
  title: string;
  target_date: string | null;
  completed_at: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  alignment: "Alignment",
  whitening: "Whitening",
  post_surgery: "Post-Surgery",
  retainer: "Retainer",
  periodontal: "Periodontal",
  general: "General",
};

function getAiInsightFallback(complianceStreak: number, progressPercent: number): string {
  if (complianceStreak > 14 && progressPercent > 60)
    return "You're ahead of schedule — your consistency is paying off. Keep it up and you may finish early.";
  if (complianceStreak > 7)
    return "Great streak! Your compliance is above average. You're well on track for your estimated completion date.";
  if (progressPercent > 50)
    return "You're past the halfway mark. Stay consistent with your scans to maintain momentum.";
  if (complianceStreak > 3)
    return "Good start on building a scanning habit. Try to scan daily for the best results.";
  return "Getting started is the hardest part. Submit a scan today to begin tracking your progress.";
}

export default function Progress() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: patientData, loading: patientLoading } = usePatientData();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loadingMilestones, setLoadingMilestones] = useState(true);
  const [treatmentCategory, setTreatmentCategory] = useState<string | null>(null);
  const [complianceStreak, setComplianceStreak] = useState(0);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [latestScan, setLatestScan] = useState<{ quality_score: number | null; detection_tags: string[] | null } | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data: patient } = await supabase
          .from("patients")
          .select("id, treatment_category, compliance_streak, start_date, estimated_end_date")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!patient) {
          logError("Patient record not found", { operation: "Progress/loadData", userId: user?.id });
          return;
        }

        setPatientId(patient.id);
        setTreatmentCategory(patient.treatment_category);
        setComplianceStreak(patient.compliance_streak || 0);

        const { data } = await supabase
          .from("treatment_milestones")
          .select("id, title, target_date, completed_at")
          .eq("patient_id", patient.id)
          .order("target_date", { ascending: true });

        setMilestones(data || []);

        const { data: scanData } = await supabase
          .from("scans")
          .select("quality_score, detection_tags")
          .eq("patient_id", patient.id)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (scanData) {
          setLatestScan({
            quality_score: scanData.quality_score,
            detection_tags: Array.isArray(scanData.detection_tags) ? (scanData.detection_tags as string[]) : null,
          });
        }

        try {
          const daysElapsed = patient.start_date ? Math.floor((Date.now() - new Date(patient.start_date).getTime()) / 86400000) : 0;
          const daysRemaining = patient.estimated_end_date ? Math.max(0, Math.floor((new Date(patient.estimated_end_date).getTime() - Date.now()) / 86400000)) : null;
          const { data: summaryData } = await supabase.functions.invoke("generate-patient-summary", {
            body: {
              compliance_streak: patient.compliance_streak || 0,
              treatment_category: patient.treatment_category,
              days_elapsed: daysElapsed,
              days_remaining: daysRemaining,
              recent_scan_status: "pending",
            },
          });
          if (summaryData?.summary) setAiSummary(summaryData.summary);
        } catch { /* use fallback */ }
      } catch (e) {
        logError(e, { operation: "Progress/loadData", userId: user?.id });
      } finally {
        setLoadingMilestones(false);
      }
    })();
  }, [user]);

  const handleShareProgress = async () => {
    if (!patientId || sharing) return;
    setSharing(true);
    try {
      const { data: share, error } = await supabase
        .from("progress_shares" as any)
        .insert({ patient_id: patientId } as any)
        .select("share_token")
        .single();
      if (error) throw error;
      const url = `${window.location.origin}/shared/progress/${(share as any).share_token}`;
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied!", description: "Share this link with anyone. It expires in 7 days." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSharing(false);
    }
  };

  const progressPercent = patientData?.progressPercent ?? 0;
  const notStarted = !patientData?.hasStarted && progressPercent === 0;

  return (
    <div className="min-h-screen bg-background px-5 py-8 max-w-[480px] mx-auto pb-24">
      <span className="mono-label text-muted-foreground">TREATMENT</span>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-2">Your Progress</h1>

      {treatmentCategory && (
        <span className="mono-label inline-block px-2.5 py-1 rounded-pill mb-6 bg-primary/10 text-primary">
          {CATEGORY_LABELS[treatmentCategory] || treatmentCategory}
        </span>
      )}

      {patientLoading ? (
        <div className="flex justify-center mb-8">
          <Skeleton className="w-48 h-48 rounded-full" />
        </div>
      ) : (
        <div className="flex flex-col items-center mb-8">
          <GradientOrb
            percentage={progressPercent}
            status={notStarted ? "NOT STARTED" : progressPercent >= 50 ? "ON TRACK" : "IN PROGRESS"}
            notStarted={notStarted}
          />
        </div>
      )}

      {/* AI Insight */}
      <div className="rounded-card p-5 mb-8 bg-primary/5 border border-primary/10">
        <span className="mono-label text-primary mb-2 block">AI INSIGHT</span>
        <p className="font-display text-base italic text-foreground/80 leading-relaxed">
          {aiSummary || getAiInsightFallback(complianceStreak, progressPercent)}
        </p>
      </div>

      {/* Scan Visualization Card */}
      <div className="mb-10">
        <span className="mono-label text-muted-foreground mb-3 block">TOOTH MAP</span>
        <div className="rounded-card overflow-hidden bg-card border border-border dark">
          <div className="px-4 pt-5 pb-2 bg-card">
            <TeethVisualization showToggle showLegend />
          </div>

          <div className="px-5 pb-4" style={{ background: "hsl(var(--card))" }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="mono-label text-muted-foreground">QUALITY</span>
              <span className="font-mono text-xs font-semibold text-foreground">
                {latestScan?.quality_score != null ? `${Math.round(latestScan.quality_score)}%` : "—"}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-muted">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (latestScan?.quality_score ?? 0) >= 80
                    ? "bg-status-success"
                    : (latestScan?.quality_score ?? 0) >= 50
                      ? "bg-status-warning"
                      : "bg-status-danger"
                }`}
                style={{ width: `${latestScan?.quality_score ?? 0}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 px-5 pb-4" style={{ background: "hsl(var(--card))" }}>
            <div className="rounded-lg px-3 py-3 bg-muted">
              <span className="mono-label text-muted-foreground block mb-1">TEETH ANALYZED</span>
              <span className="font-display text-lg font-semibold text-foreground">
                28<span className="text-xs font-normal text-muted-foreground">/32</span>
              </span>
            </div>
            <div className="rounded-lg px-3 py-3 bg-muted">
              <span className="mono-label text-muted-foreground block mb-1">ISSUES FOUND</span>
              <span className="font-display text-lg font-semibold text-foreground">
                {latestScan?.detection_tags?.length ?? 0}
              </span>
            </div>
          </div>

          <div className="px-5 pb-5" style={{ background: "hsl(var(--card))" }}>
            <Button
              onClick={() => navigate("/patient/scans")}
              className="w-full rounded-pill mono-label bg-primary text-primary-foreground"
            >
              View Scan History
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Milestones */}
      <div className="mb-8">
        <span className="mono-label text-muted-foreground mb-3 block">MILESTONES</span>
        {loadingMilestones ? (
          <div className="flex gap-3 overflow-x-auto">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="w-40 h-24 rounded-card flex-shrink-0" />
            ))}
          </div>
        ) : milestones.length === 0 ? (
          <div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-[100px] h-[80px] rounded-card flex-shrink-0 flex flex-col items-center justify-center gap-2 bg-accent/10 border border-dashed border-accent/30"
                >
                  <div className="w-3 h-3 rounded-full bg-accent" />
                  <div className="space-y-1.5 flex flex-col items-center">
                    <div className="w-[60px] h-[6px] rounded-full bg-accent/30" />
                    <div className="w-[40px] h-[6px] rounded-full bg-accent/20" />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[13px] text-muted-foreground italic mt-3">
              Your doctor will set treatment milestones here.
            </p>
          </div>
        ) : (
          <div
            className="flex gap-3 overflow-x-auto pb-4"
            style={{
              maskImage: "linear-gradient(to right, black 85%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to right, black 85%, transparent 100%)",
            }}
          >
            {milestones.map((m, idx) => (
              <div key={m.id} className="relative flex items-center">
                <div className="w-40 flex-shrink-0 bg-card rounded-card border border-border p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                        m.completed_at
                          ? "border-status-success bg-status-success"
                          : "border-border bg-transparent"
                      }`}
                    />
                    <span className="font-body text-sm font-medium truncate">{m.title}</span>
                  </div>
                  {m.target_date && (
                    <span className="mono-label text-muted-foreground">
                      {format(new Date(m.target_date), "dd MMM yyyy").toUpperCase()}
                    </span>
                  )}
                </div>
                {idx < milestones.length - 1 && (
                  <div className="w-3 h-px bg-border flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Share Progress */}
      <Button
        onClick={handleShareProgress}
        disabled={sharing || !patientId}
        variant="outline"
        className="w-full rounded-pill mono-label"
      >
        {sharing ? "Generating..." : "Share Progress"}
      </Button>

      <PatientBottomNav />
    </div>
  );
}
