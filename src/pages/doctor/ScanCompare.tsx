import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { logError } from "@/lib/logger";

export default function ScanCompare() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // Support both ?a=&b= and ?ids=id1,id2 formats
  const idsParam = searchParams.get("ids");
  const scanA = searchParams.get("a") || (idsParam ? idsParam.split(",")[0] : null);
  const scanB = searchParams.get("b") || (idsParam ? idsParam.split(",")[1] : null);
  const [dataA, setDataA] = useState<any>(null);
  const [dataB, setDataB] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!scanA || !scanB) return;
    (async () => {
      try {
        const [resResultA, resResultB] = await Promise.allSettled([
          supabase.from("scans").select("*").eq("id", scanA).maybeSingle(),
          supabase.from("scans").select("*").eq("id", scanB).maybeSingle(),
        ]);
        if (resResultA.status === "rejected") {
          logError(resResultA.reason, { operation: "ScanCompare/fetchScanA" });
        }
        if (resResultB.status === "rejected") {
          logError(resResultB.reason, { operation: "ScanCompare/fetchScanB" });
        }
        const scanAData = resResultA.status === "fulfilled" ? resResultA.value.data : null;
        const scanBData = resResultB.status === "fulfilled" ? resResultB.value.data : null;
        if (!scanAData) logError("Scan A not found for comparison", { operation: "ScanCompare/loadData" });
        if (!scanBData) logError("Scan B not found for comparison", { operation: "ScanCompare/loadData" });
        setDataA(scanAData);
        setDataB(scanBData);

        // Fetch AI analysis from latest reviews
        const [revResultA, revResultB] = await Promise.allSettled([
          supabase.from("scan_reviews").select("ai_analysis").eq("scan_id", scanA).order("reviewed_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("scan_reviews").select("ai_analysis").eq("scan_id", scanB).order("reviewed_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (revResultA.status === "rejected") {
          logError(revResultA.reason, { operation: "ScanCompare/fetchReviewA" });
        }
        if (revResultB.status === "rejected") {
          logError(revResultB.reason, { operation: "ScanCompare/fetchReviewB" });
        }
        const revAData = revResultA.status === "fulfilled" ? revResultA.value.data : null;
        const revBData = revResultB.status === "fulfilled" ? revResultB.value.data : null;
        if (revAData?.ai_analysis) setDataA((prev: any) => ({ ...prev, aiAnalysis: revAData.ai_analysis }));
        if (revBData?.ai_analysis) setDataB((prev: any) => ({ ...prev, aiAnalysis: revBData.ai_analysis }));
      } catch (e) { logError(e, { operation: "ScanCompare/loadData" }); }
      finally { setLoading(false); }
    })();
  }, [scanA, scanB]);

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex gap-6" style={{ background: "hsl(216 32% 7%)" }}>
        <Skeleton className="flex-1 h-96 rounded-card" />
        <Skeleton className="w-48 h-96 rounded-card" />
        <Skeleton className="flex-1 h-96 rounded-card" />
      </div>
    );
  }

  const renderScanPanel = (scan: any, label: string) => (
    <div className="flex-1 rounded-card p-6" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
      <span className="mono-label mb-3 block" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{label}</span>
      {scan ? (
        <>
          <div className="aspect-[4/3] rounded-card flex items-center justify-center mb-4" style={{ background: "hsl(220 24% 16%)" }}>
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.2)" }}>SCAN IMAGE</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>DATE</span>
              <span className="mono-label" style={{ color: "hsl(38 23% 90%)" }}>{format(new Date(scan.submitted_at), "dd MMM yyyy").toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>QUALITY</span>
              <span className="mono-label" style={{ color: "hsl(38 23% 90%)" }}>Q{scan.quality_score || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>STATUS</span>
              <span className="mono-label" style={{ color: "hsl(228 100% 62%)" }}>{scan.status?.toUpperCase()}</span>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm" style={{ color: "hsl(38 23% 90% / 0.3)" }}>Scan not found.</p>
      )}
    </div>
  );

  const getQualityDelta = () => {
    if (!dataA?.quality_score || !dataB?.quality_score) return null;
    return dataB.quality_score - dataA.quality_score;
  };

  const delta = getQualityDelta();

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "hsl(216 32% 7%)", color: "hsl(38 23% 90%)" }}>
      <button onClick={() => navigate(-1)} className="mono-label text-muted-foreground hover:text-foreground transition-colors mb-6">
        ← BACK
      </button>
      <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>SCAN COMPARISON</span>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-8">Side by Side</h1>

      <div className="flex flex-col lg:flex-row gap-6">
        {renderScanPanel(dataA, "SCAN A (EARLIER)")}

        {/* Delta column */}
        <div className="w-full lg:w-48 rounded-card p-4 flex flex-col items-center justify-center gap-4" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
          <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>DELTA</span>
          {delta !== null && (
            <div className="text-center">
              <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>QUALITY</span>
              <p className="font-display text-2xl font-bold mt-1" style={{ color: delta >= 0 ? "hsl(142 71% 45%)" : "hsl(0 84% 60%)" }}>
                {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}
              </p>
            </div>
          )}
          {dataA && dataB && (
            <div className="text-center">
              <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>TIME GAP</span>
              <p className="font-mono text-xs mt-1" style={{ color: "hsl(43 50% 54%)" }}>
                {Math.abs(Math.round((new Date(dataB.submitted_at).getTime() - new Date(dataA.submitted_at).getTime()) / (1000 * 60 * 60 * 24)))} DAYS
              </p>
            </div>
          )}
        </div>

        {renderScanPanel(dataB, "SCAN B (LATER)")}
      </div>
    </div>
  );
}
