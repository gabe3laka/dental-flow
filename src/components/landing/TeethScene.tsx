import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";

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

/* ─── Tooth types & geometry ─── */
type ToothType = "incisor" | "canine" | "premolar" | "molar";

const TOOTH_TYPES: ToothType[] = [
  "molar", "molar", "molar", "premolar", "premolar", "canine",
  "incisor", "incisor", "incisor", "incisor",
  "canine", "premolar", "premolar", "molar",
];

const TOOTH_SCALES: [number, number][] = [
  [1.1, 0.75], [1.05, 0.72], [1.1, 0.75],
  [0.95, 0.82], [0.90, 0.88],
  [0.80, 1.1],
  [0.75, 0.92], [0.85, 1.0], [0.85, 1.0], [0.75, 0.92],
  [0.80, 1.1],
  [0.90, 0.88], [0.95, 0.82],
  [1.05, 0.72],
];

const TOOTH_HEIGHTS: Record<ToothType, number> = {
  incisor: 0.30,
  canine: 0.34,
  premolar: 0.26,
  molar: 0.22,
};

function createToothShape(type: ToothType, wS: number): THREE.Shape {
  const shape = new THREE.Shape();
  switch (type) {
    case "incisor": {
      const w = 0.065 * wS, d = 0.032 * wS;
      shape.moveTo(w, 0);
      shape.quadraticCurveTo(w, d, 0, d);
      shape.quadraticCurveTo(-w, d, -w, 0);
      shape.quadraticCurveTo(-w, -d, 0, -d);
      shape.quadraticCurveTo(w, -d, w, 0);
      break;
    }
    case "canine": {
      const w = 0.055 * wS, d = 0.04 * wS;
      shape.moveTo(w, 0);
      shape.quadraticCurveTo(w, d * 1.1, 0, d);
      shape.quadraticCurveTo(-w, d * 1.1, -w, 0);
      shape.quadraticCurveTo(-w, -d * 0.9, 0, -d * 0.85);
      shape.quadraticCurveTo(w, -d * 0.9, w, 0);
      break;
    }
    case "premolar": {
      const w = 0.058 * wS, d = 0.048 * wS;
      shape.moveTo(w, 0);
      shape.quadraticCurveTo(w, d, 0, d);
      shape.quadraticCurveTo(-w, d, -w, 0);
      shape.quadraticCurveTo(-w, -d, 0, -d);
      shape.quadraticCurveTo(w, -d, w, 0);
      break;
    }
    case "molar": {
      const w = 0.07 * wS, d = 0.06 * wS, r = 0.015 * wS;
      shape.moveTo(w - r, -d);
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

  const posAttr = geo.attributes.position;
  const maxZ = height;

  for (let i = 0; i < posAttr.count; i++) {
    let x = posAttr.getX(i);
    let y = posAttr.getY(i);
    let z = posAttr.getZ(i);
    const t = z / maxZ;

    const rootTaper = 0.5 + 0.5 * Math.pow(t, 0.6);
    x *= rootTaper;
    y *= rootTaper;

    const bulge = 1.0 + 0.12 * Math.sin(t * Math.PI);
    x *= bulge;
    y *= bulge;

    if (t > 0.85) {
      const cuspT = (t - 0.85) / 0.15;
      if (type === "molar") {
        const cx = Math.sign(x) * 0.03 * wS;
        const cy = Math.sign(y) * 0.025 * wS;
        const distToCusp = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        z += Math.exp(-distToCusp * 35) * 0.04 * hS * cuspT;
      } else if (type === "premolar") {
        const cy = Math.sign(y) * 0.02 * wS;
        const distToCusp = Math.sqrt(x ** 2 + (y - cy) ** 2);
        z += Math.exp(-distToCusp * 30) * 0.035 * hS * cuspT;
      } else if (type === "canine") {
        const dist = Math.sqrt(x ** 2 + y ** 2);
        z += Math.exp(-dist * 40) * 0.05 * hS * cuspT;
      } else if (type === "incisor") {
        z += Math.exp(-Math.abs(y) * 50) * 0.015 * hS * cuspT;
      }
    }

    posAttr.setXYZ(i, x, y, z);
  }

  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/* ─── Teeth Row ─── */
function TeethRow({ flip = false }: { flip?: boolean }) {
  const teeth = useMemo(() => {
    const archPts = archCurvePoints(100);
    let totalLen = 0;
    for (let i = 1; i < archPts.length; i++) totalLen += archPts[i].distanceTo(archPts[i - 1]);

    const positions: { pos: THREE.Vector3; angle: number }[] = [];
    const count = 14;
    for (let i = 0; i < count; i++) {
      const targetDist = ((i + 0.5) / count) * totalLen;
      let acc = 0;
      for (let j = 1; j < archPts.length; j++) {
        const segLen = archPts[j].distanceTo(archPts[j - 1]);
        if (acc + segLen >= targetDist) {
          const frac = (targetDist - acc) / segLen;
          const pos = archPts[j - 1].clone().lerp(archPts[j], frac);
          const dir = archPts[j].clone().sub(archPts[j - 1]).normalize();
          positions.push({ pos, angle: Math.atan2(dir.x, dir.z) });
          break;
        }
        acc += segLen;
      }
    }
    return positions;
  }, []);

  const geometries = useMemo(
    () => TOOTH_TYPES.map((type, i) => {
      const [wS, hS] = TOOTH_SCALES[i] || [1, 1];
      return createToothGeometry(type, wS, hS);
    }),
    []
  );

  return (
    <group>
      {teeth.map(({ pos, angle }, i) => {
        const yOffset = flip ? -0.18 : 0.18;
        return (
          <mesh
            key={i}
            geometry={geometries[i]}
            position={[pos.x, yOffset, pos.z]}
            rotation={[flip ? Math.PI : 0, angle + Math.PI / 2, 0]}
          >
            <meshPhysicalMaterial
              color="#f5f0e8"
              roughness={0.3}
              metalness={0.05}
              clearcoat={0.3}
              clearcoatRoughness={0.4}
              envMapIntensity={0.9}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/* ─── Dental Arch ─── */
function DentalArch() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.52;
  });

  return (
    <group ref={groupRef} rotation={[0.35, 0, 0]} position={[0, -0.3, 0]}>
      <group position={[0, 0.22, 0]}>
        <GumArch />
        <TeethRow />
      </group>
      <group position={[0, -0.22, 0]}>
        <GumArch flip />
        <TeethRow flip />
      </group>
    </group>
  );
}

export default function TeethScene() {
  return (
    <Canvas
      camera={{ position: [0, 1.8, 4.2], fov: 32 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={["transparent"]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 5, 4]} intensity={1.0} color="#fff5e6" />
      <directionalLight position={[-4, 2, -2]} intensity={0.5} color="#6b9aff" />
      <directionalLight position={[0, -1, -4]} intensity={0.3} color="#ffffff" />
      <pointLight position={[0, -3, 2]} intensity={0.25} color="#b8a8f0" />
      <DentalArch />
      <Environment preset="studio" />
    </Canvas>
  );
}
