import { useRef, useMemo, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/* ─── Types ─── */
export type ToothStatus = "on_track" | "deviation" | "attention" | "no_data";
export type ViewMode = "both" | "upper" | "lower";

export interface TeethVisualizationProps {
  toothData?: Record<string, ToothStatus>;
  compact?: boolean;
  className?: string;
  showLegend?: boolean;
  showToggle?: boolean;
  onToothSelect?: (toothId: string) => void;
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
  const [hoveredMesh, setHoveredMesh] = useState<string | null>(null);

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
}: TeethVisualizationProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const [hoveredTooth, setHoveredTooth] = useState<string | null>(null);

  const handleClick = useCallback(
    (id: string) => { onToothSelect?.(id); },
    [onToothSelect]
  );

  const height = compact ? "h-[200px]" : "h-[300px]";

  return (
    <div className={cn("relative", className)}>
      {/* View toggle */}
      {showToggle && !compact && (
        <div className="flex justify-end mb-2">
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
        </div>
      )}

      {/* 3D Canvas */}
      <div className={cn(height, "w-full rounded-lg overflow-hidden")}>
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
      </div>

      {/* Hover tooltip */}
      {hoveredTooth && (
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
