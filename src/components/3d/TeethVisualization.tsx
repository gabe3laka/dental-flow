import { useRef, useMemo, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
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

/* ─── Status → Color mapping ─── */
const STATUS_COLORS: Record<ToothStatus, { color: string; emissive: string; intensity: number }> = {
  on_track:  { color: "#e8f5e9", emissive: "#22c55e", intensity: 0.4 },
  deviation: { color: "#fff8e1", emissive: "#f59e0b", intensity: 0.4 },
  attention: { color: "#ffebee", emissive: "#ef4444", intensity: 0.5 },
  no_data:   { color: "#f5f0e8", emissive: "#000000", intensity: 0 },
};

/* ─── Arch curve ─── */
function archCurvePoints(segments = 28): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = Math.PI * t;
    pts.push(new THREE.Vector3(Math.cos(angle) * 1.35, 0, -Math.sin(angle) * 1.1));
  }
  return pts;
}

/* ─── Gum mesh ─── */
function GumArch({ flip = false }: { flip?: boolean }) {
  const geometry = useMemo(() => {
    const pts = archCurvePoints(40);
    const shape = new THREE.Shape();
    shape.moveTo(-0.18, -0.12);
    shape.lineTo(0.18, -0.12);
    shape.quadraticCurveTo(0.24, -0.12, 0.24, -0.04);
    shape.lineTo(0.24, 0.06);
    shape.quadraticCurveTo(0.24, 0.14, 0.18, 0.14);
    shape.lineTo(-0.18, 0.14);
    shape.quadraticCurveTo(-0.24, 0.14, -0.24, 0.06);
    shape.lineTo(-0.24, -0.04);
    shape.quadraticCurveTo(-0.24, -0.12, -0.18, -0.12);
    const curve = new THREE.CatmullRomCurve3(pts, false);
    return new THREE.ExtrudeGeometry(shape, { steps: 60, bevelEnabled: false, extrudePath: curve });
  }, []);

  return (
    <mesh geometry={geometry} scale={flip ? [1, -1, 1] : [1, 1, 1]}>
      <meshStandardMaterial color="#c87072" roughness={0.8} metalness={0.02} />
    </mesh>
  );
}

/* ─── Tooth types & scales ─── */
type ToothType = "incisor" | "canine" | "premolar" | "molar";
const TOOTH_TYPES: ToothType[] = [
  "molar", "molar", "molar", "premolar", "premolar", "canine",
  "incisor", "incisor", "incisor", "incisor",
  "canine", "premolar", "premolar", "molar", "molar", "molar",
];
const TOOTH_SCALES: [number, number][] = [
  [1.1, 0.72], [1.05, 0.75], [1.1, 0.75],
  [0.95, 0.82], [0.9, 0.88],
  [0.8, 1.1],
  [0.75, 0.92], [0.85, 1.0], [0.85, 1.0], [0.75, 0.92],
  [0.8, 1.1],
  [0.9, 0.88], [0.95, 0.82],
  [1.1, 0.75], [1.05, 0.75], [1.1, 0.72],
];

function createToothGeometry(type: ToothType, wS: number, hS: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const profiles: Record<ToothType, [number, number][]> = {
    incisor: [[0,0],[0.04,0.02],[0.055,0.06],[0.06,0.12],[0.065,0.18],[0.07,0.22],[0.065,0.26],[0.055,0.28],[0.03,0.29],[0,0.295]],
    canine: [[0,0],[0.04,0.02],[0.06,0.06],[0.07,0.12],[0.072,0.18],[0.065,0.22],[0.05,0.27],[0.03,0.30],[0.012,0.32],[0,0.33]],
    premolar: [[0,0],[0.05,0.02],[0.07,0.06],[0.08,0.10],[0.085,0.15],[0.082,0.19],[0.075,0.22],[0.065,0.235],[0.04,0.245],[0,0.25]],
    molar: [[0,0],[0.06,0.02],[0.08,0.05],[0.095,0.09],[0.10,0.13],[0.098,0.16],[0.092,0.18],[0.085,0.195],[0.06,0.205],[0,0.21]],
  };
  profiles[type].forEach(([x, y]) => pts.push(new THREE.Vector2(x * wS, y * hS)));
  const geo = new THREE.LatheGeometry(pts, 16);
  geo.computeVertexNormals();
  return geo;
}

/* ─── Single Tooth with hover ─── */
function Tooth({
  geometry, position, rotation, status, toothId, onHover, onClick,
}: {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation: [number, number, number];
  status: ToothStatus;
  toothId: string;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const { color, emissive, intensity } = STATUS_COLORS[status];

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={position}
      rotation={rotation}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover(toothId); }}
      onPointerOut={() => { setHovered(false); onHover(null); }}
      onClick={(e) => { e.stopPropagation(); onClick(toothId); }}
    >
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={hovered ? intensity + 0.3 : intensity}
        roughness={0.35}
        metalness={0.08}
        envMapIntensity={0.8}
      />
    </mesh>
  );
}

/* ─── Teeth Row (upper or lower, 16 teeth) ─── */
function TeethRow({
  flip = false, startIndex = 1, toothData, onHover, onClick,
}: {
  flip?: boolean;
  startIndex?: number;
  toothData: Record<string, ToothStatus>;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}) {
  const positions = useMemo(() => {
    const archPts = archCurvePoints(100);
    let totalLen = 0;
    for (let i = 1; i < archPts.length; i++) totalLen += archPts[i].distanceTo(archPts[i - 1]);
    const result: { pos: THREE.Vector3; angle: number }[] = [];
    const count = 16;
    for (let i = 0; i < count; i++) {
      const targetDist = ((i + 0.5) / count) * totalLen;
      let acc = 0;
      for (let j = 1; j < archPts.length; j++) {
        const segLen = archPts[j].distanceTo(archPts[j - 1]);
        if (acc + segLen >= targetDist) {
          const frac = (targetDist - acc) / segLen;
          const pos = archPts[j - 1].clone().lerp(archPts[j], frac);
          const dir = archPts[j].clone().sub(archPts[j - 1]).normalize();
          result.push({ pos, angle: Math.atan2(dir.x, dir.z) });
          break;
        }
        acc += segLen;
      }
    }
    return result;
  }, []);

  const geometries = useMemo(
    () => TOOTH_TYPES.map((type, i) => createToothGeometry(type, TOOTH_SCALES[i][0], TOOTH_SCALES[i][1])),
    []
  );

  return (
    <group>
      {positions.map(({ pos, angle }, i) => {
        const toothId = `tooth_${startIndex + i}`;
        const status = toothData[toothId] || "no_data";
        const yOffset = flip ? -0.18 : 0.18;
        return (
          <Tooth
            key={toothId}
            geometry={geometries[i]}
            position={[pos.x, yOffset, pos.z]}
            rotation={[flip ? Math.PI : 0, angle + Math.PI / 2, 0]}
            status={status}
            toothId={toothId}
            onHover={onHover}
            onClick={onClick}
          />
        );
      })}
    </group>
  );
}

/* ─── Camera animator ─── */
const CAMERA_PRESETS: Record<ViewMode, { pos: [number, number, number]; target: [number, number, number] }> = {
  both:  { pos: [0, 1.8, 4.2], target: [0, -0.1, 0] },
  upper: { pos: [0, 2.5, 3.5], target: [0, 0.3, 0] },
  lower: { pos: [0, -0.5, 3.8], target: [0, -0.5, 0] },
};

function CameraAnimator({ viewMode }: { viewMode: ViewMode }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3());

  useFrame(() => {
    const preset = CAMERA_PRESETS[viewMode];
    camera.position.lerp(new THREE.Vector3(...preset.pos), 0.04);
    target.current.lerp(new THREE.Vector3(...preset.target), 0.04);
    camera.lookAt(target.current);
  });

  return null;
}

/* ─── Full dental model ─── */
function DentalModel({
  toothData, onHover, onClick,
}: {
  toothData: Record<string, ToothStatus>;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_s, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.15;
  });

  return (
    <group ref={groupRef} rotation={[0.35, 0, 0]} position={[0, -0.3, 0]}>
      <group position={[0, 0.22, 0]}>
        <GumArch />
        <TeethRow startIndex={1} toothData={toothData} onHover={onHover} onClick={onClick} />
      </group>
      <group position={[0, -0.22, 0]}>
        <GumArch flip />
        <TeethRow flip startIndex={17} toothData={toothData} onHover={onHover} onClick={onClick} />
      </group>
    </group>
  );
}

/* ─── Scene wrapper ─── */
function Scene({
  viewMode, toothData, onHover, onClick,
}: {
  viewMode: ViewMode;
  toothData: Record<string, ToothStatus>;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 4]} intensity={1.0} />
      <directionalLight position={[-4, 2, -2]} intensity={0.6} color="#6b9aff" />
      <pointLight position={[0, -3, 2]} intensity={0.3} color="#b8a8f0" />
      <DentalModel toothData={toothData} onHover={onHover} onClick={onClick} />
      <CameraAnimator viewMode={viewMode} />
      <OrbitControls enableZoom={false} enablePan={false} autoRotate={false} />
      <Environment preset="studio" />
    </>
  );
}

/* ─── Legend item ─── */
const LEGEND: { status: ToothStatus; label: string; color: string }[] = [
  { status: "on_track", label: "ON TRACK", color: "#22c55e" },
  { status: "deviation", label: "DEVIATION", color: "#f59e0b" },
  { status: "attention", label: "ATTENTION", color: "#ef4444" },
  { status: "no_data", label: "NO DATA", color: "#6b7280" },
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

  const height = compact ? "h-[200px]" : "h-[280px]";

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

      {/* Canvas */}
      <div className={cn(height, "w-full rounded-lg overflow-hidden")}>
        <Suspense fallback={<Skeleton className="w-full h-full" />}>
          <Canvas
            camera={{ position: [0, 1.8, 4.2], fov: compact ? 36 : 32 }}
            gl={{ antialias: true, alpha: true }}
            style={{ width: "100%", height: "100%" }}
          >
            <color attach="background" args={["transparent"]} />
            <Scene viewMode={viewMode} toothData={toothData} onHover={setHoveredTooth} onClick={handleClick} />
          </Canvas>
        </Suspense>
      </div>

      {/* Hover tooltip */}
      {hoveredTooth && (
        <div className="absolute top-2 left-2 bg-popover/90 backdrop-blur-sm border border-border rounded-lg px-3 py-1.5 pointer-events-none z-10">
          <span className="mono-label text-foreground">
            {hoveredTooth.replace("_", " ").toUpperCase()}
          </span>
          {toothData[hoveredTooth] && (
            <span className={cn("ml-2 mono-label", {
              "text-status-success": toothData[hoveredTooth] === "on_track",
              "text-gold": toothData[hoveredTooth] === "deviation",
              "text-destructive": toothData[hoveredTooth] === "attention",
              "text-muted-foreground": toothData[hoveredTooth] === "no_data",
            })}>
              {toothData[hoveredTooth].replace("_", " ").toUpperCase()}
            </span>
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
