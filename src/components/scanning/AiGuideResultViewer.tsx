import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, Stage } from "@react-three/drei";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { usePointCloudUrl } from "@/lib/scanning/usePointCloudUrl";
import { PointCloudViewer } from "@/lib/scanning/PointCloudViewer";
import { logError } from "@/lib/logger";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";

interface VisualGuideRow {
  generation_status: string | null;
  generative_scene_url: string | null;
  generative_glb_url: string | null;
  generation_error: string | null;
}

const DISCLAIMER =
  "AI-generated visual guide based on captured mouth images. Not a medical scan.";

function GlbModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

/**
 * Read-only AI Visual Guide result viewer for the scan-history tabs.
 *
 * Capture / board composition now happens in the unified scan-capture flow,
 * so this panel only renders the generated result. Deliberately avoids the
 * heavy SuperSplat editor embed: meshes render in a lightweight three.js
 * orbit viewer, and `.ply` splat scenes fall back to the in-app point viewer.
 */
export function AiGuideResultViewer({ scanId }: { scanId: string }) {
  const [row, setRow] = useState<VisualGuideRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchOnce = async () => {
      try {
        const { data, error } = await supabase
          .from("scans")
          .select(
            "generation_status, generative_scene_url, generative_glb_url, generation_error",
          )
          .eq("id", scanId)
          .maybeSingle();
        if (cancelled || error || !data) return;
        const r = data as unknown as VisualGuideRow;
        setRow(r);
        const stillCooking =
          r.generation_status === "reference_board_created" ||
          r.generation_status === "generating_scene";
        if (!stillCooking && intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch (e) {
        logError(e, { operation: "AiGuideResultViewer/load" });
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

  const { url: glbSignedUrl } = usePointCloudUrl(
    row?.generative_glb_url ?? null,
    3600,
    "generated-assets",
  );
  const { url: sceneSignedUrl } = usePointCloudUrl(
    row?.generative_scene_url ?? null,
    3600,
    "generated-scenes",
  );

  const status = row?.generation_status ?? null;
  const generating =
    status === "reference_board_created" || status === "generating_scene";
  const isPlyScene = !!row?.generative_scene_url?.toLowerCase().endsWith(".ply");

  const shell = (body: React.ReactNode) => (
    <div className="rounded-card overflow-hidden bg-card border border-border">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="mono-label text-primary text-[10px]">AI GUIDE (BETA)</span>
        </div>
        <span className="mono-label text-muted-foreground text-[9px]">
          {status ? status.replace(/_/g, " ").toUpperCase() : "—"}
        </span>
      </div>
      {body}
      <div className="px-3 py-2 border-t border-border">
        <p className="text-[10px] text-muted-foreground">{DISCLAIMER}</p>
      </div>
    </div>
  );

  if (loading) return <Skeleton className="w-full h-[340px] rounded-card" />;

  const centered = (content: React.ReactNode) => (
    <div className="bg-black h-[340px] flex flex-col items-center justify-center gap-3 text-center px-6">
      {content}
    </div>
  );

  if (generating) {
    return shell(
      centered(
        <>
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <span className="mono-label text-white/55 text-[10px]">
            GENERATING VISUAL GUIDE…
          </span>
          <p className="text-white/30 text-xs">
            This takes a few minutes. It refreshes automatically.
          </p>
        </>,
      ),
    );
  }

  if (status === "failed") {
    return shell(
      centered(
        <>
          <AlertTriangle className="w-6 h-6 text-destructive" />
          <span className="mono-label text-destructive text-[10px]">
            GENERATION FAILED
          </span>
          <p className="text-white/40 text-xs max-w-[280px] break-all">
            {row?.generation_error ?? "Generation failed."}
          </p>
        </>,
      ),
    );
  }

  if (row?.generative_glb_url && glbSignedUrl) {
    return shell(
      <div className="bg-black" style={{ height: 340 }}>
        <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
          <Suspense fallback={null}>
            <Stage adjustCamera intensity={0.5}>
              <GlbModel url={glbSignedUrl} />
            </Stage>
          </Suspense>
          <OrbitControls enablePan />
        </Canvas>
      </div>,
    );
  }

  if (row?.generative_scene_url && isPlyScene && sceneSignedUrl) {
    return shell(
      <div className="bg-black">
        <PointCloudViewer plyUrl={sceneSignedUrl} height={340} />
      </div>,
    );
  }

  return shell(
    centered(
      <span className="mono-label text-white/40 text-[10px]">
        {row?.generative_scene_url
          ? "PREVIEW UNAVAILABLE FOR THIS FORMAT"
          : "NO AI GUIDE FOR THIS SCAN"}
      </span>,
    ),
  );
}
