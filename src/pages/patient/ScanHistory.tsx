import { useState, useEffect } from "react";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { PillNav } from "@/components/ui/pill-nav";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DetectionTagSheet } from "@/components/patient/DetectionTagSheet";
import { ScanResultTabs } from "@/components/scanning/ScanResultTabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import { ChevronDown, ChevronUp, Camera, RotateCw, Sparkles, Send, Trash2, CheckSquare, Square, X } from "lucide-react";
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
  zones_captured: any;
  pointcloud_url?: string | null;
  raw_video_url?: string | null;
};

type ReviewRow = {
  review_notes: string | null;
  response_video_url: string | null;
  doctor_id: string;
};

export default function ScanHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("all");
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [allScans, setAllScans] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewRow | null>>({});
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const SCAN_COLUMNS = "id, submitted_at, status, quality_score, thumbnail_url, detection_tags, sent_to_doctor, patient_id, ai_analysis, zones_captured, pointcloud_url, raw_video_url" as const;

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

  const loadReview = async (scanId: string) => {
    if (reviews[scanId] !== undefined) return;
    const { data } = await supabase
      .from("scan_reviews")
      .select("review_notes, response_video_url, doctor_id")
      .eq("scan_id", scanId).limit(1).maybeSingle();
    setReviews((r) => ({ ...r, [scanId]: data || null }));
  };

  const toggleExpand = async (scanId: string) => {
    if (expandedId === scanId) { setExpandedId(null); return; }
    setExpandedId(scanId);
    await loadReview(scanId);
  };

  // Auto-expand a scan when arriving via ?scan=<id> (e.g. straight from a
  // capture, or the "scan ready" toast) so results show without an extra tap.
  useEffect(() => {
    const target = searchParams.get("scan");
    if (target) {
      setExpandedId(target);
      void loadReview(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const deleteScanRecord = async (scan: ScanRow) => {
    const zones: Array<{ zone: string; path: string | null }> = Array.isArray(scan.zones_captured) ? scan.zones_captured : [];
    const videoPaths = zones.map((z) => z.path).filter(Boolean) as string[];
    if (scan.raw_video_url && !videoPaths.includes(scan.raw_video_url)) {
      videoPaths.push(scan.raw_video_url);
    }
    if (videoPaths.length > 0) {
      await supabase.storage.from("scan-videos").remove(videoPaths);
    }
    if (scan.pointcloud_url) {
      await supabase.storage.from("scan-pointclouds").remove([scan.pointcloud_url]);
    }
    await supabase.from("scans").delete().eq("id", scan.id);
    const { data: pt } = await supabase.from("patients").select("id, total_scans").eq("id", scan.patient_id).maybeSingle();
    if (pt && (pt as any).total_scans > 0) {
      await supabase.from("patients").update({ total_scans: (pt as any).total_scans - 1 }).eq("id", scan.patient_id);
    }
  };

  const handleDelete = async (scan: ScanRow) => {
    setDeleting(scan.id);
    try {
      await deleteScanRecord(scan);
      setScans((prev) => prev.filter((s) => s.id !== scan.id));
      setAllScans((prev) => prev.filter((s) => s.id !== scan.id));
      setConfirmDeleteId(null);
      toast({ title: "Scan deleted" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkConfirm(false);
  };

  const toggleSelect = (scan: ScanRow) => {
    if (scan.sent_to_doctor) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(scan.id)) next.delete(scan.id); else next.add(scan.id);
      return next;
    });
  };

  const selectableScans = scans.filter((s) => !s.sent_to_doctor);

  const handleBulkDelete = async () => {
    const targets = scans.filter((s) => selectedIds.has(s.id) && !s.sent_to_doctor);
    if (targets.length === 0) return;
    setBulkDeleting(true);
    let ok = 0;
    let fail = 0;
    const deletedIds: string[] = [];
    for (const scan of targets) {
      try {
        await deleteScanRecord(scan);
        deletedIds.push(scan.id);
        ok++;
      } catch (e) {
        fail++;
        logError(e, { operation: "ScanHistory/bulkDelete", userId: scan.id });
      }
    }
    if (deletedIds.length > 0) {
      setScans((prev) => prev.filter((s) => !deletedIds.includes(s.id)));
      setAllScans((prev) => prev.filter((s) => !deletedIds.includes(s.id)));
    }
    setBulkDeleting(false);
    exitSelectMode();
    if (fail === 0) {
      toast({ title: `Deleted ${ok} scan${ok === 1 ? "" : "s"}` });
    } else {
      toast({ title: `Deleted ${ok}, failed ${fail}`, variant: "destructive" });
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

  return (
    <div className="min-h-screen bg-background px-5 py-8 max-w-[480px] mx-auto pb-24">
      <div className="flex items-start justify-between mb-6">
        <div>
          <span className="mono-label text-muted-foreground">YOUR SCANS</span>
          <h1 className="font-display text-2xl font-semibold mt-1">Scan History</h1>
        </div>
        {!selectMode ? (
          selectableScans.length > 0 && (
            <button
              onClick={() => setSelectMode(true)}
              className="mono-label text-muted-foreground hover:text-foreground transition border border-border rounded-pill px-3 py-1.5"
            >
              SELECT
            </button>
          )
        ) : (
          <button
            onClick={exitSelectMode}
            className="mono-label text-muted-foreground hover:text-foreground transition flex items-center gap-1 border border-border rounded-pill px-3 py-1.5"
          >
            <X className="w-3 h-3" /> CANCEL
          </button>
        )}
      </div>

      {selectMode && (
        <div className="mb-4 p-3 rounded-card border border-border bg-card flex items-center justify-between gap-2 flex-wrap">
          <span className="mono-label text-foreground">{selectedIds.size} SELECTED</span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                if (selectedIds.size === selectableScans.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(selectableScans.map((s) => s.id)));
              }}
              className="mono-label text-muted-foreground hover:text-foreground transition"
            >
              {selectedIds.size === selectableScans.length && selectableScans.length > 0 ? "CLEAR" : "SELECT ALL"}
            </button>
            {bulkConfirm ? (
              <>
                <span className="mono-label text-destructive text-[10px]">DELETE {selectedIds.size}?</span>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="mono-label text-[10px] text-destructive border border-destructive/40 px-2 py-0.5 rounded-pill hover:bg-destructive/10 transition disabled:opacity-50"
                >
                  {bulkDeleting ? "DELETING..." : "YES, DELETE"}
                </button>
                <button
                  onClick={() => setBulkConfirm(false)}
                  disabled={bulkDeleting}
                  className="mono-label text-[10px] text-muted-foreground hover:text-foreground transition"
                >
                  CANCEL
                </button>
              </>
            ) : (
              <button
                onClick={() => setBulkConfirm(true)}
                disabled={selectedIds.size === 0}
                className="mono-label text-destructive border border-destructive/40 px-3 py-1 rounded-pill hover:bg-destructive/10 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> DELETE ({selectedIds.size})
              </button>
            )}
          </div>
        </div>
      )}

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
            A scan takes about 25 seconds — we turn it into a 3D map of your teeth.
          </p>
          <div className="flex items-center gap-6 mb-6">
            {[
              { icon: Camera, label: "Record a sweep" },
              { icon: RotateCw, label: "Build 3D map" },
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
              <button
                onClick={() => selectMode ? toggleSelect(scan) : toggleExpand(scan.id)}
                className="w-full flex items-center gap-4 p-4 text-left"
              >
                {selectMode && (
                  <div className="flex-shrink-0">
                    {scan.sent_to_doctor ? (
                      <Square className="w-5 h-5 text-muted-foreground/30" />
                    ) : selectedIds.has(scan.id) ? (
                      <CheckSquare className="w-5 h-5 text-primary" />
                    ) : (
                      <Square className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                )}
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
                {!selectMode && (expandedId === scan.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />)}
              </button>

              {!selectMode && expandedId === scan.id && (
                <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                  {scan.quality_score != null && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="mono-label text-muted-foreground">QUALITY</span>
                        <span className="mono-label font-semibold text-foreground">
                          {`${Math.round(scan.quality_score)}%`}
                        </span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${
                            scan.quality_score >= 80 ? "bg-status-success" : scan.quality_score >= 50 ? "bg-status-warning" : "bg-status-danger"
                          }`}
                          style={{ width: `${scan.quality_score}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {scan.detection_tags && scan.detection_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {scan.detection_tags.map((tag, i) => (
                        <button
                          key={i}
                          onClick={(e) => { e.stopPropagation(); setSelectedTag(tag); }}
                          className="mono-label px-2 py-0.5 rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}

                  <ScanResultTabs scanId={scan.id} />

                  {!scan.sent_to_doctor ? (
                    <div className="space-y-2">
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
                      </div>
                      {/* Delete — only for unsent scans */}
                      {confirmDeleteId === scan.id ? (
                        <div className="flex items-center gap-2 pt-1">
                          <span className="mono-label text-destructive text-[10px]">DELETE THIS SCAN?</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(scan); }}
                            disabled={deleting === scan.id}
                            className="mono-label text-[10px] text-destructive border border-destructive/40 px-2 py-0.5 rounded-pill hover:bg-destructive/10 transition disabled:opacity-50"
                          >
                            {deleting === scan.id ? "DELETING..." : "YES, DELETE"}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                            className="mono-label text-[10px] text-muted-foreground hover:text-foreground transition"
                          >
                            CANCEL
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(scan.id); }}
                          className="flex items-center gap-1 mono-label text-[10px] text-muted-foreground hover:text-destructive transition pt-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          DELETE SCAN
                        </button>
                      )}
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
