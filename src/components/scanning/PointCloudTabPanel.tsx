import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePointCloudUrl } from "@/lib/scanning/usePointCloudUrl";
import { PointCloudViewer } from "@/lib/scanning/PointCloudViewer";
import { Skeleton } from "@/components/ui/skeleton";
import { logError } from "@/lib/logger";
import { Loader2 } from "lucide-react";

interface PointCloudRow {
  pointcloud_url: string | null;
  processing_status: string | null;
  scan_type: string | null;
}

const DISCLAIMER = "For visual guidance only. Not a medical device or diagnosis.";

/**
 * Inline "3D MAP" panel — LingBot point cloud for the scan-history tabs.
 * Self-fetches and polls so it works without the parent passing data.
 */
export function PointCloudTabPanel({ scanId }: { scanId: string }) {
  const [row, setRow] = useState<PointCloudRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchOnce = async () => {
      try {
        const { data, error } = await supabase
          .from("scans")
          .select("pointcloud_url, processing_status, scan_type")
          .eq("id", scanId)
          .maybeSingle();
        if (cancelled || error || !data) return;
        const r = data as unknown as PointCloudRow;
        setRow(r);
        const stillCooking =
          r.processing_status === "queued" || r.processing_status === "processing";
        if (!stillCooking && intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch (e) {
        logError(e, { operation: "PointCloudTabPanel/load" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchOnce();
    intervalId = setInterval(fetchOnce, 8000);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [scanId]);

  const { url: signedUrl } = usePointCloudUrl(row?.pointcloud_url ?? null);
  const status = row?.processing_status ?? null;

  if (loading) {
    return <Skeleton className="w-full h-[340px] rounded-card" />;
  }

  return (
    <div className="rounded-card overflow-hidden bg-card border border-border dark">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <span className="mono-label text-primary text-[10px]">3D MAP</span>
          {row?.scan_type && (
            <span className="mono-label text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
              {row.scan_type.toUpperCase()}
            </span>
          )}
        </div>
        <span className="mono-label text-muted-foreground text-[9px]">
          {status === "complete" ? "READY" : (status ?? "—").toUpperCase()}
        </span>
      </div>

      <div className="bg-black">
        {row?.pointcloud_url ? (
          <PointCloudViewer plyUrl={signedUrl} height={340} />
        ) : (
          <div className="h-[340px] flex flex-col items-center justify-center gap-3 text-center px-6">
            {status === "failed" ? (
              <>
                <span className="mono-label text-destructive text-[10px]">
                  RECONSTRUCTION FAILED
                </span>
                <p className="text-white/40 text-xs">
                  We couldn't build a 3D map from this scan.
                </p>
              </>
            ) : status === "queued" || status === "processing" ? (
              <>
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                <span className="mono-label text-white/55 text-[10px]">
                  BUILDING YOUR 3D MAP…
                </span>
                <p className="text-white/30 text-xs">
                  Usually under 2 minutes after upload.
                </p>
              </>
            ) : (
              <span className="mono-label text-white/40 text-[10px]">
                NO 3D MAP FOR THIS SCAN
              </span>
            )}
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-border">
        <p className="text-[10px] text-muted-foreground">{DISCLAIMER}</p>
      </div>
    </div>
  );
}
