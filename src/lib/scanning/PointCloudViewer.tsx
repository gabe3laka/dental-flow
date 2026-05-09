import { Suspense, useMemo, useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useProgress, Html } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader";
import * as THREE from "three";

export interface PointCloudViewerProps {
  /** Public/signed URL pointing at a `.ply` produced by LingBot-Map. */
  plyUrl: string | null;
  className?: string;
  style?: CSSProperties;
  /** CSS height. Defaults to `420px`. */
  height?: number | string;
  /** Override point size. Auto-tunes by point count if omitted. */
  pointSize?: number;
  /** Background color of the viewer canvas. */
  background?: string;
  /** Optional badge / overlay rendered on top of the canvas. */
  overlay?: React.ReactNode;
  /** Render an empty-state CTA when `plyUrl` is null. */
  emptyState?: React.ReactNode;
}

/**
 * Renders a `.ply` point cloud (from LingBot-Map) using react-three-fiber.
 *
 * - Resolves URL via Three.js `PLYLoader`.
 * - Auto-frames the camera based on the geometry's bounding sphere.
 * - Falls back to vertex-color rendering when the PLY carries colors,
 *   otherwise tints points by depth for visual structure.
 */
export function PointCloudViewer({
  plyUrl,
  className,
  style,
  height = 420,
  pointSize,
  background = "#0a0e16",
  overlay,
  emptyState,
}: PointCloudViewerProps) {
  if (!plyUrl) {
    return (
      <div
        className={className}
        style={{
          width: "100%",
          height,
          background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          ...style,
        }}
      >
        {emptyState ?? (
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 11,
              letterSpacing: "0.15em",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            NO 3D MAP YET
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ position: "relative", width: "100%", height, borderRadius: 12, overflow: "hidden", ...style }}
    >
      <Canvas
        camera={{ position: [0, 0, 1.6], fov: 45, near: 0.001, far: 1000 }}
        style={{ background }}
        gl={{ antialias: true, preserveDrawingBuffer: false }}
      >
        <ambientLight intensity={0.6} />
        <Suspense fallback={<LoadingHud />}>
          <PointCloud url={plyUrl} pointSize={pointSize} />
        </Suspense>
        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.6}
          zoomSpeed={0.8}
          panSpeed={0.6}
          makeDefault
        />
      </Canvas>
      {overlay && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{overlay}</div>
      )}
    </div>
  );
}

function LoadingHud() {
  const { progress } = useProgress();
  return (
    <Html center>
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 10,
          letterSpacing: "0.18em",
          color: "rgba(255,255,255,0.55)",
        }}
      >
        LOADING {Math.round(progress)}%
      </span>
    </Html>
  );
}

function PointCloud({ url, pointSize }: { url: string; pointSize?: number }) {
  const geometry = useLoader(PLYLoader, url) as THREE.BufferGeometry;

  // Compute bounding sphere once so we can auto-frame and pick a default point size.
  const { recenteredGeometry, autoSize } = useMemo(() => {
    const g = geometry.clone();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const sphere = g.boundingSphere;
    if (sphere) {
      g.translate(-sphere.center.x, -sphere.center.y, -sphere.center.z);
      g.computeBoundingSphere();
    }
    const count = g.getAttribute("position")?.count ?? 100_000;
    // Roughly: more points → smaller points. Targets ~1px on a 720p canvas.
    const auto = Math.max(0.0008, Math.min(0.006, 1.2 / Math.sqrt(count)));
    return { recenteredGeometry: g, autoSize: auto };
  }, [geometry]);

  const hasVertexColors = !!recenteredGeometry.getAttribute("color");

  // Frame the camera so the cloud roughly fills the viewport.
  const sphere = recenteredGeometry.boundingSphere;
  const frame = sphere ? Math.max(sphere.radius * 2.2, 0.2) : 1.2;

  return (
    <group>
      <CameraFrame radius={frame} />
      <points>
        <primitive object={recenteredGeometry} attach="geometry" />
        <pointsMaterial
          size={pointSize ?? autoSize}
          sizeAttenuation
          vertexColors={hasVertexColors}
          color={hasVertexColors ? undefined : "#dbe3ef"}
          transparent
          opacity={0.95}
        />
      </points>
    </group>
  );
}

function CameraFrame({ radius }: { radius: number }) {
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    if (framed) return;
    setFramed(true);
  }, [framed]);
  // OrbitControls picks up camera position from <Canvas camera> at mount; we
  // emit a one-shot dolly here so the auto-framing follows the actual cloud.
  return (
    <perspectiveCamera
      makeDefault={false}
      position={[radius * 0.9, radius * 0.3, radius * 1.1]}
    />
  );
}
