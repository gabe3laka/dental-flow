import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useTexture, Html } from "@react-three/drei";
import * as THREE from "three";
import { Loader2 } from "lucide-react";
import { ZONE_CONFIGS, SPHERE_R, zoneTransform, type ZoneConfig } from "@/lib/zoneConfigs";

/* ── Zone detection types passed in for AI overlay mode ── */
export interface ZoneAnnotations {
  /** Unique condition type names detected in teeth mapped to this zone */
  types: string[];
  /** Worst status across teeth in this zone */
  status: "attention" | "deviation" | "on_track";
}

export interface MouthPanoramaProps {
  zoneSignedUrls: Record<string, string>;
  /** Optional per-zone AI detections — enables floating annotation markers */
  annotationsByZone?: Record<string, ZoneAnnotations>;
  className?: string;
  height?: number | string;
}

function BackgroundSphere() {
  return (
    <mesh>
      <sphereGeometry args={[6, 32, 32]} />
      <meshBasicMaterial color="#060a14" side={THREE.BackSide} />
    </mesh>
  );
}

function TexturedZone({
  url,
  position,
  rotation,
  w,
  h,
}: {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  w: number;
  h: number;
}) {
  const texture = useTexture(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={texture} side={THREE.FrontSide} toneMapped={false} />
    </mesh>
  );
}

function ZonePlane({ cfg, url }: { cfg: ZoneConfig; url: string | undefined }) {
  const { position, rotation } = useMemo(
    () => zoneTransform(cfg.azDeg, cfg.elDeg, SPHERE_R),
    [cfg.azDeg, cfg.elDeg]
  );

  const placeholder = (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[cfg.w, cfg.h]} />
      <meshBasicMaterial color="#0d1520" side={THREE.FrontSide} />
    </mesh>
  );

  if (!url) return placeholder;

  return (
    <Suspense fallback={placeholder}>
      <TexturedZone url={url} position={position} rotation={rotation} w={cfg.w} h={cfg.h} />
    </Suspense>
  );
}

/* ── Floating AI detection marker rendered at zone center ── */
const STATUS_BADGE_COLOR: Record<ZoneAnnotations["status"], string> = {
  attention: "#ef4444",
  deviation: "#f59e0b",
  on_track:  "#22c55e",
};

function ZoneAnnotationMarker({
  azDeg,
  elDeg,
  ann,
}: {
  azDeg: number;
  elDeg: number;
  ann: ZoneAnnotations;
}) {
  // Position slightly closer than the photo planes (R=4.0) so Html appears in front
  const position = useMemo(() => {
    const R = SPHERE_R * 0.80;
    const az = (azDeg * Math.PI) / 180;
    const el = (elDeg * Math.PI) / 180;
    return [
      R * Math.sin(az) * Math.cos(el),
      R * Math.sin(el),
      R * Math.cos(az) * Math.cos(el),
    ] as [number, number, number];
  }, [azDeg, elDeg]);

  const dot = STATUS_BADGE_COLOR[ann.status];

  return (
    <Html position={position} center distanceFactor={5} style={{ pointerEvents: "none" }}>
      <div
        style={{
          background: "rgba(6,10,20,0.82)",
          border: `1px solid ${dot}55`,
          borderRadius: 6,
          padding: "3px 7px",
          display: "flex",
          alignItems: "center",
          gap: 5,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
        <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.85)", letterSpacing: "0.06em" }}>
          {ann.types.map(t => t.toUpperCase().replace(/_/g, " ")).join(" · ")}
        </span>
      </div>
    </Html>
  );
}

function HintOverlay({ label }: { label: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none z-10 transition-opacity duration-700"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <span className="font-mono text-white/50 text-[10px] tracking-widest">{label}</span>
    </div>
  );
}

function PanoramaLoader() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#060a14]">
      <Loader2 className="w-5 h-5 text-primary animate-spin" />
    </div>
  );
}

export function MouthPanorama({ zoneSignedUrls, annotationsByZone, className, height = 320 }: MouthPanoramaProps) {
  const hasAnnotations = !!annotationsByZone && Object.keys(annotationsByZone).length > 0;

  return (
    <div
      className={`relative w-full overflow-hidden bg-[#060a14] ${className ?? ""}`}
      style={{ height }}
    >
      <Suspense fallback={<PanoramaLoader />}>
        <Canvas
          camera={{ position: [0, 0, 0], fov: 75, near: 0.1, far: 20 }}
          gl={{ antialias: true, alpha: false }}
          style={{ width: "100%", height: "100%" }}
        >
          <BackgroundSphere />
          <ambientLight intensity={0.05} />
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={-0.4}
            minPolarAngle={Math.PI / 2 - (70 * Math.PI) / 180}
            maxPolarAngle={Math.PI / 2 + (70 * Math.PI) / 180}
            makeDefault
          />
          {ZONE_CONFIGS.map((cfg) => (
            <ZonePlane
              key={cfg.id}
              cfg={cfg}
              url={zoneSignedUrls[cfg.id] ?? zoneSignedUrls[cfg.id.toLowerCase()]}
            />
          ))}
          {hasAnnotations && ZONE_CONFIGS.map((cfg) => {
            const ann = annotationsByZone![cfg.id];
            if (!ann) return null;
            return (
              <ZoneAnnotationMarker
                key={cfg.id}
                azDeg={cfg.azDeg}
                elDeg={cfg.elDeg}
                ann={ann}
              />
            );
          })}
        </Canvas>
      </Suspense>
      <HintOverlay label={hasAnnotations ? "DRAG · AI DETECTIONS SHOWN" : "DRAG TO LOOK AROUND"} />
    </div>
  );
}
