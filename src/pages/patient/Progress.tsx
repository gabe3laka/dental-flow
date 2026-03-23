import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { ProgressRing } from "@/components/ui/progress-ring";
import { TeethVisualization, type ToothStatus, type ToothDetection } from "@/components/3d/TeethVisualization";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ScanActivityChart } from "@/components/patient/ScanActivityChart";
import { DetectionTrendCard } from "@/components/patient/DetectionTrendCard";
import { NextActionCard } from "@/components/patient/NextActionCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePatientData } from "@/hooks/use-patient-data";
import { format, differenceInWeeks, differenceInDays } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { ChevronRight } from "lucide-react";
import { logError } from "@/lib/logger";

interface Milestone {
  id: string;
  title: string;
  target_date: string | null;
  completed_at: string | null;
}

interface ScanRecord {
  id: string;
  submitted_at: string;
  quality_score: number | null;
  detection_tags: string[] | null;
  sent_to_doctor: boolean;
  ai_analysis: any;
}

const CATEGORY_LABELS: Record<string, string> = {
  alignment: "Alignment", whitening: "Whitening", post_surgery: "Post-Surgery",
  retainer: "Retainer", periodontal: "Periodontal", general: "General",
};

/** Map AI analysis teeth to toothData for 3D visualization */
function aiTeethToToothData(teeth: any[]): Record<string, ToothStatus> {
  const map: Record<string, ToothStatus> = {};
  if (!Array.isArray(teeth)) return map;
  for (const t of teeth) {
    if (!t.id) continue;
    if (t.status === "on_track" || t.status === "healthy") map[t.id] = "on_track";
    else if (t.status === "deviation") map[t.id] = "deviation";
    else map[t.id] = "attention";
  }
  return map;
}

function computeWeeklyData(scans: ScanRecord[], startDate: Date) {
  const now = new Date();
  const totalWeeks = Math.max(differenceInWeeks(now, startDate), 1);
  const displayWeeks = Math.min(totalWeeks, 12);
  const data: { week: number; count: number; label: string }[] = [];

  for (let w = displayWeeks; w >= 1; w--) {
    const weekStart = new Date(now.getTime() - w * 7 * 86400000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const count = scans.filter((s) => {
      const d = new Date(s.submitted_at);
      return d >= weekStart && d < weekEnd;
    }).length;
    data.push({ week: displayWeeks - w + 1, count, label: `W${displayWeeks - w + 1}` });
  }
  return data;
}

function computeStreak(scans: ScanRecord[]) {
  if (scans.length === 0) return 0;
  const now = new Date();
  let streak = 0;
  for (let w = 0; w < 52; w++) {
    const weekStart = new Date(now.getTime() - (w + 1) * 7 * 86400000);
    const weekEnd = new Date(now.getTime() - w * 7 * 86400000);
    const hasScans = scans.some((s) => { const d = new Date(s.submitted_at); return d >= weekStart && d < weekEnd; });
    if (hasScans) streak++; else break;
  }
  return streak;
}

function computeTrends(scans: ScanRecord[]) {
  if (scans.length < 2) return [];
  const first = scans[scans.length - 1];
  const latest = scans[0];
  const firstTags = new Set((first.detection_tags || []) as string[]);
  const latestTags = new Set((latest.detection_tags || []) as string[]);
  const allTags = new Set([...firstTags, ...latestTags]);
  const trends: { detection: string; firstValue: number; latestValue: number; trend: "improving" | "stable" | "worsening" }[] = [];

  allTags.forEach((tag) => {
    const hadBefore = firstTags.has(tag);
    const hasNow = latestTags.has(tag);
    let trend: "improving" | "stable" | "worsening" = "stable";
    let firstValue = hadBefore ? 60 : 0;
    let latestValue = hasNow ? 60 : 0;

    if (hadBefore && !hasNow) { trend = "improving"; latestValue = 15; }
    else if (!hadBefore && hasNow) { trend = "worsening"; firstValue = 15; }

    trends.push({ detection: tag, firstValue, latestValue, trend });
  });

  return trends;
}

export default function Progress() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: patientData, loading: patientLoading } = usePatientData();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loadingMilestones, setLoadingMilestones] = useState(true);
  const [treatmentCategory, setTreatmentCategory] = useState<string | null>(null);
  const [complianceStreak, setComplianceStreak] = useState(0);
  const [latestScan, setLatestScan] = useState<ScanRecord | null>(null);
  const [allScans, setAllScans] = useState<ScanRecord[]>([]);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [daysElapsed, setDaysElapsed] = useState<number>(0);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<Date>(new Date());

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data: patient } = await supabase
          .from("patients")
          .select("id, treatment_category, compliance_streak, start_date, estimated_end_date")
          .eq("user_id", user.id).maybeSingle();
        if (!patient) { logError("Patient record not found", { operation: "Progress/loadData", userId: user?.id }); return; }

        setPatientId(patient.id);
        setTreatmentCategory(patient.treatment_category);
        setComplianceStreak(patient.compliance_streak || 0);

        const start = patient.start_date ? new Date(patient.start_date) : new Date();
        setStartDate(start);
        const elapsed = patient.start_date ? Math.floor((Date.now() - start.getTime()) / 86400000) : 0;
        const remaining = patient.estimated_end_date ? Math.max(0, Math.floor((new Date(patient.estimated_end_date).getTime() - Date.now()) / 86400000)) : null;
        setDaysElapsed(elapsed);
        setDaysRemaining(remaining);

        const { data: milestonesData } = await supabase
          .from("treatment_milestones").select("id, title, target_date, completed_at")
          .eq("patient_id", patient.id).order("target_date", { ascending: true });
        setMilestones(milestonesData || []);

        const { data: scansData } = await supabase
          .from("scans")
          .select("id, submitted_at, quality_score, detection_tags, sent_to_doctor, ai_analysis")
          .eq("patient_id", patient.id)
          .order("submitted_at", { ascending: false });
        const mapped = (scansData || []).map((s: any) => ({
          ...s,
          detection_tags: Array.isArray(s.detection_tags) ? s.detection_tags : null,
          sent_to_doctor: s.sent_to_doctor ?? false,
        }));
        setAllScans(mapped);
        if (mapped.length > 0) setLatestScan(mapped[0]);
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
        .from("progress_shares" as any).insert({ patient_id: patientId } as any).select("share_token").single();
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

  // Computed data
  const weeklyData = computeWeeklyData(allScans, startDate);
  const weekStreak = computeStreak(allScans);
  const avgPerWeek = allScans.length > 0 ? allScans.length / Math.max(differenceInWeeks(new Date(), startDate), 1) : 0;
  const trends = computeTrends(allScans);
  const daysSinceLastScan = latestScan ? differenceInDays(new Date(), new Date(latestScan.submitted_at)) : 999;
  const hasUnsentScans = allScans.some((s) => !s.sent_to_doctor && s.detection_tags && s.detection_tags.length > 0);

  // Derive toothData from latest scan's AI analysis
  const latestToothData = aiTeethToToothData(latestScan?.ai_analysis?.teeth || []);

  // Extract per-tooth detections for 3D overlay
  const latestDetectionData: Record<string, ToothDetection[]> = {};
  for (const t of (latestScan?.ai_analysis?.teeth || [])) {
    if (t.id && Array.isArray(t.detections) && t.detections.length > 0) {
      latestDetectionData[t.id] = t.detections;
    }
  }

  return (
    <div className="min-h-screen bg-background px-5 py-8 max-w-[480px] mx-auto pb-24">
      <span className="mono-label text-muted-foreground">TREATMENT</span>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-6">Your Progress</h1>

      {/* Hero progress ring */}
      <div className="flex flex-col items-center mb-6">
        {patientLoading ? (
          <Skeleton className="w-[120px] h-[120px] rounded-full" />
        ) : (
          <ProgressRing
            value={progressPercent}
            status={notStarted ? "not_started" : progressPercent >= 50 ? "on_track" : "needs_attention"}
            subtitle={`${complianceStreak} scans completed`}
          />
        )}
        {treatmentCategory && (
          <span className="mono-label inline-block px-3 py-1 rounded-pill mt-4 bg-primary/10 text-primary">
            {CATEGORY_LABELS[treatmentCategory] || treatmentCategory}
          </span>
        )}
      </div>

      {/* Horizontal stat pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-6">
        <div className="flex-shrink-0 bg-card border border-border rounded-pill px-4 py-2 flex flex-col items-center">
          <span className="font-display text-lg font-semibold leading-none">{complianceStreak}</span>
          <span className="mono-label text-muted-foreground text-[10px] mt-0.5">SCANS</span>
        </div>
        <div className="flex-shrink-0 bg-card border border-border rounded-pill px-4 py-2 flex flex-col items-center">
          <span className="font-display text-lg font-semibold leading-none">{daysElapsed}</span>
          <span className="mono-label text-muted-foreground text-[10px] mt-0.5">DAYS IN</span>
        </div>
        {daysRemaining !== null && (
          <div className="flex-shrink-0 bg-card border border-border rounded-pill px-4 py-2 flex flex-col items-center">
            <span className="font-display text-lg font-semibold leading-none">{daysRemaining}</span>
            <span className="mono-label text-muted-foreground text-[10px] mt-0.5">DAYS LEFT</span>
          </div>
        )}
        <div className="flex-shrink-0 bg-card border border-border rounded-pill px-4 py-2 flex flex-col items-center">
          <span className="font-display text-lg font-semibold leading-none">{progressPercent}%</span>
          <span className="mono-label text-muted-foreground text-[10px] mt-0.5">COMPLETE</span>
        </div>
      </div>

      {/* 3D Tooth Map — prominent, moved up */}
      <div className="mb-6">
        <span className="mono-label text-muted-foreground mb-3 block">YOUR TOOTH MAP</span>
        <div className="rounded-card overflow-hidden bg-card border border-border dark">
          <div className="px-4 pt-5 pb-2 bg-card">
            <TeethVisualization showToggle showLegend toothData={latestToothData} detectionData={latestDetectionData} />
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
                  (latestScan?.quality_score ?? 0) >= 80 ? "bg-status-success" : (latestScan?.quality_score ?? 0) >= 50 ? "bg-status-warning" : "bg-status-danger"
                }`}
                style={{ width: `${latestScan?.quality_score ?? 0}%` }}
              />
            </div>
          </div>
          {latestScan && (
            <p className="px-5 pb-3 mono-label text-muted-foreground text-[10px]" style={{ background: "hsl(var(--card))" }}>
              Reflects your latest scan from {differenceInDays(new Date(), new Date(latestScan.submitted_at))} days ago
            </p>
          )}
          <div className="px-5 pb-4" style={{ background: "hsl(var(--card))" }}>
            <Button
              onClick={() => navigate("/patient/scan/3d-plus")}
              className="w-full rounded-pill mono-label bg-primary text-primary-foreground"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              Scan with 3D+
            </Button>
          </div>
        </div>
      </div>

      {/* Next Action */}
      <div className="mb-6">
        <NextActionCard
          daysSinceLastScan={daysSinceLastScan}
          hasUnsentScans={hasUnsentScans}
          hasUnreadReviews={false}
        />
      </div>

      {/* Scan Activity Chart */}
      {allScans.length > 0 && (
        <div className="mb-6">
          <ScanActivityChart
            weeklyData={weeklyData}
            currentStreak={weekStreak}
            averagePerWeek={avgPerWeek}
            totalScans={allScans.length}
          />
        </div>
      )}

      {/* Detection Trends */}
      {trends.length > 0 && (
        <div className="mb-6">
          <DetectionTrendCard trends={trends} />
        </div>
      )}

      {/* Milestones */}
      <div className="mb-8">
        <span className="mono-label text-muted-foreground mb-4 block">MILESTONES</span>
        {loadingMilestones ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-card" />)}
          </div>
        ) : milestones.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-card">
            <p className="text-sm text-muted-foreground italic">Your doctor will set treatment milestones here.</p>
          </div>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-4">
              {milestones.map((m) => (
                <div key={m.id} className="relative flex items-start gap-4">
                  <div className={`absolute -left-6 mt-1 w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    m.completed_at ? "border-status-success bg-status-success" : "border-border bg-background"
                  }`}>
                    {m.completed_at && (
                      <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-white" fill="currentColor">
                        <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div className="bg-card border border-border rounded-card px-4 py-3 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-body text-sm font-medium">{m.title}</span>
                      {m.completed_at && <span className="mono-label text-status-success text-[10px] flex-shrink-0">DONE</span>}
                    </div>
                    {m.target_date && (
                      <span className="mono-label text-muted-foreground text-[10px] mt-0.5 block">
                        {format(new Date(m.target_date), "dd MMM yyyy").toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Share + View History */}
      <div className="space-y-3">
        <Button onClick={() => navigate("/patient/scans")} className="w-full rounded-pill mono-label bg-primary text-primary-foreground">
          View Scan History <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
        <Button onClick={handleShareProgress} disabled={sharing || !patientId} variant="outline" className="w-full rounded-pill mono-label">
          {sharing ? "Generating..." : "Share Progress"}
        </Button>
      </div>

      <PatientBottomNav />
    </div>
  );
}
