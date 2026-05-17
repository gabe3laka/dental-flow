import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, Stage } from "@react-three/drei";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { usePointCloudUrl } from "@/lib/scanning/usePointCloudUrl";
import { SuperSplatEmbed } from "@/lib/scanning/SuperSplatEmbed";
import {
  BOARD_CELLS,
  type BoardCellKey,
  type CellAssignment,
  autoTagCellFromName,
  composeBoard,
  estimateSharpness,
  loadImageFromFile,
  qualityFor,
  sampleVideoFrames,
} from "@/lib/scanning/referenceBoard";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { AlertTriangle, ImagePlus, Loader2, RefreshCw, Save, Sparkles, X } from "lucide-react";

const DISCLAIMER =
  "AI-generated visual guide based on captured mouth images. Not a medical scan.";

interface VisualGuideRow {
  generation_status: string | null;
  reference_board_url: string | null;
  generative_scene_url: string | null;
  generative_glb_url: string | null;
  generation_error: string | null;
  generative_saved_to_record: boolean | null;
}

function DisclaimerBanner() {
  return (
    <div className="mb-3 rounded-card border border-border bg-muted/30 px-3 py-2">
      <span className="mono-label text-muted-foreground text-[10px]">DISCLAIMER</span>
      <p className="text-xs text-foreground mt-0.5">{DISCLAIMER}</p>
    </div>
  );
}

function ConfidenceLegend() {
  return (
    <div className="rounded-card border border-border bg-card px-3 py-2 mb-3 text-[11px] text-muted-foreground">
      <span className="mono-label text-foreground text-[10px] block mb-1">
        CONFIDENCE LEGEND
      </span>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span><span className="inline-block w-2 h-2 rounded-full bg-status-success mr-1.5" />Captured — directly in your source images</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-status-warning mr-1.5" />Estimated — AI-inferred</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/60 mr-1.5" />Unknown — missing from source</span>
      </div>
    </div>
  );
}

function GlbViewer({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

const MAX_VIDEO_MB = 200;
const MAX_IMAGE_MB = 15;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif"];

type Asset = {
  id: string;
  name: string;
  source: HTMLImageElement | HTMLCanvasElement;
  thumbDataUrl: string;
  sharpness: number;
  cell: BoardCellKey | null;
};

export function AiVisualGuidePanel({
  scanId,
  patientId,
}: {
  scanId: string;
  patientId: string;
}) {
  const [row, setRow] = useState<VisualGuideRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState<null | "boarding" | "dispatching" | "retrying" | "saving">(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll loop — mirrors SplatTabPanel
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchOnce = async () => {
      try {
        const { data, error } = await supabase
          .from("scans")
          .select(
            "generation_status, reference_board_url, generative_scene_url, generative_glb_url, generation_error, generative_saved_to_record",
          )
          .eq("id", scanId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) return;
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
        logError(e, { operation: "AiVisualGuidePanel/load" });
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

  const { url: sceneSignedUrl, loading: signing } = usePointCloudUrl(
    row?.generative_scene_url ?? null,
    3600,
    "generated-scenes",
  );
  const { url: glbSignedUrl } = usePointCloudUrl(
    row?.generative_glb_url ?? null,
    3600,
    "generated-assets",
  );
  const { url: boardSignedUrl } = usePointCloudUrl(
    row?.reference_board_url ?? null,
    3600,
    "scan-reference-boards",
  );

  const status = row?.generation_status ?? null;
  const generating =
    status === "reference_board_created" || status === "generating_scene";

  // Build cell assignments from current asset.cell tags + sharpness ranking
  const assignments = useMemo<Record<BoardCellKey, CellAssignment>>(() => {
    const map = {} as Record<BoardCellKey, CellAssignment>;
    for (const { key } of BOARD_CELLS) {
      const candidates = assets.filter((a) => a.cell === key);
      const best = candidates.sort((a, b) => b.sharpness - a.sharpness)[0];
      map[key] = {
        key,
        source: best?.source ?? null,
        quality: best ? qualityFor(best.sharpness) : "missing",
      };
    }
    return map;
  }, [assets]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next: Asset[] = [];
    for (const f of Array.from(files)) {
      try {
        if (VIDEO_TYPES.includes(f.type)) {
          if (f.size > MAX_VIDEO_MB * 1024 * 1024) {
            toast({ title: `${f.name} too large`, description: `Max ${MAX_VIDEO_MB}MB`, variant: "destructive" });
            continue;
          }
          const frames = await sampleVideoFrames(f, 12);
          frames.forEach((c, i) => {
            next.push({
              id: `${f.name}-${i}-${Math.random().toString(36).slice(2, 6)}`,
              name: `${f.name} #${i + 1}`,
              source: c,
              thumbDataUrl: c.toDataURL("image/jpeg", 0.6),
              sharpness: estimateSharpness(c),
              cell: null,
            });
          });
        } else if (IMAGE_TYPES.includes(f.type) || f.type.startsWith("image/")) {
          if (f.size > MAX_IMAGE_MB * 1024 * 1024) {
            toast({ title: `${f.name} too large`, description: `Max ${MAX_IMAGE_MB}MB`, variant: "destructive" });
            continue;
          }
          const img = await loadImageFromFile(f);
          // Re-encode to a canvas to escape blob URL lifecycle
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext("2d")?.drawImage(img, 0, 0);
          next.push({
            id: `${f.name}-${Math.random().toString(36).slice(2, 6)}`,
            name: f.name,
            source: c,
            thumbDataUrl: c.toDataURL("image/jpeg", 0.6),
            sharpness: estimateSharpness(c),
            cell: autoTagCellFromName(f.name),
          });
        } else {
          toast({ title: `Unsupported file`, description: f.name, variant: "destructive" });
        }
      } catch (e) {
        logError(e, { operation: "AiVisualGuide/handleFile" });
      }
    }
    setAssets((prev) => assignSequentialCells([...prev, ...next]));
  }

  function assignSequentialCells(list: Asset[]): Asset[] {
    // Fill empty cells in order with untagged assets, ranked by sharpness
    const used = new Set<BoardCellKey>();
    for (const a of list) if (a.cell) used.add(a.cell);
    const remaining = BOARD_CELLS.map((c) => c.key).filter((k) => !used.has(k));
    const untagged = list
      .filter((a) => !a.cell)
      .sort((a, b) => b.sharpness - a.sharpness);
    const claim = new Map<string, BoardCellKey>();
    for (let i = 0; i < Math.min(remaining.length, untagged.length); i++) {
      claim.set(untagged[i].id, remaining[i]);
    }
    return list.map((a) => (claim.has(a.id) ? { ...a, cell: claim.get(a.id)! } : a));
  }

  function removeAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  function tagAsset(id: string, cell: BoardCellKey | null) {
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, cell } : a)));
  }

  async function buildAndDispatch() {
    if (busy) return;
    try {
      setBusy("boarding");
      const blob = await composeBoard(assignments);
      const path = `${patientId}/${scanId}/board-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from("scan-reference-boards")
        .upload(path, blob, { contentType: "image/png", upsert: true });
      if (upErr) throw upErr;

      await supabase
        .from("scans")
        .update({
          reference_board_url: path,
          generation_status: "reference_board_created",
          generation_error: null,
        })
        .eq("id", scanId);

      setBusy("dispatching");
      const { error: invErr } = await supabase.functions.invoke(
        "generate-visual-guide",
        {
          body: {
            scan_id: scanId,
            patient_id: patientId,
            reference_board_url: path,
            mode: "dental_visual_guide",
          },
        },
      );
      if (invErr) throw invErr;
      toast({ title: "AI visual guide queued", description: "This usually takes a few minutes." });
      // Force-refresh row
      const { data } = await supabase
        .from("scans")
        .select(
          "generation_status, reference_board_url, generative_scene_url, generative_glb_url, generation_error, generative_saved_to_record",
        )
        .eq("id", scanId)
        .maybeSingle();
      if (data) setRow(data as unknown as VisualGuideRow);
    } catch (e) {
      logError(e, { operation: "AiVisualGuide/dispatch" });
      toast({
        title: "Couldn't start generation",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function retry() {
    if (busy) return;
    setBusy("retrying");
    try {
      const { error } = await supabase.functions.invoke("generate-visual-guide", {
        body: {
          scan_id: scanId,
          patient_id: patientId,
          reference_board_url: row?.reference_board_url,
          mode: "dental_visual_guide",
        },
      });
      if (error) throw error;
      toast({ title: "Retry queued" });
    } catch (e) {
      toast({
        title: "Retry failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function saveToRecord() {
    if (busy) return;
    setBusy("saving");
    try {
      await supabase
        .from("scans")
        .update({ generative_saved_to_record: true })
        .eq("id", scanId);
      setRow((r) => (r ? { ...r, generative_saved_to_record: true } : r));
      toast({ title: "Saved to patient record" });
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <>
        <DisclaimerBanner />
        <Skeleton className="w-full h-[70vh] rounded-card mb-4" />
      </>
    );
  }

  // ============== Viewer area ==============
  let viewer: JSX.Element | null = null;
  if (row?.generative_scene_url) {
    viewer = signing || !sceneSignedUrl ? (
      <Skeleton className="w-full h-[70vh] rounded-card" />
    ) : (
      <div className="rounded-card overflow-hidden bg-card border border-border">
        <SuperSplatEmbed fileUrl={sceneSignedUrl} filename="scene.spz" />
      </div>
    );
  } else if (row?.generative_glb_url && glbSignedUrl) {
    viewer = (
      <div className="rounded-card overflow-hidden bg-black border border-border" style={{ height: "70vh" }}>
        <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
          <Suspense fallback={null}>
            <Stage adjustCamera intensity={0.5}>
              <GlbViewer url={glbSignedUrl} />
            </Stage>
          </Suspense>
          <OrbitControls enablePan />
        </Canvas>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <DisclaimerBanner />
      <ConfidenceLegend />

      {/* Status header */}
      <div className="rounded-card border border-border bg-card p-3 mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="mono-label text-foreground text-[10px]">
            AI VISUAL GUIDE (BETA)
          </span>
        </div>
        <span className="mono-label text-muted-foreground text-[10px]">
          {status ? status.replace(/_/g, " ").toUpperCase() : "DRAFT"}
        </span>
      </div>

      {/* Capture / upload UI — always available so user can regenerate */}
      <div className="rounded-card border border-border bg-card p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="mono-label text-foreground text-[10px]">SOURCE IMAGES</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mono-label text-[10px] text-primary hover:underline flex items-center gap-1"
          >
            <ImagePlus className="w-3 h-3" /> ADD PHOTOS / VIDEO
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
        </div>

        {assets.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Add 2–6 photos covering left / front / right and upper / bite / lower, or upload a short video — we'll pull frames.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {assets.map((a) => (
              <div key={a.id} className="relative rounded-md overflow-hidden border border-border bg-muted/20">
                <img src={a.thumbDataUrl} alt={a.name} className="w-full h-20 object-cover" />
                <button
                  onClick={() => removeAsset(a.id)}
                  className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5"
                  aria-label="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
                <select
                  value={a.cell ?? ""}
                  onChange={(e) => tagAsset(a.id, (e.target.value || null) as BoardCellKey | null)}
                  className="w-full text-[9px] bg-background border-t border-border py-0.5 px-1 mono-label"
                >
                  <option value="">UNASSIGNED</option>
                  {BOARD_CELLS.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reference board preview (after dispatch) */}
      {boardSignedUrl && (
        <div className="rounded-card border border-border bg-card p-3 mb-3">
          <span className="mono-label text-foreground text-[10px] block mb-2">
            REFERENCE BOARD
          </span>
          <img src={boardSignedUrl} alt="Reference board" className="w-full rounded-md" />
        </div>
      )}

      {/* Status / viewer */}
      {generating && (
        <div className="rounded-card border border-dashed border-border bg-card p-6 flex flex-col items-center gap-3 text-center mb-3">
          <Loader2 className="w-7 h-7 text-primary animate-spin" />
          <span className="mono-label text-foreground text-xs">
            Generating visual guide…
          </span>
          <p className="text-xs text-muted-foreground max-w-[280px]">
            This takes a few minutes. The panel refreshes automatically.
          </p>
        </div>
      )}

      {status === "failed" && (
        <div className="rounded-card border border-destructive/30 bg-destructive/5 p-6 flex flex-col items-center gap-3 text-center mb-3">
          <AlertTriangle className="w-7 h-7 text-destructive" />
          <span className="mono-label text-destructive text-xs">GENERATION FAILED</span>
          <p className="text-xs text-muted-foreground max-w-[320px] break-all">
            {row?.generation_error ?? "Generation failed."}
          </p>
          <Button
            onClick={retry}
            disabled={busy !== null}
            className="rounded-pill mono-label bg-primary text-primary-foreground mt-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${busy === "retrying" ? "animate-spin" : ""}`} />
            {busy === "retrying" ? "Retrying…" : "Retry"}
          </Button>
        </div>
      )}

      {viewer}

      {/* Action row */}
      <div className="flex flex-wrap gap-2 mt-3">
        <Button
          onClick={buildAndDispatch}
          disabled={busy !== null || assets.length === 0 || generating}
          className="rounded-pill mono-label bg-primary text-primary-foreground"
        >
          {busy === "boarding" || busy === "dispatching" ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 mr-1" />
          )}
          {status === "render_ready" ? "Regenerate" : "Build AI visual guide"}
        </Button>

        {status === "render_ready" && !row?.generative_saved_to_record && (
          <Button
            onClick={saveToRecord}
            disabled={busy !== null}
            variant="outline"
            className="rounded-pill mono-label"
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            Save to patient record
          </Button>
        )}
      </div>
    </div>
  );
}
