import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { logError } from "@/lib/logger";
import { ArrowLeft, Sparkles, Camera } from "lucide-react";
import { SuperSplatEmbed } from "@/lib/scanning/SuperSplatEmbed";
import { usePointCloudUrl } from "@/lib/scanning/usePointCloudUrl";

/**
 * Patient-facing "3D Plus" viewer.
 *
 * Reads the existing `scans.pointcloud_url` (a path under the
 * `scan-pointclouds` Supabase bucket — same source the in-app R3F viewer
 * uses), signs it for one hour, and hands the URL to SuperSplat via an
 * iframe.
 *
 * No reconstruction happens here — this is a viewer-only surface that opens
 * an existing `.ply` in a different renderer. If the scan has no point cloud
 * yet (LingBot disabled or job still running) we show an empty state.
 */
export default function Scan3DPlusView() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [pointcloudPath, setPointcloudPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!scanId || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("scans")
          .select("id, pointcloud_url")
          .eq("id", scanId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setNotFound(true);
        } else {
          const row = data as { pointcloud_url?: string | null };
          setPointcloudPath(row.pointcloud_url ?? null);
        }
      } catch (e) {
        logError(e, { operation: "Scan3DPlusView/load", userId: user?.id });
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scanId, user]);

  const { url: signedUrl, loading: signing, error: signError } =
    usePointCloudUrl(pointcloudPath);

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
          title="Scan not found"
          body="We couldn't find this scan. Head back to your scan history."
          ctaLabel="Scan history"
          onCta={() => navigate("/patient/scans")}
        />
      ) : !pointcloudPath ? (
        <EmptyState
          title="No 3D file available yet"
          body="This scan doesn't have a 3D point-cloud file yet. Take a new scan once the 3D pipeline is live, or check back later."
          ctaLabel="Take a new scan"
          onCta={() => navigate("/patient/scan")}
        />
      ) : signing ? (
        <Skeleton className="w-full h-[70vh] rounded-card" />
      ) : signError || !signedUrl ? (
        <EmptyState
          title="Couldn't open this file"
          body="We couldn't load the 3D file for this scan. Try again in a moment."
          ctaLabel="Back to results"
          onCta={() =>
            navigate(scanId ? `/patient/scans/${scanId}/results` : "/patient/scans")
          }
        />
      ) : (
        <div className="rounded-card overflow-hidden bg-card border border-border">
          <SuperSplatEmbed fileUrl={signedUrl} filename="pointcloud.ply" />
        </div>
      )}

      {/* Attribution footer (MIT requirement) */}
      <p className="mt-4 mono-label text-[10px] text-muted-foreground text-center">
        Includes SuperSplat © PlayCanvas Ltd. — MIT
      </p>

      <PatientBottomNav />
    </div>
  );
}

function EmptyState({
  title,
  body,
  ctaLabel,
  onCta,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <div className="rounded-card border border-dashed border-border bg-card p-6 flex flex-col items-center gap-3 text-center">
      <Camera className="w-7 h-7 text-primary opacity-70" />
      <span className="mono-label text-foreground text-xs">{title}</span>
      <p className="text-xs text-muted-foreground max-w-[280px]">{body}</p>
      <Button onClick={onCta} className="rounded-pill mono-label bg-primary text-primary-foreground mt-2">
        {ctaLabel}
      </Button>
    </div>
  );
}
