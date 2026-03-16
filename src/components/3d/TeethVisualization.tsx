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
  on_track:  { color: "#f5f0e8", emissive: "#22c55e", intensity: 0.25 },
  deviation: { color: "#f5f0e8", emissive: "#f59e0b", intensity: 0.25 },
  attention: { color: "#f5f0e8", emissive: "#ef4444", intensity: 0.3 },
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
    // Thicker, more anatomical gum cross-section
    shape.moveTo(-0.20, -0.14);
    shape.lineTo(0.20, -0.14);
    shape.quadraticCurveTo(0.28, -0.14, 0.28, -0.04);
    shape.lineTo(0.28, 0.08);
    shape.quadraticCurveTo(0.28, 0.18, 0.20, 0.18);
    shape.lineTo(-0.20, 0.18);
    shape.quadraticCurveTo(-0.28, 0.18, -0.28, 0.08);
    shape.lineTo(-0.28, -0.04);
    shape.quadraticCurveTo(-0.28, -0.14, -0.20, -0.14);
    const curve = new THREE.CatmullRomCurve3(pts, false);
    return new THREE.ExtrudeGeometry(shape, { steps: 60, bevelEnabled: false, extrudePath: curve });
  }, []);

  return (
    <mesh geometry={geometry} scale={flip ? [1, -1, 1] : [1, 1, 1]}>
      <meshPhysicalMaterial
        color="#d4878a"
        roughness={0.75}
        metalness={0.02}
        clearcoat={0.1}
        clearcoatRoughness={0.8}
        transmission={0.05}
        thickness={0.5}
      />
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
// [widthScale, heightScale]
const TOOTH_SCALES: [number, number][] = [
  [1.1, 0.72], [1.05, 0.75], [1.1, 0.75],
  [0.95, 0.82], [0.9, 0.88],
  [0.8, 1.1],
  [0.75, 0.92], [0.85, 1.0], [0.85, 1.0], [0.75, 0.92],
  [0.8, 1.1],
  [0.9, 0.88], [0.95, 0.82],
  [1.1, 0.75], [1.05, 0.75], [1.1, 0.72],
];

/* ─── Anatomical tooth cross-section shapes ─── */
function createToothShape(type: ToothType, wS: number): THREE.Shape {
  const shape = new THREE.Shape();
  switch (type) {
    case "incisor": {
      // Thin, shovel-shaped: wide labio-lingually, narrow mesio-distally
      const w = 0.065 * wS;
      const d = 0.032 * wS;
      shape.moveTo(w, 0);
      shape.quadraticCurveTo(w, d, 0, d);
      shape.quadraticCurveTo(-w, d, -w, 0);
      shape.quadraticCurveTo(-w, -d, 0, -d);
      shape.quadraticCurveTo(w, -d, w, 0);
      break;
    }
    case "canine": {
      // Teardrop / pointed oval — slightly more round than incisor
      const w = 0.055 * wS;
      const d = 0.04 * wS;
      shape.moveTo(w, 0);
      shape.quadraticCurveTo(w, d * 1.1, 0, d);
      shape.quadraticCurveTo(-w, d * 1.1, -w, 0);
      shape.quadraticCurveTo(-w, -d * 0.9, 0, -d * 0.85);
      shape.quadraticCurveTo(w, -d * 0.9, w, 0);
      break;
    }
    case "premolar": {
      // Oval, wider bucco-lingually
      const w = 0.058 * wS;
      const d = 0.048 * wS;
      shape.moveTo(w, 0);
      shape.quadraticCurveTo(w, d, 0, d);
      shape.quadraticCurveTo(-w, d, -w, 0);
      shape.quadraticCurveTo(-w, -d, 0, -d);
      shape.quadraticCurveTo(w, -d, w, 0);
      break;
    }
    case "molar": {
      // Rounded rectangle — widest tooth
      const w = 0.07 * wS;
      const d = 0.06 * wS;
      const r = 0.015 * wS; // corner radius
      shape.moveTo(w - r, -d);
      shape.lineTo(w - r, -d);
      shape.quadraticCurveTo(w, -d, w, -d + r);
      shape.lineTo(w, d - r);
      shape.quadraticCurveTo(w, d, w - r, d);
      shape.lineTo(-w + r, d);
      shape.quadraticCurveTo(-w, d, -w, d - r);
      shape.lineTo(-w, -d + r);
      shape.quadraticCurveTo(-w, -d, -w + r, -d);
      shape.lineTo(w - r, -d);
      break;
    }
  }
  return shape;
}

/* ─── Tooth height per type ─── */
const TOOTH_HEIGHTS: Record<ToothType, number> = {
  incisor: 0.30,
  canine: 0.34,
  premolar: 0.26,
  molar: 0.22,
};

function createToothGeometry(type: ToothType, wS: number, hS: number): THREE.BufferGeometry {
  const shape = createToothShape(type, wS);
  const height = TOOTH_HEIGHTS[type] * hS;

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 16,
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 4,
  });

  // Post-process vertices: taper root, add cusps
  const posAttr = geo.attributes.position;
  const maxZ = height; // extrude goes along Z

  for (let i = 0; i < posAttr.count; i++) {
    let x = posAttr.getX(i);
    let y = posAttr.getY(i);
    let z = posAttr.getZ(i);

    const t = z / maxZ; // 0 = root, 1 = crown

    // Taper root: vertices near z=0 shrink inward
    const rootTaper = 0.5 + 0.5 * Math.pow(t, 0.6);
    x *= rootTaper;
    y *= rootTaper;

    // Crown bulge: slight widening at ~70% height
    const bulge = 1.0 + 0.12 * Math.sin(t * Math.PI);
    x *= bulge;
    y *= bulge;

    // Add cusps for premolars and molars at the crown
    if (t > 0.85) {
      const cuspT = (t - 0.85) / 0.15; // 0→1 in cusp zone
      if (type === "molar") {
        // 4 cusps at corners
        const cx = Math.sign(x) * 0.03 * wS;
        const cy = Math.sign(y) * 0.025 * wS;
        const distToCusp = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const cuspBump = Math.exp(-distToCusp * 35) * 0.04 * hS * cuspT;
        z += cuspBump;
      } else if (type === "premolar") {
        // 2 cusps (buccal + lingual)
        const cy = Math.sign(y) * 0.02 * wS;
        const distToCusp = Math.sqrt(x ** 2 + (y - cy) ** 2);
        const cuspBump = Math.exp(-distToCusp * 30) * 0.035 * hS * cuspT;
        z += cuspBump;
      } else if (type === "canine") {
        // Single pointed tip
        const dist = Math.sqrt(x ** 2 + y ** 2);
        const tipBump = Math.exp(-dist * 40) * 0.05 * hS * cuspT;
        z += tipBump;
      } else if (type === "incisor") {
        // Flat chisel edge — slight ridge along the wide axis
        const ridgeBump = Math.exp(-Math.abs(y) * 50) * 0.015 * hS * cuspT;
        z += ridgeBump;
      }
    }

    posAttr.setXYZ(i, x, y, z);
  }

  posAttr.needsUpdate = true;
  geo.computeVertexNormals();

  // Rotate so Z-extrusion becomes Y-up (tooth stands upright)
  geo.rotateX(-Math.PI / 2);

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
