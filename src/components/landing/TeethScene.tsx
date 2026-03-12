import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";

/** Generate U-shaped arch curve points (horseshoe) */
function archCurvePoints(segments = 28): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = Math.PI * t;
    const rx = 1.35;
    const rz = 1.1;
    pts.push(new THREE.Vector3(Math.cos(angle) * rx, 0, -Math.sin(angle) * rz));
  }
  return pts;
}

/** Build a gum mesh from an extruded U-shape */
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
    const geo = new THREE.ExtrudeGeometry(shape, {
      steps: 60,
      bevelEnabled: false,
      extrudePath: curve,
    });
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} scale={flip ? [1, -1, 1] : [1, 1, 1]}>
      <meshStandardMaterial color="#c87072" roughness={0.8} metalness={0.02} />
    </mesh>
  );
}

// Tooth type enum
type ToothType = "incisor" | "canine" | "premolar" | "molar";

const TOOTH_TYPES: ToothType[] = [
  "incisor", "incisor", "incisor", "incisor",
  "canine", "canine",
  "premolar", "premolar", "premolar", "premolar",
  "molar", "molar", "molar", "molar",
];

// Scale factors per tooth: [widthScale, heightScale]
const TOOTH_SCALES: [number, number][] = [
  [0.85, 1.0], [0.85, 1.0],   // central incisors
  [0.75, 0.92], [0.75, 0.92], // lateral incisors
  [0.80, 1.1], [0.80, 1.1],   // canines
  [0.90, 0.88], [0.90, 0.88], // premolars
  [0.95, 0.82], [0.95, 0.82], // premolars
  [1.1, 0.75], [1.1, 0.75],   // molars
  [1.05, 0.72], [1.05, 0.72], // molars
];

/** Create a LatheGeometry profile for each tooth type */
function createToothGeometry(type: ToothType, wScale: number, hScale: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];

  switch (type) {
    case "incisor": {
      // Chisel-shaped: narrow root, wider flat crown
      pts.push(new THREE.Vector2(0, 0));
      pts.push(new THREE.Vector2(0.04 * wScale, 0.02 * hScale));
      pts.push(new THREE.Vector2(0.055 * wScale, 0.06 * hScale));
      pts.push(new THREE.Vector2(0.06 * wScale, 0.12 * hScale));
      pts.push(new THREE.Vector2(0.065 * wScale, 0.18 * hScale));
      pts.push(new THREE.Vector2(0.07 * wScale, 0.22 * hScale));
      pts.push(new THREE.Vector2(0.065 * wScale, 0.26 * hScale));
      pts.push(new THREE.Vector2(0.055 * wScale, 0.28 * hScale));
      pts.push(new THREE.Vector2(0.03 * wScale, 0.29 * hScale));
      pts.push(new THREE.Vector2(0, 0.295 * hScale));
      break;
    }
    case "canine": {
      // Pointed conical shape
      pts.push(new THREE.Vector2(0, 0));
      pts.push(new THREE.Vector2(0.04 * wScale, 0.02 * hScale));
      pts.push(new THREE.Vector2(0.06 * wScale, 0.06 * hScale));
      pts.push(new THREE.Vector2(0.07 * wScale, 0.12 * hScale));
      pts.push(new THREE.Vector2(0.072 * wScale, 0.18 * hScale));
      pts.push(new THREE.Vector2(0.065 * wScale, 0.22 * hScale));
      pts.push(new THREE.Vector2(0.05 * wScale, 0.27 * hScale));
      pts.push(new THREE.Vector2(0.03 * wScale, 0.30 * hScale));
      pts.push(new THREE.Vector2(0.012 * wScale, 0.32 * hScale));
      pts.push(new THREE.Vector2(0, 0.33 * hScale));
      break;
    }
    case "premolar": {
      // Wider, rounded crown with slight bumps
      pts.push(new THREE.Vector2(0, 0));
      pts.push(new THREE.Vector2(0.05 * wScale, 0.02 * hScale));
      pts.push(new THREE.Vector2(0.07 * wScale, 0.06 * hScale));
      pts.push(new THREE.Vector2(0.08 * wScale, 0.10 * hScale));
      pts.push(new THREE.Vector2(0.085 * wScale, 0.15 * hScale));
      pts.push(new THREE.Vector2(0.082 * wScale, 0.19 * hScale));
      pts.push(new THREE.Vector2(0.075 * wScale, 0.22 * hScale));
      pts.push(new THREE.Vector2(0.065 * wScale, 0.235 * hScale));
      pts.push(new THREE.Vector2(0.04 * wScale, 0.245 * hScale));
      pts.push(new THREE.Vector2(0, 0.25 * hScale));
      break;
    }
    case "molar": {
      // Broad, flat crown
      pts.push(new THREE.Vector2(0, 0));
      pts.push(new THREE.Vector2(0.06 * wScale, 0.02 * hScale));
      pts.push(new THREE.Vector2(0.08 * wScale, 0.05 * hScale));
      pts.push(new THREE.Vector2(0.095 * wScale, 0.09 * hScale));
      pts.push(new THREE.Vector2(0.10 * wScale, 0.13 * hScale));
      pts.push(new THREE.Vector2(0.098 * wScale, 0.16 * hScale));
      pts.push(new THREE.Vector2(0.092 * wScale, 0.18 * hScale));
      pts.push(new THREE.Vector2(0.085 * wScale, 0.195 * hScale));
      pts.push(new THREE.Vector2(0.06 * wScale, 0.205 * hScale));
      pts.push(new THREE.Vector2(0, 0.21 * hScale));
      break;
    }
  }

  const geo = new THREE.LatheGeometry(pts, 16);
  geo.computeVertexNormals();
  return geo;
}

function TeethRow({ flip = false }: { flip?: boolean }) {
  const teeth = useMemo(() => {
    const archPts = archCurvePoints(100);
    const totalLen = archPts.reduce((acc, p, i) => {
      if (i === 0) return 0;
      return acc + p.distanceTo(archPts[i - 1]);
    }, 0);

    const positions: { pos: THREE.Vector3; angle: number }[] = [];
    const count = 14;
    for (let i = 0; i < count; i++) {
      const targetDist = ((i + 0.5) / count) * totalLen;
      let accumulated = 0;
      for (let j = 1; j < archPts.length; j++) {
        const segLen = archPts[j].distanceTo(archPts[j - 1]);
        if (accumulated + segLen >= targetDist) {
          const frac = (targetDist - accumulated) / segLen;
          const pos = archPts[j - 1].clone().lerp(archPts[j], frac);
          const dir = archPts[j].clone().sub(archPts[j - 1]).normalize();
          const angle = Math.atan2(dir.x, dir.z);
          positions.push({ pos, angle });
          break;
        }
        accumulated += segLen;
      }
    }
    return positions;
  }, []);

  const geometries = useMemo(() => {
    return TOOTH_TYPES.map((type, i) => {
      const [wS, hS] = TOOTH_SCALES[i] || [1, 1];
      return createToothGeometry(type, wS, hS);
    });
  }, []);

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
            <meshStandardMaterial
              color="#f5f0e8"
              roughness={0.35}
              metalness={0.08}
              envMapIntensity={0.8}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function DentalArch() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.52;
    }
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
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 4]} intensity={1.0} color="#ffffff" />
      <directionalLight position={[-4, 2, -2]} intensity={0.6} color="#6b9aff" />
      <pointLight position={[0, -3, 2]} intensity={0.3} color="#b8a8f0" />
      <DentalArch />
      <Environment preset="studio" />
    </Canvas>
  );
}
