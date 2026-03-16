import { useRef, useMemo, useState, useCallback, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { RotateCcw } from "lucide-react";

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

const SELECTED_EMISSIVE = { color: "#4f7cff", intensity: 0.5 };

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
  both:  { pos: [0, 0.6, 4.5], target: [0, 0, 0] },
  upper: { pos: [0, 2.0, 3.5], target: [0, 0.5, 0] },
  lower: { pos: [0, -1.0, 3.5], target: [0, -0.5, 0] },
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

/* ─── Reset handler inside canvas ─── */
function ResetHandler({
  resetTrigger,
  controlsRef,
}: {
  resetTrigger: number;
  controlsRef: React.RefObject<any>;
}) {
  useEffect(() => {
    if (resetTrigger > 0 && controlsRef.current) {
      controlsRef.current.reset();
    }
  }, [resetTrigger, controlsRef]);
  return null;
}

/* ─── The loaded GLB model ─── */
function DentalModel({
  toothData,
  selectedTooth,
  onHover,
  onClick,
}: {
  toothData: Record<string, ToothStatus>;
  selectedTooth: string | null;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}) {
  const { scene } = useGLTF("/teeth.glb");
  const groupRef = useRef<THREE.Group>(null);

  const overallStatus = useMemo(() => resolveOverallStatus(toothData), [toothData]);
  const emissive = STATUS_EMISSIVE[overallStatus];

  /* Clone scene once and apply materials */
  const clonedScene = useMemo(() => {
    const cloned = scene.clone(true);

    cloned.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const srcMat = Array.isArray(child.material) ? child.material[0] : child.material;
      const matName: string = (srcMat?.name ?? "").toLowerCase();
      const meshName: string = (child.name ?? "").toLowerCase();

      const isGum = matName.includes("gum") || matName.includes("gingiva") ||
                    matName.includes("material.001") || meshName.includes("gum") ||
                    meshName.includes("gingiva");

      let isGumByColor = false;
      if (srcMat && 'color' in srcMat) {
        const c = (srcMat as THREE.MeshStandardMaterial).color;
        if (c && c.r > 0.6 && c.g < 0.4 && c.b < 0.5) isGumByColor = true;
      }

      if (isGum || isGumByColor) {
        child.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color("#d4878a"),
          roughness: 0.72,
          metalness: 0.0,
          clearcoat: 0.05,
          clearcoatRoughness: 0.9,
          transmission: 0.05,
          thickness: 0.5,
        });
        child.userData.isGum = true;
      } else {
        child.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color("#f5f0e8"),
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
        child.userData.isTooth = true;
        child.castShadow = true;
      }
    });

    return cloned;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  /* Auto-fit */
  const { scale, offset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const s = maxDim > 0 ? 2.0 / maxDim : 1;
    return { scale: s, offset: center.multiplyScalar(-s) };
  }, [clonedScene]);

  /* Update emissive when toothData or selectedTooth changes */
  useEffect(() => {
    clonedScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.isGum) return;
      const mat = child.material as THREE.MeshPhysicalMaterial;
      if (!mat) return;

      const meshName = child.name || "";
      if (selectedTooth && meshName === selectedTooth) {
        mat.emissive.set(SELECTED_EMISSIVE.color);
        mat.emissiveIntensity = SELECTED_EMISSIVE.intensity;
      } else {
        mat.emissive.set(emissive.color);
        mat.emissiveIntensity = emissive.intensity;
      }
    });
  }, [clonedScene, emissive, selectedTooth]);

  /* Pointer handlers */
  const handleOver = useCallback((e: any) => {
    e.stopPropagation?.();
    const name = e.object?.name ?? "";
    if (e.object?.userData?.isGum) return;
    onHover(name || null);
    document.body.style.cursor = "pointer";
    const mat = e.object?.material as THREE.MeshPhysicalMaterial;
    if (mat && mat.emissiveIntensity !== undefined && e.object?.userData?.isTooth) {
      mat.emissiveIntensity = Math.min(mat.emissiveIntensity + 0.25, 0.6);
    }
  }, [onHover]);

  const handleOut = useCallback((e: any) => {
    if (e.object?.userData?.isGum) return;
    onHover(null);
    document.body.style.cursor = "auto";
    const mat = e.object?.material as THREE.MeshPhysicalMaterial;
    const meshName = e.object?.name || "";
    if (mat && e.object?.userData?.isTooth) {
      if (selectedTooth && meshName === selectedTooth) {
        mat.emissiveIntensity = SELECTED_EMISSIVE.intensity;
      } else {
        mat.emissiveIntensity = emissive.intensity;
      }
    }
  }, [onHover, emissive.intensity, selectedTooth]);

  const handleClick = useCallback((e: any) => {
    e.stopPropagation?.();
    if (e.object?.userData?.isGum) return;
    const name = e.object?.name ?? "tooth";
    onClick(name);
  }, [onClick]);

  return (
    <group ref={groupRef} scale={[scale, scale, scale]} position={[offset.x, offset.y, offset.z]}>
      <primitive
        object={clonedScene}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
      />
    </group>
  );
}

/* ─── Full 3D scene ─── */
function Scene({
  viewMode,
  toothData,
  selectedTooth,
  onHover,
  onClick,
  controlsRef,
  resetTrigger,
}: {
  viewMode: ViewMode;
  toothData: Record<string, ToothStatus>;
  selectedTooth: string | null;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
  controlsRef: React.RefObject<any>;
  resetTrigger: number;
}) {
  return (
    <>
      <directionalLight position={[3, 6, 4]} intensity={1.1} color="#fff8ee" castShadow />
      <directionalLight position={[-4, 3, -1]} intensity={0.55} color="#c8d8ff" />
      <directionalLight position={[0, -2, 3]} intensity={0.28} color="#ffffff" />
      <ambientLight intensity={0.38} />
      <Environment preset="studio" />
      <DentalModel toothData={toothData} selectedTooth={selectedTooth} onHover={onHover} onClick={onClick} />
      <CameraAnimator viewMode={viewMode} />
      <ResetHandler resetTrigger={resetTrigger} controlsRef={controlsRef} />
      <OrbitControls
        ref={controlsRef}
        enableZoom={true}
        enablePan={false}
        enableDamping={true}
        dampingFactor={0.1}
        minDistance={2.5}
        maxDistance={7}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI * 0.72}
        rotateSpeed={0.7}
      />
    </>
  );
}

/* ─── 2D SVG Tooth Chart ─── */
const STATUS_COLORS_2D: Record<ToothStatus, string> = {
  on_track: "#22c55e",
  deviation: "#f59e0b",
  attention: "#ef4444",
  no_data: "rgba(255,255,255,0.12)",
};

interface ToothDef {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

const UPPER_TEETH: ToothDef[] = [
  { id: "T18", cx: 32, cy: 128, rx: 7, ry: 10 },
  { id: "T17", cx: 34, cy: 110, rx: 7, ry: 9 },
  { id: "T16", cx: 38, cy: 92, rx: 8, ry: 9 },
  { id: "T15", cx: 46, cy: 74, rx: 8, ry: 9 },
  { id: "T14", cx: 56, cy: 58, rx: 8, ry: 8 },
  { id: "T13", cx: 72, cy: 44, rx: 8, ry: 8 },
  { id: "T12", cx: 92, cy: 32, rx: 7, ry: 7 },
  { id: "T11", cx: 112, cy: 24, rx: 7, ry: 7 },
  { id: "T21", cx: 148, cy: 24, rx: 7, ry: 7 },
  { id: "T22", cx: 168, cy: 32, rx: 7, ry: 7 },
  { id: "T23", cx: 188, cy: 44, rx: 8, ry: 8 },
  { id: "T24", cx: 204, cy: 58, rx: 8, ry: 8 },
  { id: "T25", cx: 214, cy: 74, rx: 8, ry: 9 },
  { id: "T26", cx: 222, cy: 92, rx: 8, ry: 9 },
  { id: "T27", cx: 226, cy: 110, rx: 7, ry: 9 },
  { id: "T28", cx: 228, cy: 128, rx: 7, ry: 10 },
];

const LOWER_TEETH: ToothDef[] = [
  { id: "T48", cx: 32, cy: 170, rx: 7, ry: 10 },
  { id: "T47", cx: 34, cy: 188, rx: 7, ry: 9 },
  { id: "T46", cx: 38, cy: 206, rx: 8, ry: 9 },
  { id: "T45", cx: 46, cy: 224, rx: 8, ry: 9 },
  { id: "T44", cx: 56, cy: 240, rx: 8, ry: 8 },
  { id: "T43", cx: 72, cy: 254, rx: 8, ry: 8 },
  { id: "T42", cx: 92, cy: 266, rx: 7, ry: 7 },
  { id: "T41", cx: 112, cy: 274, rx: 7, ry: 7 },
  { id: "T31", cx: 148, cy: 274, rx: 7, ry: 7 },
  { id: "T32", cx: 168, cy: 266, rx: 7, ry: 7 },
  { id: "T33", cx: 188, cy: 254, rx: 8, ry: 8 },
  { id: "T34", cx: 204, cy: 240, rx: 8, ry: 8 },
  { id: "T35", cx: 214, cy: 224, rx: 8, ry: 9 },
  { id: "T36", cx: 222, cy: 206, rx: 8, ry: 9 },
  { id: "T37", cx: 226, cy: 188, rx: 7, ry: 9 },
  { id: "T38", cx: 228, cy: 170, rx: 7, ry: 10 },
];

function ToothChart2D({
  toothData,
  onToothSelect,
}: {
  toothData: Record<string, ToothStatus>;
  onToothSelect?: (id: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const handleClick = (id: string) => {
    setSelected(selected === id ? null : id);
    onToothSelect?.(id);
  };

  const renderTooth = (def: ToothDef) => {
    const status = toothData[def.id] ?? "no_data";
    const isNoData = status === "no_data";
    const color = STATUS_COLORS_2D[status];
    const isHovered = hovered === def.id;
    const isSelected = selected === def.id;

    return (
      <g key={def.id}>
        {/* Permanent white outline ring for visibility */}
        <ellipse
          cx={def.cx}
          cy={def.cy}
          rx={def.rx + 2}
          ry={def.ry + 2}
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth={1}
        />
        {/* Selection ring */}
        {isSelected && (
          <ellipse
            cx={def.cx}
            cy={def.cy}
            rx={def.rx + 4}
            ry={def.ry + 4}
            fill="none"
            stroke="#4f7cff"
            strokeWidth={1.5}
            strokeDasharray="3 2"
            opacity={0.8}
          />
        )}
        <ellipse
          cx={def.cx}
          cy={def.cy}
          rx={isHovered ? def.rx + 1 : def.rx}
          ry={isHovered ? def.ry + 1 : def.ry}
          fill={isNoData ? "rgba(255,255,255,0.12)" : color}
          opacity={isHovered || isSelected ? 0.9 : 0.3}
          stroke={isSelected ? "#4f7cff" : isHovered ? "#ffffff" : "transparent"}
          strokeWidth={isSelected ? 1.5 : isHovered ? 1.2 : 0}
          onMouseEnter={() => setHovered(def.id)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => handleClick(def.id)}
          className="cursor-pointer transition-opacity"
        />
        {/* Hover tooltip */}
        {isHovered && (
          <>
            <rect
              x={def.cx - 30}
              y={def.cy - 22}
              width={60}
              height={16}
              rx={4}
              fill="hsl(240 30% 14%)"
            />
            <text
              x={def.cx}
              y={def.cy - 11}
              textAnchor="middle"
              fill="white"
              fontSize="6"
              fontFamily="monospace"
              letterSpacing="0.08em"
            >
              {def.id} · {status.replace("_", " ").toUpperCase()}
            </text>
          </>
        )}
      </g>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full py-2">
      <svg viewBox="0 0 260 300" className="w-full max-w-xs mx-auto" style={{ maxHeight: "100%" }}>
        <path
          d="M 30 130 Q 30 18, 130 10 Q 230 18, 230 130"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="28"
          strokeLinecap="round"
        />
        <text x="130" y="8" textAnchor="middle" fill="currentColor" fontSize="6" fontFamily="monospace" letterSpacing="0.15em" opacity="0.4">
          UPPER
        </text>
        {UPPER_TEETH.map(renderTooth)}
        <path
          d="M 30 170 Q 30 282, 130 290 Q 230 282, 230 170"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="28"
          strokeLinecap="round"
        />
        {LOWER_TEETH.map(renderTooth)}
        <text x="130" y="299" textAnchor="middle" fill="currentColor" fontSize="6" fontFamily="monospace" letterSpacing="0.15em" opacity="0.4">
          LOWER
        </text>
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
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<RenderMode>(defaultRenderMode);
  const [resetTrigger, setResetTrigger] = useState(0);
  const controlsRef = useRef<any>(null);

  const handleClick = useCallback(
    (id: string) => {
      setSelectedTooth((prev) => (prev === id ? null : id));
      onToothSelect?.(id);
    },
    [onToothSelect]
  );

  const handleReset = useCallback(() => {
    setViewMode("both");
    setResetTrigger((n) => n + 1);
    setSelectedTooth(null);
  }, []);

  const height = compact ? "h-[200px]" : "h-[300px]";

  return (
    <div className={cn("relative", className)}>
      {/* Controls row */}
      {showToggle && !compact && (
        <div className="flex items-center justify-between mb-2">
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
      <div className={cn(height, "w-full rounded-lg overflow-hidden relative")}>
        {renderMode === "3d" ? (
          <>
            <Suspense fallback={<Skeleton className="w-full h-full" />}>
              <Canvas
                camera={{ position: [0, 0.6, 4.5], fov: compact ? 36 : 32 }}
                gl={{ antialias: true, alpha: true }}
                style={{ width: "100%", height: "100%" }}
              >
                <color attach="background" args={["transparent"]} />
                <Scene
                  viewMode={viewMode}
                  toothData={toothData}
                  selectedTooth={selectedTooth}
                  onHover={setHoveredTooth}
                  onClick={handleClick}
                  controlsRef={controlsRef}
                  resetTrigger={resetTrigger}
                />
              </Canvas>
            </Suspense>
            {/* Reset view button */}
            <button
              onClick={handleReset}
              className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-muted/70 backdrop-blur-sm border border-border hover:bg-muted transition-colors"
              title="Reset view"
            >
              <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </>
        ) : (
          <ToothChart2D toothData={toothData} onToothSelect={onToothSelect} />
        )}
      </div>

      {/* Hover/selected tooltip (3D only) */}
      {renderMode === "3d" && (hoveredTooth || selectedTooth) && (
        <div className="absolute top-2 left-2 bg-popover/90 backdrop-blur-sm border border-border rounded-lg px-3 py-1.5 pointer-events-none z-10">
          <span className="mono-label text-foreground">
            {(hoveredTooth || selectedTooth || "").replace(/_/g, " ").toUpperCase()}
          </span>
          {selectedTooth && !hoveredTooth && (
            <span className="mono-label text-muted-foreground ml-2">SELECTED</span>
          )}
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

/* Preload the model */
useGLTF.preload("/teeth.glb");
