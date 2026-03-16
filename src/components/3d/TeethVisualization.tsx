import { useRef, useMemo, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/* ─── Types ─── */
export type ToothStatus = "on_track" | "deviation" | "attention" | "no_data";
export type ViewMode = "both" | "upper" | "lower";
export type RenderMode = "3d" | "2d";

export interface TeethVisualizationProps {
  toothData?: Record<string, ToothStatus>;
  compact?: boolean;
  className?: string;
  showLegend?: boolean;
  showToggle?: boolean;
  onToothSelect?: (toothId: string) => void;
  defaultRenderMode?: RenderMode;
}

/* ─── Status emissive colors ─── */
const STATUS_EMISSIVE: Record<ToothStatus, { color: string; intensity: number }> = {
  on_track:  { color: "#22c55e", intensity: 0.15 },
  deviation: { color: "#f59e0b", intensity: 0.22 },
  attention: { color: "#ef4444", intensity: 0.30 },
  no_data:   { color: "#000000", intensity: 0 },
};

/* ─── Determine overall status for global glow ─── */
function resolveOverallStatus(data: Record<string, ToothStatus>): ToothStatus {
  const vals = Object.values(data);
  if (vals.includes("attention")) return "attention";
  if (vals.includes("deviation")) return "deviation";
  if (vals.includes("on_track")) return "on_track";
  return "no_data";
}

/* ─── Camera presets ─── */
const CAMERA_PRESETS: Record<ViewMode, { pos: [number, number, number]; target: [number, number, number] }> = {
  both:  { pos: [0, 1.4, 3.8], target: [0, 0, 0] },
  upper: { pos: [0, 2.8, 2.8], target: [0, 0.3, 0] },
  lower: { pos: [0, -0.8, 3.2], target: [0, -0.5, 0] },
};

/* ─── Camera animator ─── */
function CameraAnimator({ viewMode }: { viewMode: ViewMode }) {
  const { camera } = useThree();
  const targetVec = useRef(new THREE.Vector3());

  useFrame(() => {
    const preset = CAMERA_PRESETS[viewMode];
    camera.position.lerp(new THREE.Vector3(...preset.pos), 0.045);
    targetVec.current.lerp(new THREE.Vector3(...preset.target), 0.045);
    camera.lookAt(targetVec.current);
  });

  return null;
}

/* ─── The loaded GLB model ─── */
function DentalModel({
  toothData,
  onHover,
  onClick,
}: {
  toothData: Record<string, ToothStatus>;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}) {
  const { scene } = useGLTF("/dental-arch.glb");
  const groupRef = useRef<THREE.Group>(null);
  const [_hoveredMesh, setHoveredMesh] = useState<string | null>(null);

  const overallStatus = useMemo(() => resolveOverallStatus(toothData), [toothData]);
  const emissive = STATUS_EMISSIVE[overallStatus];

  /* Clone scene once so material changes don't pollute the cache */
  const clonedScene = useMemo(() => {
    const cloned = scene.clone(true);

    cloned.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const srcMat = Array.isArray(child.material) ? child.material[0] : child.material;
      const matName: string = srcMat?.name ?? "";

      // Material.001 = pink gum (r≈0.8, g≈0.18)
      // Material     = off-white tooth (r≈0.68, g≈0.69)
      const isGum = matName === "Material.001";

      if (isGum) {
        child.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color("#d97b83"),
          roughness: 0.72,
          metalness: 0.0,
          clearcoat: 0.05,
          clearcoatRoughness: 0.9,
        });
      } else {
        child.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color("#f2ede3"),
          emissive: new THREE.Color(emissive.color),
          emissiveIntensity: emissive.intensity,
          roughness: 0.18,
          metalness: 0.04,
          clearcoat: 0.65,
          clearcoatRoughness: 0.22,
          transmission: 0.06,
          thickness: 0.9,
          ior: 1.48,
          envMapIntensity: 1.3,
        });
        child.castShadow = true;
      }
    });

    return cloned;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  /* Update emissive when toothData changes without full remount */
  useMemo(() => {
    clonedScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mat = child.material as THREE.MeshPhysicalMaterial;
      if (!mat || mat.transmission === undefined) return; // skip gum mats
      mat.emissive.set(emissive.color);
      mat.emissiveIntensity = emissive.intensity;
      mat.needsUpdate = false;
    });
  }, [clonedScene, emissive]);

  /* Gentle auto-rotation */
  useFrame((_s, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.07;
  });

  /* Pointer handlers */
  const handleOver = useCallback((e: THREE.Event) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev = e as any;
    ev.stopPropagation?.();
    const name = ev.object?.name ?? "";
    setHoveredMesh(name);
    onHover(name || null);
    document.body.style.cursor = "pointer";
    // Brighten hovered tooth
    const mat = ev.object?.material as THREE.MeshPhysicalMaterial;
    if (mat && mat.emissiveIntensity !== undefined && mat.transmission !== undefined) {
      mat.emissiveIntensity = Math.min(mat.emissiveIntensity + 0.25, 0.6);
    }
  }, [onHover]);

  const handleOut = useCallback((e: THREE.Event) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev = e as any;
    setHoveredMesh(null);
    onHover(null);
    document.body.style.cursor = "auto";
    const mat = ev.object?.material as THREE.MeshPhysicalMaterial;
    if (mat && mat.emissiveIntensity !== undefined && mat.transmission !== undefined) {
      mat.emissiveIntensity = emissive.intensity;
    }
  }, [onHover, emissive.intensity]);

  const handleClick = useCallback((e: THREE.Event) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev = e as any;
    ev.stopPropagation?.();
    const name = ev.object?.name ?? "tooth";
    onClick(name);
  }, [onClick]);

  return (
    <group
      ref={groupRef}
      rotation={[0.28, 0, 0]}
      position={[0, -0.15, 0]}
    >
      <primitive
        object={clonedScene}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
      />
    </group>
  );
}

/* ─── Full scene ─── */
function Scene({
  viewMode,
  toothData,
  onHover,
  onClick,
}: {
  viewMode: ViewMode;
  toothData: Record<string, ToothStatus>;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}) {
  return (
    <>
      {/* Warm key light from upper-right — mimics dental exam lamp */}
      <directionalLight position={[3, 6, 4]} intensity={1.1} color="#fff8ee" castShadow />
      {/* Cool fill from upper-left */}
      <directionalLight position={[-4, 3, -1]} intensity={0.55} color="#c8d8ff" />
      {/* Rim light from below for depth */}
      <directionalLight position={[0, -2, 3]} intensity={0.28} color="#ffffff" />
      {/* Ambient */}
      <ambientLight intensity={0.38} />
      {/* Environment for reflections on enamel */}
      <Environment preset="studio" />

      <DentalModel toothData={toothData} onHover={onHover} onClick={onClick} />
      <CameraAnimator viewMode={viewMode} />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI * 0.72}
        rotateSpeed={0.45}
      />
    </>
  );
}

/* ─── 2D SVG Tooth Arch ─── */
const STATUS_FILL: Record<ToothStatus, { fill: string; stroke: string }> = {
  on_track:  { fill: "rgba(34,197,94,0.25)",  stroke: "#22c55e" },
  deviation: { fill: "rgba(245,158,11,0.25)", stroke: "#f59e0b" },
  attention: { fill: "rgba(239,68,68,0.25)",  stroke: "#ef4444" },
  no_data:   { fill: "rgba(255,255,255,0.10)", stroke: "rgba(255,255,255,0.25)" },
};

// Upper arch: 16 teeth (right molars → front → left molars)
// Lower arch: 16 teeth mirrored
const UPPER_TEETH = [
  { id: "UR8", cx: 22,  cy: 110, rx: 7,  ry: 9  },
  { id: "UR7", cx: 28,  cy: 88,  rx: 7,  ry: 8.5 },
  { id: "UR6", cx: 37,  cy: 68,  rx: 7.5,ry: 8.5 },
  { id: "UR5", cx: 50,  cy: 50,  rx: 7,  ry: 8  },
  { id: "UR4", cx: 64,  cy: 37,  rx: 7,  ry: 7.5 },
  { id: "UR3", cx: 80,  cy: 28,  rx: 6.5,ry: 7  },
  { id: "UR2", cx: 91,  cy: 23,  rx: 6,  ry: 6.5 },
  { id: "UR1", cx: 100, cy: 21,  rx: 6,  ry: 6  },
  { id: "UL1", cx: 109, cy: 21,  rx: 6,  ry: 6  },
  { id: "UL2", cx: 118, cy: 23,  rx: 6,  ry: 6.5 },
  { id: "UL3", cx: 129, cy: 28,  rx: 6.5,ry: 7  },
  { id: "UL4", cx: 145, cy: 37,  rx: 7,  ry: 7.5 },
  { id: "UL5", cx: 159, cy: 50,  rx: 7,  ry: 8  },
  { id: "UL6", cx: 172, cy: 68,  rx: 7.5,ry: 8.5 },
  { id: "UL7", cx: 181, cy: 88,  rx: 7,  ry: 8.5 },
  { id: "UL8", cx: 187, cy: 110, rx: 7,  ry: 9  },
];

// Lower arch: mirror the upper, offset downward
const LOWER_TEETH = [
  { id: "LR8", cx: 22,  cy: 140, rx: 7,  ry: 9  },
  { id: "LR7", cx: 28,  cy: 162, rx: 7,  ry: 8.5 },
  { id: "LR6", cx: 37,  cy: 182, rx: 7.5,ry: 8.5 },
  { id: "LR5", cx: 50,  cy: 200, rx: 7,  ry: 8  },
  { id: "LR4", cx: 64,  cy: 213, rx: 7,  ry: 7.5 },
  { id: "LR3", cx: 80,  cy: 222, rx: 6.5,ry: 7  },
  { id: "LR2", cx: 91,  cy: 227, rx: 6,  ry: 6.5 },
  { id: "LR1", cx: 100, cy: 229, rx: 6,  ry: 6  },
  { id: "LL1", cx: 109, cy: 229, rx: 6,  ry: 6  },
  { id: "LL2", cx: 118, cy: 227, rx: 6,  ry: 6.5 },
  { id: "LL3", cx: 129, cy: 222, rx: 6.5,ry: 7  },
  { id: "LL4", cx: 145, cy: 213, rx: 7,  ry: 7.5 },
  { id: "LL5", cx: 159, cy: 200, rx: 7,  ry: 8  },
  { id: "LL6", cx: 172, cy: 182, rx: 7.5,ry: 8.5 },
  { id: "LL7", cx: 181, cy: 162, rx: 7,  ry: 8.5 },
  { id: "LL8", cx: 187, cy: 140, rx: 7,  ry: 9  },
];

function ToothChart2D({
  toothData,
  onToothSelect,
}: {
  toothData: Record<string, ToothStatus>;
  onToothSelect?: (id: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const renderTooth = (t: { id: string; cx: number; cy: number; rx: number; ry: number }) => {
    const status = toothData[t.id] ?? "no_data";
    const { fill, stroke } = STATUS_FILL[status];
    const isHovered = hovered === t.id;
    return (
      <ellipse
        key={t.id}
        cx={t.cx}
        cy={t.cy}
        rx={isHovered ? t.rx + 1.5 : t.rx}
        ry={isHovered ? t.ry + 1.5 : t.ry}
        fill={fill}
        stroke={isHovered ? "#ffffff" : stroke}
        strokeWidth={isHovered ? 1.5 : 0.8}
        style={{ cursor: "pointer", transition: "all 0.15s" }}
        onMouseEnter={() => setHovered(t.id)}
        onMouseLeave={() => setHovered(null)}
        onClick={() => onToothSelect?.(t.id)}
      />
    );
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full py-2">
      <svg
        viewBox="0 0 209 250"
        width="100%"
        style={{ maxHeight: "100%", overflow: "visible" }}
        aria-label="2D tooth chart"
      >
        {/* Arch guide lines */}
        <path
          d="M 22 115 Q 22 10, 104 13 Q 186 10, 187 115"
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="26"
          strokeLinecap="round"
        />
        <path
          d="M 22 135 Q 22 240, 104 237 Q 186 240, 187 135"
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="26"
          strokeLinecap="round"
        />
        {/* Center divider */}
        <line x1="104" y1="118" x2="104" y2="132" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="2 2" />
        {UPPER_TEETH.map(renderTooth)}
        {LOWER_TEETH.map(renderTooth)}
        {/* Midline label */}
        <text x="104" y="126" fill="rgba(255,255,255,0.2)" fontSize="5" fontFamily="monospace" textAnchor="middle">
          UPPER · LOWER
        </text>
        {/* Tooltip */}
        {hovered && (
          <text x="104" y="8" fill="white" fontSize="7" fontFamily="monospace" textAnchor="middle" opacity="0.9">
            {hovered}
          </text>
        )}
      </svg>
    </div>
  );
}

/* ─── Legend ─── */
const LEGEND = [
  { label: "ON TRACK", color: "#22c55e" },
  { label: "DEVIATION", color: "#f59e0b" },
  { label: "ATTENTION", color: "#ef4444" },
  { label: "NO DATA", color: "#6b7280" },
];

/* ─── Main exported component ─── */
export function TeethVisualization({
  toothData = {},
  compact = false,
  className,
  showLegend = true,
  showToggle = true,
  onToothSelect,
  defaultRenderMode = "3d",
}: TeethVisualizationProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const [hoveredTooth, setHoveredTooth] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<RenderMode>(defaultRenderMode);

  const handleClick = useCallback(
    (id: string) => { onToothSelect?.(id); },
    [onToothSelect]
  );

  const height = compact ? "h-[200px]" : "h-[300px]";

  return (
    <div className={cn("relative", className)}>
      {/* Controls row */}
      {showToggle && !compact && (
        <div className="flex items-center justify-between mb-2">
          {/* 3D view mode buttons — only in 3D mode */}
          {renderMode === "3d" ? (
            <div className="flex gap-1 bg-muted/50 rounded-full p-0.5">
              {(["both", "upper", "lower"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "px-3 py-1 rounded-full mono-label transition-colors",
                    viewMode === mode
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
          ) : (
            <div />
          )}

          {/* 3D / 2D render-mode toggle */}
          <div className="flex gap-1 bg-muted/50 rounded-full p-0.5">
            {(["3d", "2d"] as RenderMode[]).map((rm) => (
              <button
                key={rm}
                onClick={() => setRenderMode(rm)}
                className={cn(
                  "px-3 py-1 rounded-full mono-label transition-colors",
                  renderMode === rm
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {rm.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Canvas / Chart */}
      <div className={cn(height, "w-full rounded-lg overflow-hidden")}>
        {renderMode === "3d" ? (
          <Suspense fallback={<Skeleton className="w-full h-full" />}>
            <Canvas
              camera={{ position: [0, 1.4, 3.8], fov: compact ? 36 : 32 }}
              gl={{ antialias: true, alpha: true }}
              style={{ width: "100%", height: "100%" }}
            >
              <color attach="background" args={["transparent"]} />
              <Scene
                viewMode={viewMode}
                toothData={toothData}
                onHover={setHoveredTooth}
                onClick={handleClick}
              />
            </Canvas>
          </Suspense>
        ) : (
          <ToothChart2D toothData={toothData} onToothSelect={onToothSelect} />
        )}
      </div>

      {/* Hover tooltip (3D only) */}
      {renderMode === "3d" && hoveredTooth && (
        <div className="absolute top-2 left-2 bg-popover/90 backdrop-blur-sm border border-border rounded-lg px-3 py-1.5 pointer-events-none z-10">
          <span className="mono-label text-foreground">
            {hoveredTooth.replace(/_/g, " ").toUpperCase()}
          </span>
        </div>
      )}

      {/* Legend */}
      {showLegend && !compact && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 justify-center">
          {LEGEND.map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="mono-label text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Preload so it's ready when the component mounts */
useGLTF.preload("/dental-arch.glb");
