import { useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import * as THREE from "three";

function DentalArch() {
  const { scene } = useGLTF("/dental-arch.glb");
  const groupRef = useRef<THREE.Group>(null);

  /* Apply realistic enamel + gum materials once */
  const clonedScene = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const srcMat = Array.isArray(child.material) ? child.material[0] : child.material;
      const isGum = (srcMat?.name ?? "") === "Material.001";

      if (isGum) {
        child.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color("#d97b83"),
          roughness: 0.70,
          metalness: 0.0,
          clearcoat: 0.05,
          clearcoatRoughness: 0.9,
        });
      } else {
        child.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color("#f2ede3"),
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
  }, [scene]);

  useFrame((_state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.52;
  });

  return (
    <group ref={groupRef} rotation={[0.28, 0, 0]} position={[0, -0.15, 0]}>
      <primitive object={clonedScene} />
    </group>
  );
}

export default function TeethScene() {
  return (
    <Canvas
      camera={{ position: [0, 1.4, 3.8], fov: 32 }}
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

useGLTF.preload("/dental-arch.glb");
