import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ScanPhotoViewer } from "./ScanPhotoViewer";
import { Eye, EyeOff } from "lucide-react";

interface ZoneInfo {
  zone: string;
  path: string;
  quality?: number;
}

interface Annotation {
  type: string;
  bbox: { x: number; y: number; width: number; height: number };
  description: string;
}

interface ScanPhotoGridProps {
  scanId: string;
  zonesCaptured: ZoneInfo[];
  annotations?: Annotation[];
  className?: string;
}

const ZONE_LABELS: Record<string, string> = {
  upper: "UPPER",
  lower: "LOWER",
  left: "LEFT",
  right: "RIGHT",
  front: "FRONT",
  "zone-0": "UPPER",
  "zone-1": "LOWER",
  "zone-2": "LEFT",
  "zone-3": "RIGHT",
  "zone-4": "FRONT",
};

export function ScanPhotoGrid({ scanId, zonesCaptured, annotations, className }: ScanPhotoGridProps) {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);

  useEffect(() => {
    if (!zonesCaptured?.length) { setLoading(false); return; }

    (async () => {
      const urls: Record<string, string> = {};
      for (const z of zonesCaptured) {
        try {
          const { data } = await supabase.storage.from("scan-videos").createSignedUrl(z.path, 3600);
          if (data?.signedUrl) urls[z.zone] = data.signedUrl;
        } catch { /* skip */ }
      }
      setSignedUrls(urls);
      setLoading(false);
    })();
  }, [zonesCaptured]);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  if (!zonesCaptured?.length) {
    return (
      <p className="text-sm text-muted-foreground italic text-center py-6">
        No scan photos available
      </p>
    );
  }

  const zoneAnnotations = (zone: string) =>
    annotations?.filter((a) => a.description.toLowerCase().includes(zone.toLowerCase())) || [];

  return (
    <div className={className}>
      {annotations && annotations.length > 0 && (
        <button
          onClick={() => setShowAnnotations(!showAnnotations)}
          className="flex items-center gap-1.5 mono-label text-muted-foreground hover:text-foreground transition mb-3"
        >
          {showAnnotations ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showAnnotations ? "HIDE AI HIGHLIGHTS" : "SHOW AI HIGHLIGHTS"}
        </button>
      )}

      <div className="grid grid-cols-3 gap-2">
        {zonesCaptured.map((z, i) => {
          const url = signedUrls[z.zone];
          const label = ZONE_LABELS[z.zone] || z.zone.toUpperCase();
          const zAnnotations = zoneAnnotations(z.zone);
          const qualityOk = z.quality == null || z.quality >= 50;

          return (
            <button
              key={z.zone}
              onClick={() => url && setViewerIndex(i)}
              className="relative aspect-square rounded-lg overflow-hidden bg-muted border border-border hover:border-primary/30 transition group"
            >
              {url ? (
                <img
                  src={url}
                  alt={`${label} scan`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="mono-label text-muted-foreground text-[9px]">NO IMAGE</span>
                </div>
              )}

              {/* AI annotation overlays */}
              {showAnnotations && zAnnotations.map((ann, j) => (
                <div
                  key={j}
                  className="absolute border-2 border-status-warning rounded-sm pointer-events-none"
                  style={{
                    left: `${ann.bbox.x}%`,
                    top: `${ann.bbox.y}%`,
                    width: `${ann.bbox.width}%`,
                    height: `${ann.bbox.height}%`,
                  }}
                >
                  <span className="absolute -top-4 left-0 mono-label text-[7px] bg-status-warning text-white px-1 rounded-sm whitespace-nowrap">
                    {ann.type}
                  </span>
                </div>
              ))}

              {/* Zone label */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                <span className="mono-label text-white text-[9px]">{label}</span>
              </div>

              {/* Quality indicator */}
              <div className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${qualityOk ? "bg-status-success" : "bg-status-warning"}`} />
            </button>
          );
        })}
      </div>

      {viewerIndex !== null && (
        <ScanPhotoViewer
          images={zonesCaptured.map((z) => ({
            url: signedUrls[z.zone] || "",
            label: ZONE_LABELS[z.zone] || z.zone.toUpperCase(),
          }))}
          initialIndex={viewerIndex}
          annotations={showAnnotations ? annotations : undefined}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}
