import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { Loader2 } from "lucide-react";

export interface MouthPanoramaProps {
  zoneSignedUrls: Record<string, string>;
  className?: string;
}

interface ZoneConfig {
  id: string;
  azDeg: number;
  elDeg: number;
  w: number;
  h: number;
}

const SPHERE_R = 5;

const ZONE_CONFIGS: ZoneConfig[] = [
  { id: "FRONT_SMILE",  azDeg:   0, elDeg:   0, w: 5.0, h: 3.75 },
  { id: "UPPER_ARCH",   azDeg:   0, elDeg:  55, w: 5.5, h: 3.50 },
  { id: "LOWER_ARCH",   azDeg:   0, elDeg: -55, w: 5.5, h: 3.50 },
  { id: "LEFT_BITE",    azDeg: -60, elDeg:   0, w: 5.0, h: 3.75 },
  { id: "RIGHT_BITE",   azDeg:  60, elDeg:   0, w: 5.0, h: 3.75 },
  { id: "UPPER_CLOSE",  azDeg:   0, elDeg:  20, w: 4.5, h: 3.40 },
  { id: "LOWER_CLOSE",  azDeg:   0, elDeg: -20, w: 4.5, h: 3.40 },
];

function zoneTransform(azDeg: number, elDeg: number, R: number) {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  const x = R * Math.sin(az) * Math.cos(el);
  const y = R * Math.sin(el);
  const z = R * Math.cos(az) * Math.cos(el);
  const dummy = new THREE.Object3D();
  dummy.position.set(x, y, z);
  dummy.lookAt(0, 0, 0);
  dummy.rotateY(Math.PI);
  return {
    position: [x, y, z] as [number, number, number],
    rotation: [dummy.rotation.x, dummy.rotation.y, dummy.rotation.z] as [number, number, number],
  };
}

function BackgroundSphere() {
  return (
    <mesh>
      <sphereGeometry args={[6, 32, 32]} />
      <meshBasicMaterial color="#060a14" side={THREE.BackSide} />
    </mesh>
  );
}

function TexturedZone({
  url,
  position,
  rotation,
  w,
  h,
}: {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  w: number;
  h: number;
}) {
  const texture = useTexture(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={texture} side={THREE.FrontSide} toneMapped={false} />
    </mesh>
  );
}

function ZonePlane({ cfg, url }: { cfg: ZoneConfig; url: string | undefined }) {
  const { position, rotation } = useMemo(
    () => zoneTransform(cfg.azDeg, cfg.elDeg, SPHERE_R),
    [cfg.azDeg, cfg.elDeg]
  );

  const placeholder = (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[cfg.w, cfg.h]} />
      <meshBasicMaterial color="#0d1520" side={THREE.FrontSide} />
    </mesh>
  );

  if (!url) return placeholder;

  return (
    <Suspense fallback={placeholder}>
      <TexturedZone url={url} position={position} rotation={rotation} w={cfg.w} h={cfg.h} />
    </Suspense>
  );
}

function HintOverlay() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none z-10 transition-opacity duration-700"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <span className="font-mono text-white/50 text-[10px] tracking-widest">
        DRAG TO LOOK AROUND
      </span>
    </div>
  );
}

function PanoramaLoader() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#060a14]">
      <Loader2 className="w-5 h-5 text-primary animate-spin" />
    </div>
  );
}

export function MouthPanorama({ zoneSignedUrls, className }: MouthPanoramaProps) {
  return (
    <div
      className={`relative w-full overflow-hidden bg-[#060a14] ${className ?? ""}`}
      style={{ height: 320 }}
    >
      <Suspense fallback={<PanoramaLoader />}>
        <Canvas
          camera={{ position: [0, 0, 0], fov: 75, near: 0.1, far: 20 }}
          gl={{ antialias: true, alpha: false }}
          style={{ width: "100%", height: "100%" }}
        >
          <BackgroundSphere />
          <ambientLight intensity={0.05} />
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={-0.4}
            minPolarAngle={Math.PI / 2 - (70 * Math.PI) / 180}
            maxPolarAngle={Math.PI / 2 + (70 * Math.PI) / 180}
            makeDefault
          />
          {ZONE_CONFIGS.map((cfg) => (
            <ZonePlane
              key={cfg.id}
              cfg={cfg}
              url={zoneSignedUrls[cfg.id] ?? zoneSignedUrls[cfg.id.toLowerCase()]}
            />
          ))}
        </Canvas>
      </Suspense>
      <HintOverlay />
    </div>
  );
}
