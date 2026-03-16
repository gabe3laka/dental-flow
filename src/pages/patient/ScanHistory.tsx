import { useState, useEffect } from "react";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { PillNav } from "@/components/ui/pill-nav";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TeethVisualization, type ToothStatus } from "@/components/3d/TeethVisualization";
import { DetectionTagSheet } from "@/components/patient/DetectionTagSheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import { ChevronDown, ChevronUp, Camera, RotateCw, Sparkles, Send } from "lucide-react";
import { logError } from "@/lib/logger";
import { toast } from "@/hooks/use-toast";

type ScanRow = {
  id: string;
  submitted_at: string;
  status: string;
  quality_score: number | null;
  thumbnail_url: string | null;
  detection_tags: string[] | null;
  sent_to_doctor: boolean;
  patient_id: string;
  ai_analysis: any;
};

type ReviewRow = {
  review_notes: string | null;
  response_video_url: string | null;
  doctor_id: string;
};

/** Map AI analysis teeth array to toothData for 3D visualization */
function aiTeethToToothData(teeth: any[]): Record<string, ToothStatus> {
  const map: Record<string, ToothStatus> = {};
  if (!Array.isArray(teeth)) return map;
  for (const t of teeth) {
    const id = t.id;
    if (!id) continue;
    const status = t.status;
    if (status === "on_track" || status === "healthy") map[id] = "on_track";
    else if (status === "deviation") map[id] = "deviation";
    else map[id] = "attention";
  }
  return map;
}

export default function ScanHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all");
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [allScans, setAllScans] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewRow | null>>({});
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [highlightedTag, setHighlightedTag] = useState<string | null>(null);

  const SCAN_COLUMNS = "id, submitted_at, status, quality_score, thumbnail_url, detection_tags, sent_to_doctor, patient_id, ai_analysis" as const;

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: patient } = await supabase
        .from("patients").select("id").eq("user_id", user.id).maybeSingle();
      if (!patient) return;
      const { data } = await supabase
        .from("scans")
        .select(SCAN_COLUMNS)
        .eq("patient_id", patient.id)
        .order("submitted_at", { ascending: false });
      const mapped = (data || []).map((s: any) => ({
        ...s,
        detection_tags: Array.isArray(s.detection_tags) ? s.detection_tags : null,
        sent_to_doctor: s.sent_to_doctor ?? false,
        ai_analysis: s.ai_analysis ?? null,
      }));
      setAllScans(mapped);
    })();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    (async () => {
      try {
        const { data: patient } = await supabase
          .from("patients").select("id").eq("user_id", user.id).maybeSingle();
        if (!patient) { logError("Patient record not found", { operation: "ScanHistory/loadScans", userId: user?.id }); return; }

        let query = supabase
          .from("scans")
          .select(SCAN_COLUMNS)
          .eq("patient_id", patient.id)
          .order("submitted_at", { ascending: false });

        if (activeTab !== "all") {
          query = query.eq("status", activeTab as "pending" | "reviewed" | "flagged" | "action_required");
        }

        const { data } = await query;
        setScans((data || []).map((s: any) => ({
          ...s,
          detection_tags: Array.isArray(s.detection_tags) ? s.detection_tags : null,
          sent_to_doctor: s.sent_to_doctor ?? false,
          ai_analysis: s.ai_analysis ?? null,
        })));
      } catch (e) {
        logError(e, { operation: "ScanHistory/loadScans", userId: user?.id });
      } finally {
        setLoading(false);
      }
    })();
  }, [user, activeTab]);

  const toggleExpand = async (scanId: string) => {
    if (expandedId === scanId) { setExpandedId(null); setHighlightedTag(null); return; }
    setExpandedId(scanId);
    setHighlightedTag(null);
    if (!reviews[scanId]) {
      const { data } = await supabase
        .from("scan_reviews")
        .select("review_notes, response_video_url, doctor_id")
        .eq("scan_id", scanId).limit(1).maybeSingle();
      setReviews((r) => ({ ...r, [scanId]: data || null }));
    }
  };

  const formatDate = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 86400000 * 2) return formatDistanceToNow(new Date(d), { addSuffix: true });
    return format(new Date(d), "dd MMM · HH:mm").toUpperCase();
  };

  const counts = {
    all: allScans.length,
    reviewed: allScans.filter((s) => s.status === "reviewed").length,
    pending: allScans.filter((s) => s.status === "pending").length,
    flagged: allScans.filter((s) => s.status === "flagged" || s.status === "action_required").length,
  };

  const tabs = [
    { id: "all", label: `ALL (${counts.all})` },
    { id: "reviewed", label: `REVIEWED (${counts.reviewed})` },
    { id: "pending", label: `PENDING (${counts.pending})` },
    { id: "flagged", label: `FLAGGED (${counts.flagged})` },
  ];

  /** Get toothData for a scan, with optional tag highlight */
  const getToothData = (scan: ScanRow): Record<string, ToothStatus> => {
    const base = aiTeethToToothData(scan.ai_analysis?.teeth || []);
    if (!highlightedTag || expandedId !== scan.id) return base;
    // Highlight teeth related to the selected detection tag
    const teeth = scan.ai_analysis?.teeth || [];
    const affected = teeth.filter((t: any) =>
      t.zone?.toLowerCase().includes(highlightedTag.toLowerCase()) || t.status !== "healthy"
    );
    const highlighted: Record<string, ToothStatus> = {};
    for (const t of affected) {
      if (t.id) highlighted[t.id] = "attention";
    }
    return { ...base, ...highlighted };
  };

  return (
    <div className="min-h-screen bg-background px-5 py-8 max-w-[480px] mx-auto pb-24">
      <span className="mono-label text-muted-foreground">YOUR SCANS</span>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-6">Scan History</h1>

      <PillNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} className="mb-6" />

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-card" />)}
        </div>
      ) : scans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <Camera className="w-7 h-7 text-primary" />
          </div>
          <h2 className="font-display text-base font-medium mb-2">No scans yet</h2>
          <p className="font-body text-muted-foreground text-sm mb-6 text-center max-w-[280px]">
            Your first scan takes about 60 seconds and is reviewed within 24 hours.
          </p>
          <div className="flex items-center gap-6 mb-6">
            {[
              { icon: Camera, label: "Position phone" },
              { icon: RotateCw, label: "Capture 5 angles" },
              { icon: Sparkles, label: "Get AI analysis" },
            ].map((step) => (
              <div key={step.label} className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <step.icon className="w-4 h-4 text-primary" />
                </div>
                <span className="mono-label text-muted-foreground">{step.label}</span>
              </div>
            ))}
          </div>
          <Button onClick={() => navigate("/patient/scan")} className="rounded-pill bg-primary text-primary-foreground mono-label px-8 py-3">
            Start Your First Scan
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {scans.map((scan, idx) => (
            <div key={scan.id} className="bg-card rounded-card border border-border overflow-hidden shadow-sm">
              <button onClick={() => toggleExpand(scan.id)} className="w-full flex items-center gap-4 p-4 text-left">
                <div className="w-16 h-16 rounded-card bg-soft-panel flex items-center justify-center flex-shrink-0">
                  <span className="mono-label text-muted-foreground">SCAN</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="mono-label text-muted-foreground">{formatDate(scan.submitted_at)}</p>
                  <p className="text-sm font-medium">SCAN #{String(scans.length - idx).padStart(3, "0")}</p>
                  <p className="mono-label mt-0.5" style={{ fontSize: 9 }}>
                    {scan.sent_to_doctor ? (
                      <span className="text-status-success">SENT TO DOCTOR</span>
                    ) : (
                      <span className="text-muted-foreground">AI ANALYZED · NOT SENT</span>
                    )}
                  </p>
                </div>
                <StatusBadge variant={scan.status as any} />
                {expandedId === scan.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>

              {expandedId === scan.id && (
                <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                  <div className="rounded-lg overflow-hidden bg-card border border-border dark">
                    <div className="px-3 pt-3 pb-1 bg-card">
                      <TeethVisualization compact showLegend showToggle={false} toothData={getToothData(scan)} />
                    </div>
                    <div className="px-4 pb-3" style={{ background: "hsl(var(--card))" }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="mono-label text-muted-foreground">QUALITY</span>
                        <span className="mono-label font-semibold text-foreground">
                          {scan.quality_score != null ? `${Math.round(scan.quality_score)}%` : "—"}
                        </span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${
                            (scan.quality_score ?? 0) >= 80 ? "bg-status-success" : (scan.quality_score ?? 0) >= 50 ? "bg-status-warning" : "bg-status-danger"
                          }`}
                          style={{ width: `${scan.quality_score ?? 0}%` }}
                        />
                      </div>
                    </div>
                    {scan.detection_tags && scan.detection_tags.length > 0 && (
                      <div className="px-4 pb-3 flex flex-wrap gap-1.5" style={{ background: "hsl(var(--card))" }}>
                        {scan.detection_tags.map((tag, i) => (
                          <button
                            key={i}
                            onClick={(e) => {
                              e.stopPropagation();
                              setHighlightedTag(highlightedTag === tag ? null : tag);
                            }}
                            className={`mono-label px-2 py-0.5 rounded-full transition ${
                              highlightedTag === tag
                                ? "bg-primary text-primary-foreground"
                                : "bg-primary/15 text-primary hover:bg-primary/25"
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                    {highlightedTag && (
                      <div className="px-4 pb-3" style={{ background: "hsl(var(--card))" }}>
                        <p className="text-xs text-muted-foreground">
                          Tap a tag to highlight affected teeth. Tap again to deselect.
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedTag(highlightedTag); }}
                            className="ml-1 text-primary underline"
                          >
                            Learn more
                          </button>
                        </p>
                      </div>
                    )}
                  </div>

                  {!scan.sent_to_doctor ? (
                    <div className="flex gap-2">
                      <Button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const { data: patient } = await supabase
                              .from("patients").select("assigned_doctor_id").eq("id", scan.patient_id).single();
                            if (!patient?.assigned_doctor_id) {
                              toast({ title: "No doctor assigned", description: "Find a doctor in Chat tab first.", variant: "destructive" });
                              return;
                            }
                            await supabase.from("scan_reviews").insert({
                              scan_id: scan.id, doctor_id: patient.assigned_doctor_id,
                              review_notes: "Patient submitted for review", action_type: "none" as const,
                            });
                            await supabase.from("scans").update({
                              sent_to_doctor: true, sent_to_doctor_at: new Date().toISOString(),
                            } as any).eq("id", scan.id);
                            setScans((prev) => prev.map((s) => s.id === scan.id ? { ...s, sent_to_doctor: true } : s));
                            setAllScans((prev) => prev.map((s) => s.id === scan.id ? { ...s, sent_to_doctor: true } : s));
                            toast({ title: "Sent to doctor!", description: "Your doctor will review this scan." });
                          } catch (err: any) {
                            toast({ title: "Error", description: err.message, variant: "destructive" });
                          }
                        }}
                        size="sm" className="rounded-pill mono-label bg-primary text-primary-foreground"
                      >
                        <Send className="w-3 h-3 mr-1" />Send to Doctor
                      </Button>
                      <Button onClick={() => navigate(`/patient/scans/${scan.id}/results`)} size="sm" variant="outline" className="rounded-pill mono-label">
                        View Results
                      </Button>
                    </div>
                  ) : reviews[scan.id] ? (
                    <div className="space-y-2">
                      <p className="text-sm text-foreground">Doctor reviewed this scan</p>
                      {reviews[scan.id]!.review_notes && <p className="text-xs text-muted-foreground">{reviews[scan.id]!.review_notes}</p>}
                      {reviews[scan.id]!.response_video_url && (
                        <div className="w-full h-32 rounded-card bg-popover flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                            <div className="w-0 h-0 border-l-[10px] border-l-primary border-y-[6px] border-y-transparent ml-1" />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : reviews[scan.id] === null ? (
                    <p className="text-xs text-muted-foreground italic">Awaiting your doctor's review</p>
                  ) : (
                    <Skeleton className="h-8" />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedTag && (
        <DetectionTagSheet tag={selectedTag} open={!!selectedTag} onClose={() => setSelectedTag(null)} />
      )}

      <PatientBottomNav />
    </div>
  );
}
