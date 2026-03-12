import { useState, useEffect } from "react";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { PillNav } from "@/components/ui/pill-nav";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ToothArch } from "@/components/patient/ToothArch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow, format } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import { logError } from "@/lib/logger";

const tabs = [
  { id: "all", label: "ALL" },
  { id: "reviewed", label: "REVIEWED" },
  { id: "pending", label: "PENDING" },
  { id: "flagged", label: "FLAGGED" },
];

type ScanRow = {
  id: string;
  submitted_at: string;
  status: string;
  quality_score: number | null;
  thumbnail_url: string | null;
  detection_tags: string[] | null;
};

type ReviewRow = {
  review_notes: string | null;
  response_video_url: string | null;
  doctor_id: string;
};

export default function ScanHistory() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("all");
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewRow | null>>({});

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    (async () => {
      try {
        const { data: patient } = await supabase
          .from("patients")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!patient) {
          logError("Patient record not found", { operation: "ScanHistory/loadScans", userId: user?.id });
          return;
        }

        let query = supabase
          .from("scans")
          .select("id, submitted_at, status, quality_score, thumbnail_url, detection_tags")
          .eq("patient_id", patient.id)
          .order("submitted_at", { ascending: false });

        if (activeTab !== "all") {
          query = query.eq("status", activeTab as "pending" | "reviewed" | "flagged" | "action_required");
        }

        const { data } = await query;
        setScans((data || []).map((s: any) => ({
          ...s,
          detection_tags: Array.isArray(s.detection_tags) ? s.detection_tags : null,
        })));
      } catch (e) {
        logError(e, { operation: "ScanHistory/loadScans", userId: user?.id });
      } finally {
        setLoading(false);
      }
    })();
  }, [user, activeTab]);

  const toggleExpand = async (scanId: string) => {
    if (expandedId === scanId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(scanId);
    if (!reviews[scanId]) {
      const { data } = await supabase
        .from("scan_reviews")
        .select("review_notes, response_video_url, doctor_id")
        .eq("scan_id", scanId)
        .limit(1)
        .maybeSingle();
      setReviews((r) => ({ ...r, [scanId]: data || null }));
    }
  };

  const formatDate = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 86400000 * 2) return formatDistanceToNow(new Date(d), { addSuffix: true });
    return format(new Date(d), "dd MMM · HH:mm").toUpperCase();
  };

  return (
    <div className="min-h-screen bg-background px-6 py-8 max-w-lg mx-auto pb-24">
      <span className="mono-label text-muted-foreground">YOUR SCANS</span>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-6">Scan History</h1>

      <PillNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} className="mb-6" />

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      ) : scans.length === 0 ? (
        <div className="text-center py-16">
          <p className="font-body text-muted-foreground text-sm mb-4">
            No scans yet. Submit your first scan to get started.
          </p>
          <Button className="rounded-pill bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-[0.15em] px-8 py-3">
            Start Scan
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {scans.map((scan, idx) => (
            <div key={scan.id} className="bg-card rounded-card border border-border overflow-hidden">
              <button
                onClick={() => toggleExpand(scan.id)}
                className="w-full flex items-center gap-4 p-4 text-left"
              >
                <div className="w-16 h-16 rounded-card bg-soft-panel flex items-center justify-center flex-shrink-0">
                  <span className="mono-label text-muted-foreground">SCAN</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[11px] tracking-[0.1em] text-muted-foreground">
                    {formatDate(scan.submitted_at)}
                  </p>
                  <p className="text-sm font-medium">SCAN #{String(scans.length - idx).padStart(3, "0")}</p>
                </div>
                <StatusBadge variant={scan.status as any} />
                {expandedId === scan.id ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </button>

              {expandedId === scan.id && (
                <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                  {/* Mini Scan Visualization Card */}
                  <div
                    className="rounded-lg overflow-hidden"
                    style={{
                      background: "hsl(218 26% 11%)",
                      border: "1px solid hsl(0 0% 100% / 0.07)",
                    }}
                  >
                    <div className="px-3 pt-3 pb-1">
                      <ToothArch className="[&_text]:!fill-[hsl(38_23%_90%_/_0.4)] max-w-[280px]" />
                    </div>
                    {/* Quality bar */}
                    <div className="px-4 pb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[8px] tracking-[0.15em] uppercase" style={{ color: "hsl(38 23% 90% / 0.4)" }}>QUALITY</span>
                        <span className="font-mono text-[10px] font-semibold" style={{ color: "hsl(38 23% 90%)" }}>
                          {scan.quality_score != null ? `${Math.round(scan.quality_score)}%` : "—"}
                        </span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: "hsl(220 24% 16%)" }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${scan.quality_score ?? 0}%`,
                            background:
                              (scan.quality_score ?? 0) >= 80
                                ? "hsl(142 71% 45%)"
                                : (scan.quality_score ?? 0) >= 50
                                  ? "hsl(45 93% 47%)"
                                  : "hsl(0 84% 60%)",
                          }}
                        />
                      </div>
                    </div>
                    {/* Detection Tags */}
                    {scan.detection_tags && scan.detection_tags.length > 0 && (
                      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                        {scan.detection_tags.map((tag, i) => (
                          <span
                            key={i}
                            className="font-mono text-[8px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-full"
                            style={{
                              background: "hsl(228 100% 62% / 0.15)",
                              color: "hsl(228 100% 72%)",
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Doctor Review Info */}
                  {reviews[scan.id] ? (
                    <div className="space-y-2">
                      <p className="text-sm text-foreground">
                        Doctor reviewed this scan
                      </p>
                      {reviews[scan.id]!.review_notes && (
                        <p className="text-xs text-muted-foreground">
                          {reviews[scan.id]!.review_notes}
                        </p>
                      )}
                      {reviews[scan.id]!.response_video_url && (
                        <div className="w-full h-32 rounded-card bg-popover flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                            <div className="w-0 h-0 border-l-[10px] border-l-primary border-y-[6px] border-y-transparent ml-1" />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : reviews[scan.id] === null ? (
                    <p className="text-xs text-muted-foreground italic">
                      Awaiting your doctor's review
                    </p>
                  ) : (
                    <Skeleton className="h-8" />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <PatientBottomNav />
    </div>
  );
}
