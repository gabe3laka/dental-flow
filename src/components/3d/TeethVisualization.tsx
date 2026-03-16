import { useRef, useMemo, useState, useCallback, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { RotateCcw, X } from "lucide-react";

/* ─── Types ─── */
export type ToothStatus = "on_track" | "deviation" | "attention" | "no_data";
export type ViewMode = "both" | "upper" | "lower";

/* ─── 3D hit-point → FDI tooth mapping ─── */
// Each entry maps an FDI tooth ID to an approximate 3D region (model-local coords).
// x = left-right, y = up-down, z = front-back on the arch.
// These are tuned for the teeth.glb model scaled to fit within ~[-1,1].
interface ToothRegion {
  id: string;
  x: [number, number]; // min, max
  y: [number, number];
}

// Upper teeth (positive y in model space typically)
const TOOTH_REGIONS_UPPER: ToothRegion[] = [
  { id: "T11", x: [-0.12, 0.0],  y: [0.0, 0.6] },
  { id: "T21", x: [0.0, 0.12],   y: [0.0, 0.6] },
  { id: "T12", x: [-0.22, -0.12], y: [0.0, 0.6] },
  { id: "T22", x: [0.12, 0.22],  y: [0.0, 0.6] },
  { id: "T13", x: [-0.34, -0.22], y: [0.0, 0.6] },
  { id: "T23", x: [0.22, 0.34],  y: [0.0, 0.6] },
  { id: "T14", x: [-0.46, -0.34], y: [0.0, 0.6] },
  { id: "T24", x: [0.34, 0.46],  y: [0.0, 0.6] },
  { id: "T15", x: [-0.58, -0.46], y: [0.0, 0.6] },
  { id: "T25", x: [0.46, 0.58],  y: [0.0, 0.6] },
  { id: "T16", x: [-0.72, -0.58], y: [0.0, 0.6] },
  { id: "T26", x: [0.58, 0.72],  y: [0.0, 0.6] },
  { id: "T17", x: [-0.88, -0.72], y: [0.0, 0.6] },
  { id: "T27", x: [0.72, 0.88],  y: [0.0, 0.6] },
  { id: "T18", x: [-1.1, -0.88], y: [0.0, 0.6] },
  { id: "T28", x: [0.88, 1.1],   y: [0.0, 0.6] },
];

// Lower teeth (negative y in model space typically)
const TOOTH_REGIONS_LOWER: ToothRegion[] = [
  { id: "T41", x: [-0.12, 0.0],  y: [-0.6, 0.0] },
  { id: "T31", x: [0.0, 0.12],   y: [-0.6, 0.0] },
  { id: "T42", x: [-0.22, -0.12], y: [-0.6, 0.0] },
  { id: "T32", x: [0.12, 0.22],  y: [-0.6, 0.0] },
  { id: "T43", x: [-0.34, -0.22], y: [-0.6, 0.0] },
  { id: "T33", x: [0.22, 0.34],  y: [-0.6, 0.0] },
  { id: "T44", x: [-0.46, -0.34], y: [-0.6, 0.0] },
  { id: "T34", x: [0.34, 0.46],  y: [-0.6, 0.0] },
  { id: "T45", x: [-0.58, -0.46], y: [-0.6, 0.0] },
  { id: "T35", x: [0.46, 0.58],  y: [-0.6, 0.0] },
  { id: "T46", x: [-0.72, -0.58], y: [-0.6, 0.0] },
  { id: "T36", x: [0.58, 0.72],  y: [-0.6, 0.0] },
  { id: "T47", x: [-0.88, -0.72], y: [-0.6, 0.0] },
  { id: "T37", x: [0.72, 0.88],  y: [-0.6, 0.0] },
  { id: "T48", x: [-1.1, -0.88], y: [-0.6, 0.0] },
  { id: "T38", x: [0.88, 1.1],   y: [-0.6, 0.0] },
];

const ALL_TOOTH_REGIONS = [...TOOTH_REGIONS_UPPER, ...TOOTH_REGIONS_LOWER];

/** Given a local-space hit point, find the closest FDI tooth ID */
function identifyToothFromPoint(localPoint: THREE.Vector3): string {
  let bestId = "tooth";
  let bestDist = Infinity;

  for (const region of ALL_TOOTH_REGIONS) {
    const cx = (region.x[0] + region.x[1]) / 2;
    const cy = (region.y[0] + region.y[1]) / 2;
    const dx = localPoint.x - cx;
    const dy = localPoint.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      bestId = region.id;
    }
  }

  return bestId;
}
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
  const isAnimating = useRef(false);
  const prevViewMode = useRef(viewMode);

  // Trigger animation only when viewMode changes
  useEffect(() => {
    if (prevViewMode.current !== viewMode) {
      isAnimating.current = true;
      prevViewMode.current = viewMode;
    }
  }, [viewMode]);

  useFrame(() => {
    if (!isAnimating.current) return;

    const preset = CAMERA_PRESETS[viewMode];
    const targetPos = new THREE.Vector3(...preset.pos);
    const targetLook = new THREE.Vector3(...preset.target);

    camera.position.lerp(targetPos, 0.06);
    targetVec.current.lerp(targetLook, 0.06);
    camera.lookAt(targetVec.current);

    // Stop animating once close enough
    if (camera.position.distanceTo(targetPos) < 0.01) {
      camera.position.copy(targetPos);
      isAnimating.current = false;
    }
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
  const inverseMatrix = useRef(new THREE.Matrix4());

  const overallStatus = useMemo(() => resolveOverallStatus(toothData), [toothData]);

  /* Debug: log scene graph once */
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geo = child.geometry;
        const vCount = geo?.attributes?.position?.count ?? 0;
        console.log(`[TeethGLB] Mesh: "${child.name}" | vertices: ${vCount} | material: "${(child.material as any)?.name || 'unnamed'}"`);
      }
    });
  }, [scene]);
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
        // Disable raycasting on gum meshes so clicks pass through to teeth
        child.raycast = () => {};
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

  /* Update emissive when toothData changes */
  useEffect(() => {
    clonedScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.isGum) return;
      const mat = child.material as THREE.MeshPhysicalMaterial;
      if (!mat) return;
      mat.emissive.set(emissive.color);
      mat.emissiveIntensity = emissive.intensity;
    });
  }, [clonedScene, emissive]);

  /* Convert world hit point to model-local space and identify tooth */
  const getToothIdFromEvent = useCallback((e: any): string | null => {
    if (!e.point || !groupRef.current) return null;
    inverseMatrix.current.copy(groupRef.current.matrixWorld).invert();
    const localPoint = e.point.clone().applyMatrix4(inverseMatrix.current);
    console.log("[TeethHit] local point:", localPoint.x.toFixed(3), localPoint.y.toFixed(3), localPoint.z.toFixed(3));
    return identifyToothFromPoint(localPoint);
  }, []);

  /* Pointer handlers */
  const handleOver = useCallback((e: any) => {
    e.stopPropagation?.();
    if (e.object?.userData?.isGum) return;
    const toothId = getToothIdFromEvent(e);
    onHover(toothId);
    document.body.style.cursor = "pointer";
  }, [onHover, getToothIdFromEvent]);

  const handleOut = useCallback((e: any) => {
    if (e.object?.userData?.isGum) return;
    onHover(null);
    document.body.style.cursor = "auto";
  }, [onHover]);

  const handleClick = useCallback((e: any) => {
    e.stopPropagation?.();
    if (e.object?.userData?.isGum) return;
    const toothId = getToothIdFromEvent(e);
    if (toothId) onClick(toothId);
  }, [onClick, getToothIdFromEvent]);

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
        {/* UPPER label inside the arch */}
        <text
          x="130"
          y="78"
          textAnchor="middle"
          fill="currentColor"
          fontSize="10"
          fontFamily="monospace"
          fontWeight="600"
          letterSpacing="0.22em"
          opacity="0.5"
        >
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
        {/* LOWER label inside the arch */}
        <text
          x="130"
          y="228"
          textAnchor="middle"
          fill="currentColor"
          fontSize="10"
          fontFamily="monospace"
          fontWeight="600"
          letterSpacing="0.22em"
          opacity="0.5"
        >
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

/* ─── FDI tooth name lookup ─── */
const TOOTH_NAMES: Record<string, string> = {
  T11: "Upper Right Central Incisor", T21: "Upper Left Central Incisor",
  T12: "Upper Right Lateral Incisor", T22: "Upper Left Lateral Incisor",
  T13: "Upper Right Canine", T23: "Upper Left Canine",
  T14: "Upper Right First Premolar", T24: "Upper Left First Premolar",
  T15: "Upper Right Second Premolar", T25: "Upper Left Second Premolar",
  T16: "Upper Right First Molar", T26: "Upper Left First Molar",
  T17: "Upper Right Second Molar", T27: "Upper Left Second Molar",
  T18: "Upper Right Third Molar", T28: "Upper Left Third Molar",
  T41: "Lower Right Central Incisor", T31: "Lower Left Central Incisor",
  T42: "Lower Right Lateral Incisor", T32: "Lower Left Lateral Incisor",
  T43: "Lower Right Canine", T33: "Lower Left Canine",
  T44: "Lower Right First Premolar", T34: "Lower Left First Premolar",
  T45: "Lower Right Second Premolar", T35: "Lower Left Second Premolar",
  T46: "Lower Right First Molar", T36: "Lower Left First Molar",
  T47: "Lower Right Second Molar", T37: "Lower Left Second Molar",
  T48: "Lower Right Third Molar", T38: "Lower Left Third Molar",
};

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
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const controlsRef = useRef<any>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

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

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
    setHoveredTooth(null);
  }, []);

  const height = compact ? "h-[200px]" : "h-[300px]";

  const displayTooth = hoveredTooth || selectedTooth;
  const toothName = displayTooth ? TOOTH_NAMES[displayTooth] || displayTooth : null;
  const toothStatus = displayTooth ? (toothData[displayTooth] ?? "no_data") : null;

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
      <div
        ref={canvasContainerRef}
        className={cn(height, "w-full rounded-lg overflow-hidden relative")}
        onMouseMove={renderMode === "3d" ? handleMouseMove : undefined}
        onMouseLeave={renderMode === "3d" ? handleMouseLeave : undefined}
      >
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

            {/* Mouse-following hover tooltip (inside the canvas container) */}
            {hoveredTooth && mousePos && (
              <div
                className="absolute z-20 pointer-events-none bg-popover/95 backdrop-blur-sm border border-border rounded-lg px-3 py-1.5 shadow-md"
                style={{
                  left: Math.min(mousePos.x + 12, (canvasContainerRef.current?.offsetWidth ?? 300) - 140),
                  top: mousePos.y - 36,
                }}
              >
                <span className="mono-label text-foreground text-[11px]">
                  {hoveredTooth}
                </span>
                <span className="mono-label text-muted-foreground text-[10px] ml-1.5">
                  {TOOTH_NAMES[hoveredTooth]?.split(" ").slice(-2).join(" ") || ""}
                </span>
              </div>
            )}

            {/* Bottom info bar for selected tooth */}
            {selectedTooth && (
              <div className="absolute bottom-0 left-0 right-0 z-10 bg-popover/90 backdrop-blur-sm border-t border-border px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: STATUS_COLORS_2D[toothStatus ?? "no_data"] }}
                  />
                  <span className="mono-label text-foreground text-[11px]">
                    {selectedTooth}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                    {toothName}
                  </span>
                  <span className="mono-label text-[10px] text-muted-foreground uppercase">
                    · {(toothStatus ?? "no_data").replace("_", " ")}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedTooth(null)}
                  className="p-0.5 rounded hover:bg-muted transition-colors"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            )}
          </>
        ) : (
          <ToothChart2D toothData={toothData} onToothSelect={onToothSelect} />
        )}
      </div>

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
