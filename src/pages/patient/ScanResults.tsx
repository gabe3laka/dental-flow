import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TeethVisualization, type ToothStatus, type ToothDetection, type ToothGeometry, DETECTION_MATERIALS } from "@/components/3d/TeethVisualization";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { ScanPhotoGrid } from "@/components/patient/ScanPhotoGrid";
import { DetectionTagSheet } from "@/components/patient/DetectionTagSheet";
import { PointCloudViewer } from "@/lib/scanning/PointCloudViewer";
import { usePointCloudUrl } from "@/lib/scanning/usePointCloudUrl";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { ArrowLeft, Send, BookmarkPlus, CheckCircle2, AlertTriangle, ChevronRight, Loader2, X, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { SplatTabPanel } from "@/components/scanning/SplatTabPanel";

interface ScanData {
  id: string;
  quality_score: number | null;
  ai_analysis: any;
  detection_tags: string[] | null;
  sent_to_doctor: boolean;
  status: string;
  zones_captured: any;
  patient_id: string;
  pointcloud_url: string | null;
  processing_status: string | null;
  scan_type: string | null;
  splat_url: string | null;
}

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
  const [viewMode, setViewMode] = useState<"photos" | "3d" | "analysis" | "3d-plus">("analysis");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedTooth3D, setSelectedTooth3D] = useState<string | null>(null);
  const [zoneSignedUrls, setZoneSignedUrls] = useState<Record<string, string>>({});
  const [analysisPolling, setAnalysisPolling] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const { url: pointcloudSignedUrl } = usePointCloudUrl(scan?.pointcloud_url ?? null);

  // Initial load
  useEffect(() => {
    if (!scanId || !user) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("scans")
          .select("*")
          .eq("id", scanId)
          .single();
        if (data) {
          const row = data as Record<string, unknown>;
          const scanData: ScanData = {
            id: (row.id as string),
            quality_score: (row.quality_score as number | null) ?? null,
            ai_analysis: row.ai_analysis,
            detection_tags: Array.isArray(row.detection_tags) ? (row.detection_tags as string[]) : null,
            sent_to_doctor: (row.sent_to_doctor as boolean | null) ?? false,
            status: (row.status as string),
            zones_captured: row.zones_captured,
            patient_id: (row.patient_id as string),
            pointcloud_url: (row.pointcloud_url as string | null) ?? null,
            processing_status: (row.processing_status as string | null) ?? null,
            scan_type: (row.scan_type as string | null) ?? (row.source as string | null) ?? null,
            splat_url: (row.splat_url as string | null) ?? null,
          };
          setScan(scanData);
          // Start polling if AI analysis is missing OR 3D reconstruction
          // is still in flight (queued/processing).
          const aiPending =
            !scanData.ai_analysis ||
            !scanData.ai_analysis.teeth ||
            scanData.ai_analysis.teeth.length === 0;
          const reconPending =
            !!scanData.processing_status &&
            scanData.processing_status !== "complete" &&
            scanData.processing_status !== "failed";
          if (aiPending || reconPending) {
            setAnalysisPolling(true);
          }
        }
      } catch (e) {
        logError(e, { operation: "ScanResults/load", userId: user?.id });
      } finally {
        setLoading(false);
      }
    })();
  }, [scanId, user]);

  // Poll for AI analysis completion
  useEffect(() => {
    if (!analysisPolling || !scanId) return;
    pollCountRef.current = 0;

    pollRef.current = setInterval(async () => {
      pollCountRef.current++;
      // ~4 minutes at 3s interval — covers RunPod reconstruction window.
      if (pollCountRef.current > 80) {
        setAnalysisPolling(false);
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      try {
        const { data } = await supabase
          .from("scans")
          .select("ai_analysis, detection_tags, quality_score, processing_status, pointcloud_url, splat_url")
          .eq("id", scanId)
          .single();
        if (!data) return;
        const aiReady =
          !!data.ai_analysis && ((data.ai_analysis as any).teeth?.length ?? 0) > 0;
        const status = (data as any).processing_status as string | null;
        const pointcloudUrl = (data as any).pointcloud_url as string | null;
        const reconDone = status === "complete" && !!pointcloudUrl;
        const reconFailed = status === "failed";

        // Merge whatever has progressed into local state.
        setScan((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            ai_analysis: aiReady ? data.ai_analysis : prev.ai_analysis,
            detection_tags: Array.isArray(data.detection_tags)
              ? (data.detection_tags as string[])
              : prev.detection_tags,
            quality_score: data.quality_score ?? prev.quality_score,
            processing_status: status ?? prev.processing_status,
            pointcloud_url: pointcloudUrl ?? prev.pointcloud_url,
            splat_url: ((data as any).splat_url as string | null) ?? prev.splat_url,
          };
        });

        if (reconFailed) {
          toast({
            title: "Reconstruction failed",
            description: "We couldn't build a 3D map from this scan.",
            variant: "destructive",
          });
          setAnalysisPolling(false);
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }

        // Stop only when both AI analysis is in AND reconstruction is
        // resolved (or there was no reconstruction in flight to begin with).
        const reconResolved = !status || reconDone || status === "complete";
        if (aiReady && reconResolved) {
          setAnalysisPolling(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch { /* ignore polling errors */ }
    }, 3000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [analysisPolling, scanId]);

  // Load signed URLs for zone images (used in 3D tooth photo panel)
  useEffect(() => {
    if (!scan?.zones_captured || !Array.isArray(scan.zones_captured)) return;
    const zones: Array<{ zone: string; path: string }> = scan.zones_captured;
    if (!zones.length) return;
    (async () => {
      const urls: Record<string, string> = {};
      for (const z of zones) {
        try {
          const { data } = await supabase.storage.from("scan-videos").createSignedUrl(z.path, 3600);
          if (data?.signedUrl) urls[z.zone] = data.signedUrl;
        } catch { /* skip */ }
      }
      setZoneSignedUrls(urls);
    })();
  }, [scan?.zones_captured]);

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

      await supabase.from("scan_reviews").insert({
        scan_id: scan.id,
        doctor_id: patient.assigned_doctor_id,
        ai_analysis: scan.ai_analysis?.teeth || [],
        review_notes: patientNote || "Patient submitted for review",
        action_type: "none" as const,
      });

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

  const handleReanalyze = async () => {
    if (!scan || reanalyzing) return;
    setReanalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-scan-teeth", {
        body: { scan_id: scan.id },
      });
      if (error) throw error;
      // Update local state with fresh analysis
      if (data?.teeth) {
        setScan((prev) => prev ? {
          ...prev,
          ai_analysis: data,
          detection_tags: Array.isArray(data.detection_tags) ? data.detection_tags : prev.detection_tags,
        } : prev);
        toast({ title: "Analysis updated", description: "3D tooth map rebuilt from your scan photos." });
      }
    } catch (e: any) {
      toast({ title: "Re-analysis failed", description: e.message || "Could not re-analyze scan.", variant: "destructive" });
    } finally {
      setReanalyzing(false);
    }
  };

  const handleDelete = async () => {
    if (!scan) return;
    setDeleting(true);
    try {
      const zones: Array<{ zone: string; path: string | null }> = Array.isArray(scan.zones_captured) ? scan.zones_captured : [];
      const videoPaths = zones.map((z) => z.path).filter(Boolean) as string[];
      // Include the raw video itself (not just keyframes) when present.
      const rawPath = (scan as unknown as { raw_video_url?: string | null }).raw_video_url ?? null;
      if (rawPath && !videoPaths.includes(rawPath)) videoPaths.push(rawPath);
      if (videoPaths.length > 0) {
        await supabase.storage.from("scan-videos").remove(videoPaths);
      }
      // Reclaim the LingBot point-cloud `.ply`.
      if (scan.pointcloud_url) {
        await supabase.storage.from("scan-pointclouds").remove([scan.pointcloud_url]);
      }
      await supabase.from("scans").delete().eq("id", scan.id);
      const { data: pt } = await supabase.from("patients").select("id, total_scans").eq("id", scan.patient_id).maybeSingle();
      if (pt && (pt as any).total_scans > 0) {
        await supabase.from("patients").update({ total_scans: (pt as any).total_scans - 1 }).eq("id", scan.patient_id);
      }
      toast({ title: "Scan deleted" });
      navigate("/patient/scans");
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const getDetectionDetails = (tag: string) => {
    const teeth = scan?.ai_analysis?.teeth || [];
    const match = teeth.find((t: any) => t.zone?.toLowerCase().includes(tag.toLowerCase()) || t.status !== "healthy");
    return {
      severity: match?.status === "healthy" || match?.status === "on_track" ? "minor" : "moderate",
      confidence: match?.confidence ? parseFloat(match.confidence) / 100 : undefined,
      affectedTeeth: match ? [match.zone || match.id] : undefined,
    };
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
  const zones = Array.isArray(scan.zones_captured) ? scan.zones_captured : [];
  const toothData = aiTeethToToothData(teethData);

  // Extract per-tooth detections for 3D overlay
  const detectionDataMap: Record<string, ToothDetection[]> = {};
  for (const t of teethData) {
    if (t.id && Array.isArray(t.detections) && t.detections.length > 0) {
      detectionDataMap[t.id] = t.detections;
    }
  }

  // Extract per-tooth geometry for 3D position/rotation adjustments
  const toothGeometryMap: Record<string, ToothGeometry> = {};
  for (const t of teethData) {
    if (t.id && t.geometry && typeof t.geometry === "object") {
      toothGeometryMap[t.id] = t.geometry as ToothGeometry;
    }
  }

  // Helper: determine most relevant zone image for a tooth.
  // Handles both legacy zone names (UPPER/LOWER/FRONT/LEFT/RIGHT) and the
  // newer arch-style aliases (UPPER_ARCH/LOWER_ARCH/FRONT_SMILE/etc.).
  function getZoneForTooth(toothId: string): string | null {
    const frontIds = new Set(["T11", "T21", "T12", "T22", "T41", "T31", "T42", "T32"]);
    const isUpper = toothId.startsWith("T1") || toothId.startsWith("T2");
    const num = parseInt(toothId.slice(1));
    const candidates: string[] = [
      isUpper ? "UPPER" : "LOWER",
      isUpper ? "UPPER_ARCH" : "LOWER_ARCH",
    ];
    if (frontIds.has(toothId)) {
      candidates.push("FRONT", "FRONT_SMILE");
      candidates.push(isUpper ? "UPPER_CLOSE" : "LOWER_CLOSE");
    }
    if ((num >= 13 && num <= 18) || (num >= 43 && num <= 48)) candidates.push("RIGHT", "RIGHT_BITE");
    if ((num >= 23 && num <= 28) || (num >= 33 && num <= 38)) candidates.push("LEFT", "LEFT_BITE");
    // Close-up as final fallback
    candidates.push(isUpper ? "UPPER_CLOSE" : "LOWER_CLOSE");
    for (const c of candidates) {
      if (zoneSignedUrls[c]) return c;
      if (zoneSignedUrls[c.toLowerCase()]) return c.toLowerCase();
    }
    return null;
  }

  // If a detection tag is selected, highlight affected teeth
  const activeToothData = selectedTag ? (() => {
    const affected = teethData.filter((t: any) =>
      t.zone?.toLowerCase().includes(selectedTag.toLowerCase()) ||
      (Array.isArray(t.detections) && t.detections.some((d: any) => d.type === selectedTag.toLowerCase().replace(" ", "_"))) ||
      t.status !== "healthy"
    );
    if (affected.length === 0) return toothData;
    const highlighted: Record<string, ToothStatus> = {};
    for (const t of affected) {
      if (t.id) highlighted[t.id] = "attention";
    }
    return { ...toothData, ...highlighted };
  })() : toothData;

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
        <div className="flex items-center justify-between mb-3">
          <span className="mono-label text-primary">AI ANALYSIS</span>
          {!analysisPolling && zones.length > 0 && (
            <button
              onClick={handleReanalyze}
              disabled={reanalyzing}
              className="mono-label text-[10px] text-muted-foreground hover:text-primary transition flex items-center gap-1 disabled:opacity-50"
            >
              {reanalyzing ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> RE-ANALYZING...</>
              ) : (
                "↻ REFRESH FROM PHOTOS"
              )}
            </button>
          )}
        </div>

        {analysisPolling ? (
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <span className="text-sm text-muted-foreground">Analyzing your scan...</span>
          </div>
        ) : teethData.length > 0 ? (
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
          <p className="text-sm text-muted-foreground italic">No analysis data available for this scan.</p>
        )}
      </div>

      {/* Detection Tags — interactive */}
      {detections.length > 0 && (
        <div className="rounded-card bg-card border border-border p-4 mb-4">
          <span className="mono-label text-muted-foreground mb-3 block">DETECTIONS</span>
          <div className="flex flex-wrap gap-1.5">
            {detections.map((tag, i) => (
              <button
                key={i}
                onClick={() => setSelectedTag(tag)}
                className={`mono-label px-3 py-1.5 rounded-pill cursor-pointer transition ${
                  selectedTag === tag ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary hover:bg-primary/25"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex gap-1.5 mb-4">
        {(["analysis", "photos", "3d", "3d-plus"] as const).map((mode) => {
          const ready =
            (mode === "3d" && !!scan.pointcloud_url) ||
            (mode === "3d-plus" && !!scan.splat_url);
          return (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex-1 py-2 rounded-pill mono-label text-[10px] transition inline-flex items-center justify-center gap-1.5 ${
                viewMode === mode ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {ready && (
                <span
                  aria-label="ready"
                  className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse"
                />
              )}
              {mode === "analysis" ? "ANALYSIS"
                : mode === "photos" ? "PHOTOS"
                : mode === "3d" ? "3D MAP"
                : "3D PLUS"}
            </button>
          );
        })}
      </div>

      {viewMode === "photos" && (
        <div className="rounded-card bg-card border border-border p-4 mb-4">
          <ScanPhotoGrid
            scanId={scan.id}
            zonesCaptured={zones}
            annotations={scan.ai_analysis?.annotated_regions}
          />
        </div>
      )}

      {viewMode === "3d-plus" && <SplatTabPanel scanId={scan.id} />}

      {viewMode === "3d" && (
        <div className="rounded-card overflow-hidden bg-card border border-border mb-4 dark">
          {/* Header — point-cloud header */}
          <div className="px-4 py-2.5 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2">
              <span className="mono-label text-primary text-[10px]">3D MAP</span>
              {scan.scan_type && (
                <span className="mono-label text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                  {scan.scan_type.toUpperCase()}
                </span>
              )}
            </div>
            <span className="mono-label text-muted-foreground text-[9px]">
              {scan.processing_status === "complete" ? "READY" : (scan.processing_status ?? "QUEUED").toUpperCase()}
            </span>
          </div>

          {/* Point cloud */}
          <div className="bg-black">
            {scan.pointcloud_url ? (
              <PointCloudViewer plyUrl={pointcloudSignedUrl} height={360} />
            ) : (
              <div className="h-[360px] flex flex-col items-center justify-center gap-3 text-center px-6">
                {scan.processing_status === "failed" ? (
                  <>
                    <span className="mono-label text-destructive text-[10px]">RECONSTRUCTION FAILED</span>
                    <p className="text-white/40 text-xs">We couldn't build a 3D map from this scan. Try recording again.</p>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    <span className="mono-label text-white/55 text-[10px]">BUILDING YOUR 3D MAP…</span>
                    <p className="text-white/30 text-xs">Usually under 2 minutes after upload.</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* AI tooth-status overlay (procedural arch tinted by AI analysis) */}
          <div className="px-3 pt-3 pb-3 bg-card">
            <span className="mono-label text-muted-foreground text-[10px] block mb-2">AI TOOTH STATUS</span>
            <TeethVisualization
              compact
              showLegend
              showToggle={false}
              toothData={activeToothData}
              detectionData={detectionDataMap}
              toothGeometry={Object.keys(toothGeometryMap).length > 0 ? toothGeometryMap : undefined}
              onToothSelect={(id) => setSelectedTooth3D((prev) => (prev === id ? null : id))}
            />
          </div>

          {/* Zone photo + detection detail panel for selected tooth */}
          {selectedTooth3D && (() => {
            const findings = detectionDataMap[selectedTooth3D] ?? [];
            const zoneKey = getZoneForTooth(selectedTooth3D);
            const photoUrl = zoneKey ? zoneSignedUrls[zoneKey] : null;

            return (
              <div className="border-t border-border">
                <div className="flex gap-3 p-3 items-start">
                  {photoUrl && (
                    <div className="rounded-lg overflow-hidden flex-shrink-0 border border-border" style={{ width: 96, height: 72 }}>
                      <img src={photoUrl} alt={`${zoneKey} scan`} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="mono-label text-foreground text-xs">{selectedTooth3D}</span>
                      {zoneKey && (
                        <span className="mono-label text-muted-foreground text-[10px]">
                          {zoneKey.toUpperCase()} ZONE
                        </span>
                      )}
                    </div>
                    {findings.length === 0 ? (
                      <span className="mono-label text-status-success text-[10px]">NO DETECTIONS</span>
                    ) : (
                      <div className="space-y-0.5">
                        {findings.map((f, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <div
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: DETECTION_MATERIALS[f.type]?.color ?? "#888" }}
                            />
                            <span className="text-[10px] text-foreground capitalize">
                              {f.surface && `${f.surface} · `}{f.type.replace("_", " ")} · {f.severity}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedTooth3D(null)}
                    className="text-muted-foreground hover:text-foreground flex-shrink-0 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })()}

          {selectedTag && (
            <div className="px-4 pb-3 border-t border-border pt-2" style={{ background: "hsl(var(--card))" }}>
              <span className="mono-label text-primary block mb-1">SELECTED: {selectedTag.toUpperCase()}</span>
              <p className="text-xs text-muted-foreground">Affected teeth are highlighted on the 3D map above. Tap the tag again or another tag to change.</p>
            </div>
          )}
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
                  <Button onClick={() => setShowNoteInput(false)} variant="outline" className="flex-1 rounded-pill mono-label">
                    Cancel
                  </Button>
                  <Button onClick={handleSendToDoctor} disabled={sending} className="flex-1 rounded-pill mono-label bg-primary text-primary-foreground">
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    {sending ? "Sending..." : "Send"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={() => setShowNoteInput(true)} className="w-full rounded-pill mono-label bg-primary text-primary-foreground py-6">
                <Send className="w-4 h-4 mr-2" />
                Send to Doctor for Review
              </Button>
            )}
            <Button onClick={() => navigate("/patient/scans")} variant="outline" className="w-full rounded-pill mono-label py-6">
              <BookmarkPlus className="w-4 h-4 mr-2" />
              Save & Track Progress
            </Button>
            {/* Delete scan — only available before sending to doctor */}
            {confirmDelete ? (
              <div className="rounded-card border border-destructive/30 bg-destructive/5 p-4 flex items-center justify-between">
                <span className="mono-label text-destructive text-xs">DELETE THIS SCAN PERMANENTLY?</span>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="mono-label text-xs text-destructive border border-destructive/40 px-3 py-1.5 rounded-pill hover:bg-destructive/10 transition disabled:opacity-50"
                  >
                    {deleting ? "DELETING..." : "DELETE"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="mono-label text-xs text-muted-foreground hover:text-foreground transition px-2"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-1.5 py-3 mono-label text-xs text-muted-foreground hover:text-destructive transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Scan
              </button>
            )}
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

      {/* Detection Education Sheet */}
      {selectedTag && (
        <DetectionTagSheet
          tag={selectedTag}
          open={!!selectedTag}
          onClose={() => setSelectedTag(null)}
          {...getDetectionDetails(selectedTag)}
        />
      )}

      <PatientBottomNav />
    </div>
  );
}
