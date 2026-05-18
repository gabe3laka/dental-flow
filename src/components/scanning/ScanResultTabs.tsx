import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";
import { PointCloudTabPanel } from "./PointCloudTabPanel";
import { SplatTabPanel } from "./SplatTabPanel";
import { AiGuideResultViewer } from "./AiGuideResultViewer";

type TabKey = "3d" | "3d-plus" | "ai-guide";

interface MetaRow {
  source: string | null;
  processing_status: string | null;
  splat_processing_status: string | null;
  generation_status: string | null;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "3d", label: "3D MAP" },
  { key: "3d-plus", label: "3D PLUS" },
  { key: "ai-guide", label: "AI GUIDE" },
];

/**
 * Inline result viewer for a single scan — three tabs (3D Map / 3D Plus /
 * AI Guide) that render the scan in-place. Replaces the old full-screen
 * ScanResults page; used inside the expanded Scan History card.
 */
export function ScanResultTabs({ scanId }: { scanId: string }) {
  const [meta, setMeta] = useState<MetaRow | null>(null);
  const [tab, setTab] = useState<TabKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("scans")
          .select(
            "source, processing_status, splat_processing_status, generation_status",
          )
          .eq("id", scanId)
          .maybeSingle();
        if (cancelled || error || !data) return;
        const r = data as unknown as MetaRow;
        setMeta(r);
        setTab((prev) => prev ?? (r.source === "ai_guide" ? "ai-guide" : "3d"));
      } catch (e) {
        logError(e, { operation: "ScanResultTabs/meta" });
        if (!cancelled) setTab((prev) => prev ?? "3d");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scanId]);

  const readiness: Record<TabKey, boolean> = {
    "3d": meta?.processing_status === "complete",
    "3d-plus": meta?.splat_processing_status === "complete",
    "ai-guide":
      meta?.generation_status === "render_ready" ||
      meta?.generation_status === "complete",
  };

  const active = tab ?? "3d";

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={(e) => {
              e.stopPropagation();
              setTab(key);
            }}
            className={`flex-1 py-2 rounded-pill mono-label text-[10px] transition inline-flex items-center justify-center gap-1.5 ${
              active === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {readiness[key] && (
              <span
                aria-label="ready"
                className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse"
              />
            )}
            {label}
          </button>
        ))}
      </div>

      {active === "3d" && <PointCloudTabPanel scanId={scanId} />}
      {active === "3d-plus" && <SplatTabPanel scanId={scanId} />}
      {active === "ai-guide" && <AiGuideResultViewer scanId={scanId} />}
    </div>
  );
}
