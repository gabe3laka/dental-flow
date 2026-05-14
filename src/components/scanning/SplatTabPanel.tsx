import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { usePointCloudUrl } from "@/lib/scanning/usePointCloudUrl";
import { SuperSplatEmbed } from "@/lib/scanning/SuperSplatEmbed";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

interface SplatRow {
  splat_url: string | null;
  splat_processing_status: string | null;
  splat_processing_error: string | null;
}

/**
 * Inline "3D PLUS" panel — Gaussian splat viewer for the scan results page.
 * Mirrors the legacy Scan3DPlusView page behavior: 8s polling, signed URL
 * via the `scan-splats` bucket, retry via the `reconstruct-splat` Edge Function.
 */
export function SplatTabPanel({ scanId }: { scanId: string }) {
  const [row, setRow] = useState<SplatRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchOnce = async () => {
      try {
        const { data, error } = await supabase
          .from("scans")
          .select("splat_url, splat_processing_status, splat_processing_error")
          .eq("id", scanId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) return;
        const r = data as unknown as SplatRow;
        setRow(r);
        const stillCooking =
          r.splat_processing_status === "queued" ||
          r.splat_processing_status === "processing";
        if (!stillCooking && intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch (e) {
        logError(e, { operation: "SplatTabPanel/load" });
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

  const { url: signedUrl, loading: signing, error: signError } = usePointCloudUrl(
    row?.splat_url ?? null,
    3600,
    "scan-splats",
  );

  const status = row?.splat_processing_status ?? null;

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      const { error } = await supabase.functions.invoke("reconstruct-splat", {
        body: { scan_id: scanId },
      });
      if (error) throw error;
      toast({ title: "Splat retry queued", description: "Reconstruction started again." });
      const { data } = await supabase
        .from("scans")
        .select("splat_url, splat_processing_status, splat_processing_error")
        .eq("id", scanId)
        .maybeSingle();
      if (data) setRow(data as unknown as SplatRow);
    } catch (e) {
      logError(e, { operation: "SplatTabPanel/retry" });
      toast({
        title: "Couldn't restart splat",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setRetrying(false);
    }
  };

  if (loading) return <Skeleton className="w-full h-[70vh] rounded-card mb-4" />;

  if (status === "failed") {
    return (
      <div className="rounded-card border border-destructive/30 bg-destructive/5 p-6 flex flex-col items-center gap-3 text-center mb-4">
        <AlertTriangle className="w-7 h-7 text-destructive" />
        <span className="mono-label text-destructive text-xs">SPLAT RECONSTRUCTION FAILED</span>
        <p className="text-xs text-muted-foreground max-w-[320px] break-all">
          {row?.splat_processing_error ?? "Reconstruction failed."}
        </p>
        <Button
          onClick={retry}
          disabled={retrying}
          className="rounded-pill mono-label bg-primary text-primary-foreground mt-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${retrying ? "animate-spin" : ""}`} />
          {retrying ? "Restarting…" : "Retry"}
        </Button>
      </div>
    );
  }

  if (status === "complete" && row?.splat_url) {
    if (signing) return <Skeleton className="w-full h-[70vh] rounded-card mb-4" />;
    if (signError || !signedUrl) {
      return (
        <div className="rounded-card border border-dashed border-border bg-card p-6 flex flex-col items-center gap-3 text-center mb-4">
          <AlertTriangle className="w-7 h-7 text-destructive" />
          <span className="mono-label text-foreground text-xs">Couldn't open the splat</span>
          <p className="text-xs text-muted-foreground max-w-[280px]">
            We couldn't load the Gaussian splat. Try again in a moment.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-card overflow-hidden bg-card border border-border mb-4">
        <SuperSplatEmbed fileUrl={signedUrl} filename="scene.ply" />
      </div>
    );
  }

  // null | "queued" | "processing"
  const label =
    status === "processing" ? "Reconstructing splat… (in progress)" : "Reconstructing splat…";
  return (
    <div className="rounded-card border border-dashed border-border bg-card p-6 flex flex-col items-center gap-3 text-center mb-4">
      <Loader2 className="w-7 h-7 text-primary animate-spin" />
      <span className="mono-label text-foreground text-xs">{label}</span>
      <p className="text-xs text-muted-foreground max-w-[280px]">
        The splat reconstruction is still in progress. This panel refreshes automatically.
      </p>
    </div>
  );
}