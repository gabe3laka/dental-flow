import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TeethVisualization, type ToothStatus, type ToothDetection, type ToothGeometry, DETECTION_MATERIALS } from "@/components/3d/TeethVisualization";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { ScanPhotoGrid } from "@/components/patient/ScanPhotoGrid";
import { DetectionTagSheet } from "@/components/patient/DetectionTagSheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { ArrowLeft, Send, BookmarkPlus, CheckCircle2, AlertTriangle, ChevronRight, Loader2, X } from "lucide-react";
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
  const [viewMode, setViewMode] = useState<"photos" | "3d" | "analysis">("analysis");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedTooth3D, setSelectedTooth3D] = useState<string | null>(null);
  const [zoneSignedUrls, setZoneSignedUrls] = useState<Record<string, string>>({});
  const [analysisPolling, setAnalysisPolling] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  // Initial load
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
          const scanData: ScanData = {
            ...data,
            detection_tags: Array.isArray(data.detection_tags) ? (data.detection_tags as string[]) : null,
            sent_to_doctor: (data as any).sent_to_doctor ?? false,
            ai_analysis: (data as any).ai_analysis,
          };
          setScan(scanData);
          // Start polling if ai_analysis is empty
          if (!scanData.ai_analysis || !scanData.ai_analysis.teeth || scanData.ai_analysis.teeth.length === 0) {
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
      if (pollCountRef.current > 10) {
        setAnalysisPolling(false);
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      try {
        const { data } = await supabase
          .from("scans")
          .select("ai_analysis, detection_tags, quality_score")
          .eq("id", scanId)
          .single();
        if (data?.ai_analysis && (data.ai_analysis as any).teeth?.length > 0) {
          setScan((prev) => prev ? {
            ...prev,
            ai_analysis: data.ai_analysis,
            detection_tags: Array.isArray(data.detection_tags) ? (data.detection_tags as string[]) : prev.detection_tags,
            quality_score: data.quality_score ?? prev.quality_score,
          } : prev);
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

  // Helper: determine most relevant zone image for a tooth
  function getZoneForTooth(toothId: string): string | null {
    const frontIds = new Set(["T11", "T21", "T12", "T22", "T41", "T31", "T42", "T32"]);
    const isUpper = toothId.startsWith("T1") || toothId.startsWith("T2");
    const num = parseInt(toothId.slice(1));
    const candidates: string[] = [isUpper ? "UPPER" : "LOWER"];
    if (frontIds.has(toothId)) candidates.push("FRONT");
    if ((num >= 13 && num <= 18) || (num >= 43 && num <= 48)) candidates.push("RIGHT");
    if ((num >= 23 && num <= 28) || (num >= 33 && num <= 38)) candidates.push("LEFT");
    // Also try lowercase zone keys (ScanPhotoGrid stores them as lowercase)
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
      <div className="flex gap-2 mb-4">
        {(["analysis", "photos", "3d"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`flex-1 py-2 rounded-pill mono-label transition ${
              viewMode === mode ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {mode === "analysis" ? "ANALYSIS" : mode === "photos" ? "PHOTOS" : "3D MAP"}
          </button>
        ))}
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

      {viewMode === "3d" && (
        <div className="rounded-card overflow-hidden bg-card border border-border mb-4 dark">
          <div className="px-3 pt-3 pb-3 bg-card">
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
