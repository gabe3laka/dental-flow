import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { logError } from "@/lib/logger";
import { ArrowLeft, Sparkles, Camera, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { SuperSplatEmbed } from "@/lib/scanning/SuperSplatEmbed";
import { usePointCloudUrl } from "@/lib/scanning/usePointCloudUrl";
import { toast } from "@/hooks/use-toast";

// Same default as ScanSubmission: splat ON unless explicitly "false".
// Used only to decide which tab is selected by default when both outputs exist.
const SPLAT_ENABLED = import.meta.env.VITE_ENABLE_SPLAT !== "false";
const LINGBOT_ENABLED = import.meta.env.VITE_ENABLE_LINGBOT === "true";

interface ScanRow {
  id: string;
  pointcloud_url: string | null;
  splat_url: string | null;
  splat_processing_status: string | null;
  splat_processing_error: string | null;
  scan_type: string | null;
}

/**
 * Patient-facing "3D Plus" viewer.
 *
 * Surfaces both reconstructions for the same scan when present:
 *   - LingBot point cloud   (scans.pointcloud_url, scan-pointclouds bucket)
 *   - Gaussian splat        (scans.splat_url,      scan-splats      bucket)
 *
 * Both are rendered through the SAME SuperSplat iframe component — the
 * difference is just which signed URL we hand it.
 *
 * UI rules:
 *   - Both URLs present  → Tabs UI (Point cloud / Gaussian splat).
 *                          Splat is the default tab when LINGBOT is off.
 *   - Only one present   → that single viewer fills the body.
 *   - Splat in progress  → "Reconstructing splat…" state on the splat tab
 *                          / on the body when only splat is in flight.
 *   - Splat failed       → error panel with a "Retry" that re-invokes
 *                          reconstruct-splat for the same scan_id.
 */
export default function Scan3DPlusView() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [scan, setScan] = useState<ScanRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Initial load + lightweight 8s poll while splat is still cooking, so
  // the page flips itself when the worker finishes.
  useEffect(() => {
    if (!scanId || !user) return;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchOnce = async () => {
      try {
        const { data, error } = await supabase
          .from("scans")
          .select(
            "id, pointcloud_url, splat_url, splat_processing_status, splat_processing_error, scan_type"
          )
          .eq("id", scanId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setNotFound(true);
          return;
        }
        const row = data as unknown as ScanRow;
        setScan(row);
        // Stop polling once splat has reached a terminal state OR if there
        // never was a splat dispatch in flight.
        const splatStillCooking =
          row.splat_processing_status === "queued" ||
          row.splat_processing_status === "processing";
        if (!splatStillCooking && intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch (e) {
        logError(e, { operation: "Scan3DPlusView/load", userId: user?.id });
        if (!cancelled) setNotFound(true);
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
  }, [scanId, user]);

  // Sign URLs from the two different buckets.
  const { url: lingbotSignedUrl, loading: lingbotSigning, error: lingbotSignError } =
    usePointCloudUrl(scan?.pointcloud_url ?? null);
  const { url: splatSignedUrl, loading: splatSigning, error: splatSignError } =
    usePointCloudUrl(scan?.splat_url ?? null, 3600, "scan-splats");

  const hasLingbot = !!scan?.pointcloud_url;
  const hasSplat = !!scan?.splat_url;
  const splatStatus = scan?.splat_processing_status ?? null;
  const splatInFlight = splatStatus === "queued" || splatStatus === "processing";
  const splatFailed = splatStatus === "failed";

  // Default tab: splat when only it is on, lingbot when only lingbot is on,
  // otherwise honour the env flags so the patient sees the "primary" pipeline first.
  const defaultTab = useMemo<"lingbot" | "splat">(() => {
    if (hasSplat && !hasLingbot) return "splat";
    if (hasLingbot && !hasSplat) return "lingbot";
    if (!LINGBOT_ENABLED && SPLAT_ENABLED) return "splat";
    return "lingbot";
  }, [hasSplat, hasLingbot]);

  const retrySplat = async () => {
    if (!scanId || retrying) return;
    setRetrying(true);
    try {
      const { error } = await supabase.functions.invoke("reconstruct-splat", {
        body: { scan_id: scanId },
      });
      if (error) throw error;
      toast({ title: "Splat retry queued", description: "Reconstruction started again." });
      // Force a quick re-fetch so the UI flips to the in-flight state.
      const { data } = await supabase
        .from("scans")
        .select(
          "id, pointcloud_url, splat_url, splat_processing_status, splat_processing_error, scan_type"
        )
        .eq("id", scanId)
        .maybeSingle();
      if (data) setScan(data as unknown as ScanRow);
    } catch (e) {
      logError(e, { operation: "Scan3DPlusView/retrySplat", userId: user?.id });
      toast({
        title: "Couldn't restart splat",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-5 py-8 max-w-[480px] mx-auto pb-24">
      {/* Header */}
      <button
        onClick={() => navigate(scanId ? `/patient/scans/${scanId}/results` : "/patient/scans")}
        className="flex items-center gap-1 mono-label text-muted-foreground hover:text-foreground transition mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        BACK TO SCAN
      </button>

      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-primary" />
        <h1 className="font-display text-xl font-semibold">3D Plus</h1>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        3D Plus viewer is in beta. Rendering is powered by SuperSplat (PlayCanvas).
        Self-hosted viewer coming soon.
      </p>

      {/* Body */}
      {loading ? (
        <Skeleton className="w-full h-[70vh] rounded-card" />
      ) : notFound ? (
        <EmptyState
          icon={<Camera className="w-7 h-7 text-primary opacity-70" />}
          title="Scan not found"
          body="We couldn't find this scan. Head back to your scan history."
          ctaLabel="Scan history"
          onCta={() => navigate("/patient/scans")}
        />
      ) : !hasLingbot && !hasSplat && !splatInFlight && !splatFailed ? (
        <EmptyState
          icon={<Camera className="w-7 h-7 text-primary opacity-70" />}
          title="No 3D file available yet"
          body="This scan doesn't have a reconstruction yet. Take a new scan once a pipeline is live, or check back later."
          ctaLabel="Take a new scan"
          onCta={() => navigate("/patient/scan")}
        />
      ) : hasLingbot && hasSplat ? (
        // ── Both outputs present: Tabs UI ──
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-3">
            <TabsTrigger value="lingbot">Point cloud (LingBot)</TabsTrigger>
            <TabsTrigger value="splat">Gaussian splat</TabsTrigger>
          </TabsList>
          <TabsContent value="lingbot" className="m-0">
            <LingbotPanel
              signing={lingbotSigning}
              signError={lingbotSignError}
              signedUrl={lingbotSignedUrl}
            />
          </TabsContent>
          <TabsContent value="splat" className="m-0">
            <SplatPanel
              signing={splatSigning}
              signError={splatSignError}
              signedUrl={splatSignedUrl}
            />
          </TabsContent>
        </Tabs>
      ) : hasLingbot ? (
        // ── Only LingBot present ──
        <LingbotPanel
          signing={lingbotSigning}
          signError={lingbotSignError}
          signedUrl={lingbotSignedUrl}
        />
      ) : hasSplat ? (
        // ── Only splat present ──
        <SplatPanel
          signing={splatSigning}
          signError={splatSignError}
          signedUrl={splatSignedUrl}
        />
      ) : splatFailed ? (
        // ── Splat dispatched but errored ──
        <FailedPanel
          message={scan?.splat_processing_error ?? "Reconstruction failed."}
          onRetry={retrySplat}
          retrying={retrying}
        />
      ) : (
        // ── Splat in flight, nothing else to show yet ──
        <ReconstructingPanel label="splat" />
      )}

      {/* Attribution footer (MIT requirement) */}
      <p className="mt-4 mono-label text-[10px] text-muted-foreground text-center">
        Includes SuperSplat © PlayCanvas Ltd. — MIT
      </p>

      <PatientBottomNav />
    </div>
  );
}

/* ── Inner panels ─────────────────────────────────────────────────────── */

function LingbotPanel({
  signing,
  signError,
  signedUrl,
}: {
  signing: boolean;
  signError: string | null;
  signedUrl: string | null;
}) {
  if (signing) return <Skeleton className="w-full h-[70vh] rounded-card" />;
  if (signError || !signedUrl)
    return (
      <EmptyState
        icon={<AlertTriangle className="w-7 h-7 text-destructive" />}
        title="Couldn't open the point cloud"
        body="We couldn't load the LingBot file. Try again in a moment."
      />
    );
  return (
    <div className="rounded-card overflow-hidden bg-card border border-border">
      <SuperSplatEmbed fileUrl={signedUrl} filename="pointcloud.ply" />
    </div>
  );
}

function SplatPanel({
  signing,
  signError,
  signedUrl,
}: {
  signing: boolean;
  signError: string | null;
  signedUrl: string | null;
}) {
  if (signing) return <Skeleton className="w-full h-[70vh] rounded-card" />;
  if (signError || !signedUrl)
    return (
      <EmptyState
        icon={<AlertTriangle className="w-7 h-7 text-destructive" />}
        title="Couldn't open the splat"
        body="We couldn't load the Gaussian splat. Try again in a moment."
      />
    );
  return (
    <div className="rounded-card overflow-hidden bg-card border border-border">
      <SuperSplatEmbed fileUrl={signedUrl} filename="scene.ply" />
    </div>
  );
}

function ReconstructingPanel({ label }: { label: string }) {
  return (
    <div className="rounded-card border border-dashed border-border bg-card p-6 flex flex-col items-center gap-3 text-center">
      <Loader2 className="w-7 h-7 text-primary animate-spin" />
      <span className="mono-label text-foreground text-xs">Reconstructing {label}…</span>
      <p className="text-xs text-muted-foreground max-w-[280px]">
        The {label} reconstruction is still in progress. This page refreshes automatically.
      </p>
    </div>
  );
}

function FailedPanel({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="rounded-card border border-destructive/30 bg-destructive/5 p-6 flex flex-col items-center gap-3 text-center">
      <AlertTriangle className="w-7 h-7 text-destructive" />
      <span className="mono-label text-destructive text-xs">SPLAT RECONSTRUCTION FAILED</span>
      <p className="text-xs text-muted-foreground max-w-[320px] break-all">{message}</p>
      <Button
        onClick={onRetry}
        disabled={retrying}
        className="rounded-pill mono-label bg-primary text-primary-foreground mt-2"
      >
        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${retrying ? "animate-spin" : ""}`} />
        {retrying ? "Restarting…" : "Retry"}
      </Button>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  ctaLabel,
  onCta,
}: {
  icon?: React.ReactNode;
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <div className="rounded-card border border-dashed border-border bg-card p-6 flex flex-col items-center gap-3 text-center">
      {icon ?? <Camera className="w-7 h-7 text-primary opacity-70" />}
      <span className="mono-label text-foreground text-xs">{title}</span>
      <p className="text-xs text-muted-foreground max-w-[280px]">{body}</p>
      {ctaLabel && onCta && (
        <Button onClick={onCta} className="rounded-pill mono-label bg-primary text-primary-foreground mt-2">
          {ctaLabel}
        </Button>
      )}
    </div>
  );
}
