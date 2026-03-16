import { useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import * as THREE from "three";

function DentalArch() {
  const { scene } = useGLTF("/teeth.glb");
  const groupRef = useRef<THREE.Group>(null);

  /* Clone and apply materials */
  const { clonedScene, scale, offset } = useMemo(() => {
    const cloned = scene.clone(true);

    cloned.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const srcMat = Array.isArray(child.material) ? child.material[0] : child.material;
      const matName = (srcMat?.name ?? "").toLowerCase();
      const meshName = (child.name ?? "").toLowerCase();

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
      } else {
        child.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color("#f5f0e8"),
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

    // Auto-fit bounding box
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const s = maxDim > 0 ? 2.0 / maxDim : 1;

    return { clonedScene: cloned, scale: s, offset: center.multiplyScalar(-s) };
  }, [scene]);

  useFrame((_state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.52;
  });

  return (
    <group ref={groupRef} scale={[scale, scale, scale]} position={[offset.x, offset.y, offset.z]}>
      <primitive object={clonedScene} />
    </group>
  );
}

export default function TeethScene() {
  return (
    <Canvas
      camera={{ position: [0, 0.6, 4.5], fov: 32 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={["transparent"]} />
      <directionalLight position={[3, 6, 4]} intensity={1.1} color="#fff8ee" castShadow />
      <directionalLight position={[-4, 3, -1]} intensity={0.55} color="#c8d8ff" />
      <directionalLight position={[0, -2, 3]} intensity={0.28} color="#ffffff" />
      <ambientLight intensity={0.38} />
      <Environment preset="studio" />
      <Suspense fallback={null}>
        <DentalArch />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload("/teeth.glb");
