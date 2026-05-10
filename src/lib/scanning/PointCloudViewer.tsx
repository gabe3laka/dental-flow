import { Suspense, useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls, useProgress, Html } from "@react-three/drei";
import { PLYLoader } from "three-stdlib";
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
 * - Resolves URL via `three-stdlib`'s `PLYLoader` (typed; no examples/jsm import).
 * - Recenters to bounding-sphere origin and dollies the camera to fit.
 * - Falls back to a neutral tint when the PLY lacks vertex colors.
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
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: 12,
        overflow: "hidden",
        ...style,
      }}
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
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {overlay}
        </div>
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
  const { camera } = useThree();

  // Recenter once on the bounding sphere so the cloud is at the origin and
  // pick a sensible point size from the point count.
  const { recenteredGeometry, autoSize, radius } = useMemo(() => {
    const g = geometry.clone();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const sphere = g.boundingSphere;
    if (sphere) {
      g.translate(-sphere.center.x, -sphere.center.y, -sphere.center.z);
      g.computeBoundingSphere();
    }
    const count = g.getAttribute("position")?.count ?? 100_000;
    // Targets ~1px on a 720p canvas; biased larger for sparse clouds.
    const auto = Math.max(0.0008, Math.min(0.006, 1.2 / Math.sqrt(count)));
    const r = g.boundingSphere?.radius ?? 1;
    return { recenteredGeometry: g, autoSize: auto, radius: r };
  }, [geometry]);

  // Auto-frame: dolly the active camera so the cloud's bounding sphere fits
  // the viewport. Runs whenever a new PLY is loaded.
  useEffect(() => {
    if (!radius || !Number.isFinite(radius)) return;
    const r = Math.max(radius, 0.05);
    camera.position.set(r * 0.9, r * 0.3, r * 1.4);
    camera.near = Math.max(0.001, r * 0.01);
    camera.far = r * 100;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [radius, camera]);

  const hasVertexColors = !!recenteredGeometry.getAttribute("color");

  return (
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
  );
}
