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

export interface ToothDetection {
  type: "plaque" | "tartar" | "recession" | "cavity" | "inflammation" | "crowding" | "spacing" | "appliance_fit";
  surface?: "buccal" | "lingual" | "occlusal" | "mesial" | "distal";
  severity?: "mild" | "moderate" | "severe";
}

/* ─── FDI tooth ID assignment order ─── */
// Upper arch: right molars → right incisors → left incisors → left molars
const UPPER_FDI_ORDER = [
  "T18","T17","T16","T15","T14","T13","T12","T11",
  "T21","T22","T23","T24","T25","T26","T27","T28",
];
// Lower arch: right molars → right incisors → left incisors → left molars
const LOWER_FDI_ORDER = [
  "T48","T47","T46","T45","T44","T43","T42","T41",
  "T31","T32","T33","T34","T35","T36","T37","T38",
];

interface ToothCenter {
  id: string;
  center: THREE.Vector3;
}

/**
 * Given a list of tooth mesh centers and a hit point, find the nearest tooth.
 */
function findNearestTooth(centers: ToothCenter[], point: THREE.Vector3): string | null {
  let bestId: string | null = null;
  let bestDist = Infinity;
  for (const tc of centers) {
    const d = tc.center.distanceTo(point);
    if (d < bestDist) { bestDist = d; bestId = tc.id; }
  }
  return bestId;
}

/**
 * Split a merged jaw mesh into individual tooth meshes via connected-component
 * analysis on the index buffer. Each disconnected island of triangles → one mesh.
 */
function splitMergedMesh(mesh: THREE.Mesh): THREE.Mesh[] {
  const geo = mesh.geometry;
  const posAttr = geo.attributes.position;
  const indexAttr = geo.index;
  if (!indexAttr || !posAttr) return [mesh];

  const vertCount = posAttr.count;
  const indexCount = indexAttr.count;

  // Build adjacency list
  const adj: number[][] = Array.from({ length: vertCount }, () => []);
  for (let i = 0; i < indexCount; i += 3) {
    const a = indexAttr.getX(i), b = indexAttr.getX(i + 1), c = indexAttr.getX(i + 2);
    adj[a].push(b, c);
    adj[b].push(a, c);
    adj[c].push(a, b);
  }

  // Flood-fill connected components
  const visited = new Uint8Array(vertCount);
  const components: number[][] = [];
  for (let start = 0; start < vertCount; start++) {
    if (visited[start]) continue;
    const stack = [start];
    const verts: number[] = [];
    visited[start] = 1;
    while (stack.length) {
      const v = stack.pop()!;
      verts.push(v);
      for (const nb of adj[v]) {
        if (!visited[nb]) { visited[nb] = 1; stack.push(nb); }
      }
    }
    components.push(verts);
  }

  if (components.length <= 1) return [mesh];

  // Map old vertex index → component index (for fast face bucketing)
  const vertToComp = new Int32Array(vertCount).fill(-1);
  components.forEach((verts, ci) => { for (const v of verts) vertToComp[v] = ci; });

  // Pre-bucket faces by component
  const compFaces: number[][] = components.map(() => []);
  for (let i = 0; i < indexCount; i += 3) {
    const a = indexAttr.getX(i);
    compFaces[vertToComp[a]].push(indexAttr.getX(i), indexAttr.getX(i + 1), indexAttr.getX(i + 2));
  }

  const normAttr = geo.attributes.normal;
  const uvAttr   = geo.attributes.uv;

  return components.map((verts, ci) => {
    const oldToNew = new Map<number, number>();
    verts.forEach((v, i) => oldToNew.set(v, i));

    const positions = new Float32Array(verts.length * 3);
    verts.forEach((v, i) => {
      positions[i * 3]     = posAttr.getX(v);
      positions[i * 3 + 1] = posAttr.getY(v);
      positions[i * 3 + 2] = posAttr.getZ(v);
    });

    const rawFaces = compFaces[ci];
    const faces = new Uint32Array(rawFaces.length);
    for (let j = 0; j < rawFaces.length; j++) faces[j] = oldToNew.get(rawFaces[j])!;

    const splitGeo = new THREE.BufferGeometry();
    splitGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    splitGeo.setIndex(new THREE.BufferAttribute(faces, 1));

    if (normAttr) {
      const normals = new Float32Array(verts.length * 3);
      verts.forEach((v, i) => {
        normals[i * 3]     = normAttr.getX(v);
        normals[i * 3 + 1] = normAttr.getY(v);
        normals[i * 3 + 2] = normAttr.getZ(v);
      });
      splitGeo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    } else {
      splitGeo.computeVertexNormals();
    }

    if (uvAttr) {
      const uvs = new Float32Array(verts.length * 2);
      verts.forEach((v, i) => {
        uvs[i * 2]     = uvAttr.getX(v);
        uvs[i * 2 + 1] = uvAttr.getY(v);
      });
      splitGeo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    }

    const sm = new THREE.Mesh(splitGeo);
    sm.castShadow = true;
    sm.userData = { isTooth: true };
    return sm;
  });
}
export type RenderMode = "3d" | "2d";

export interface TeethVisualizationProps {
  toothData?: Record<string, ToothStatus>;
  detectionData?: Record<string, ToothDetection[]>;
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

/* ─── Detection material configs ─── */
const DETECTION_MATERIALS: Record<string, { color: string; opacity: number; roughness: number; metalness: number }> = {
  plaque:        { color: "#e8d44d", opacity: 0.45, roughness: 0.75, metalness: 0.0 },
  tartar:        { color: "#c4a43a", opacity: 0.55, roughness: 0.85, metalness: 0.05 },
  cavity:        { color: "#4a3728", opacity: 0.6,  roughness: 0.9,  metalness: 0.0 },
  recession:     { color: "#d4878a", opacity: 0.35, roughness: 0.6,  metalness: 0.0 },
  inflammation:  { color: "#c0392b", opacity: 0.4,  roughness: 0.5,  metalness: 0.0 },
  crowding:      { color: "#8b5cf6", opacity: 0.3,  roughness: 0.4,  metalness: 0.0 },
  spacing:       { color: "#3b82f6", opacity: 0.3,  roughness: 0.4,  metalness: 0.0 },
  appliance_fit: { color: "#f97316", opacity: 0.35, roughness: 0.5,  metalness: 0.0 },
};

/* ─── The loaded GLB model ─── */
function DentalModel({
  toothData,
  detectionData,
  selectedTooth,
  onHover,
  onClick,
}: {
  toothData: Record<string, ToothStatus>;
  detectionData?: Record<string, ToothDetection[]>;
  selectedTooth: string | null;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}) {
  const { scene } = useGLTF("/teeth.glb");
  const groupRef = useRef<THREE.Group>(null);
  const toothCentersRef = useRef<ToothCenter[]>([]);
  const hoveredMeshRef = useRef<THREE.Mesh | null>(null);
  const meshByIdRef = useRef<Map<string, THREE.Mesh>>(new Map());

  const overallStatus = useMemo(() => resolveOverallStatus(toothData), [toothData]);
  const emissive = STATUS_EMISSIVE[overallStatus];

  const makeEnamelMat = useCallback(() =>
    new THREE.MeshPhysicalMaterial({
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
    }), [emissive]);

  /* Clone, split merged jaws, assign FDI IDs */
  const clonedScene = useMemo(() => {
    const cloned = scene.clone(true);
    meshByIdRef.current.clear();

    // First pass: collect without mutating
    const gumList: THREE.Mesh[] = [];
    const toothList: THREE.Mesh[] = [];
    cloned.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const srcMat = Array.isArray(child.material) ? child.material[0] : child.material;
      const matName = (srcMat?.name ?? "").toLowerCase();
      const meshName = (child.name ?? "").toLowerCase();
      const isGumName = matName.includes("gum") || matName.includes("gingiva") ||
                        matName.includes("material.001") || meshName.includes("gum") ||
                        meshName.includes("gingiva");
      // Tongue is non-interactive — treat same as gum (silent raycast)
      const isTongue = matName.includes("tongue") || meshName.includes("tongue");
      let isGumColor = false;
      if (srcMat && "color" in srcMat) {
        const c = (srcMat as THREE.MeshStandardMaterial).color;
        if (c && c.r > 0.6 && c.g < 0.4 && c.b < 0.5) isGumColor = true;
      }
      if (isGumName || isGumColor || isTongue) gumList.push(child);
      else toothList.push(child);
    });

    // Apply gum material
    gumList.forEach((m) => {
      m.material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#d4878a"),
        roughness: 0.72,
        metalness: 0.0,
        clearcoat: 0.05,
        clearcoatRoughness: 0.9,
        transmission: 0.05,
        thickness: 0.5,
      });
      m.userData.isGum = true;
      m.raycast = () => {};
    });

    // Split merged tooth meshes → individual tooth meshes
    const allTeeth: { mesh: THREE.Mesh; center: THREE.Vector3 }[] = [];
    toothList.forEach((orig) => {
      const splits = splitMergedMesh(orig);
      if (splits.length > 1 && orig.parent) {
        const parentRef = orig.parent;
        parentRef.remove(orig);
        splits.forEach((sm) => {
          // Skip micro-fragments — real teeth always have many vertices
          if (sm.geometry.attributes.position.count < 40) return;
          sm.material = makeEnamelMat();
          sm.userData.isTooth = true;
          parentRef.add(sm);
          sm.updateWorldMatrix(true, false);
          const box = new THREE.Box3().setFromObject(sm);
          const c = new THREE.Vector3();
          box.getCenter(c);
          allTeeth.push({ mesh: sm, center: c });
        });
      } else {
        orig.material = makeEnamelMat();
        orig.userData.isTooth = true;
        orig.castShadow = true;
        orig.updateWorldMatrix(true, false);
        const box = new THREE.Box3().setFromObject(orig);
        const c = new THREE.Vector3();
        box.getCenter(c);
        allTeeth.push({ mesh: orig, center: c });
      }
    });

    // Assign FDI IDs by sorted position
    if (allTeeth.length >= 4) {
      const ys = allTeeth.map((t) => t.center.y);
      const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
      // Ascending X: patient's right (−X) → center → patient's left (+X)
      // Maps T18→T11→T21→T28 correctly for standard front-facing model
      const upper = allTeeth.filter((t) => t.center.y >= midY)
        .sort((a, b) => a.center.x - b.center.x);
      const lower = allTeeth.filter((t) => t.center.y < midY)
        .sort((a, b) => a.center.x - b.center.x);

      const assignIds = (
        arr: typeof allTeeth,
        order: string[]
      ) => {
        if (arr.length === 0) return;
        // Trim from the outside in (skip wisdom/molar ends first) so that
        // the central incisors and canines always land at the correct positions
        // even when the model has fewer than 16 teeth per arch (e.g. no wisdom teeth)
        const skip = Math.max(0, order.length - arr.length);
        const skipStart = Math.floor(skip / 2);
        const skipEnd   = skip - skipStart;
        const trimmed   = order.slice(skipStart, order.length - skipEnd || undefined);
        arr.forEach((item, i) => {
          const id = trimmed[Math.min(i, trimmed.length - 1)];
          item.mesh.userData.toothId = id;
          meshByIdRef.current.set(id, item.mesh);
        });
      };
      assignIds(upper, UPPER_FDI_ORDER);
      assignIds(lower, LOWER_FDI_ORDER);
    }

    // Build centers ref for nearest-point fallback
    toothCentersRef.current = allTeeth
      .filter((t) => t.mesh.userData.toothId)
      .map((t) => ({ id: t.mesh.userData.toothId as string, center: t.center.clone() }));

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

  /* Apply detection overlays */
  const overlayGroupRef = useRef<THREE.Group>(new THREE.Group());

  useEffect(() => {
    // Clear previous overlays
    const group = overlayGroupRef.current;
    while (group.children.length) group.remove(group.children[0]);

    if (!detectionData || Object.keys(detectionData).length === 0) return;

    meshByIdRef.current.forEach((mesh, id) => {
      const detections = detectionData[id];
      if (!detections || detections.length === 0) return;

      // Find the primary (most severe) detection for base tooth tinting
      const severityOrder = { severe: 3, moderate: 2, mild: 1 };
      const sorted = [...detections].sort((a, b) =>
        (severityOrder[b.severity || "mild"] || 0) - (severityOrder[a.severity || "mild"] || 0)
      );
      const primary = sorted[0];
      const matCfg = DETECTION_MATERIALS[primary.type];

      if (matCfg) {
        // Tint the base tooth material
        const baseMat = mesh.material as THREE.MeshPhysicalMaterial;
        if (baseMat) {
          const tintColor = new THREE.Color(matCfg.color);
          const enamelColor = new THREE.Color("#f5f0e8");
          const blendFactor = primary.severity === "severe" ? 0.35 : primary.severity === "moderate" ? 0.22 : 0.12;
          baseMat.color.copy(enamelColor).lerp(tintColor, blendFactor);
          baseMat.roughness = 0.18 + (matCfg.roughness - 0.18) * blendFactor * 2;
        }

        // Create overlay mesh for deposit-type detections (plaque, tartar, cavity)
        if (["plaque", "tartar", "cavity"].includes(primary.type)) {
          const overlayGeo = mesh.geometry.clone();
          const overlayMat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(matCfg.color),
            transparent: true,
            opacity: matCfg.opacity * (primary.severity === "severe" ? 1.2 : primary.severity === "moderate" ? 1.0 : 0.7),
            roughness: matCfg.roughness,
            metalness: matCfg.metalness,
            depthWrite: false,
            side: THREE.FrontSide,
          });
          const overlayMesh = new THREE.Mesh(overlayGeo, overlayMat);
          // Copy world transform from original tooth
          mesh.updateWorldMatrix(true, false);
          overlayMesh.applyMatrix4(mesh.matrixWorld);
          // Scale slightly outward for layered effect
          overlayMesh.scale.multiplyScalar(1.003);
          overlayMesh.userData.isOverlay = true;
          overlayMesh.raycast = () => {};
          group.add(overlayMesh);
        }
      }
    });
  }, [detectionData, clonedScene]);

  /* Update base emissive when toothData / overallStatus changes */
  useEffect(() => {
    clonedScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || child.userData.isGum) return;
      const mat = child.material as THREE.MeshPhysicalMaterial;
      if (!mat) return;
      mat.emissive.set(emissive.color);
      mat.emissiveIntensity = emissive.intensity;
    });
  }, [clonedScene, emissive]);

  /* Apply selection highlight */
  useEffect(() => {
    meshByIdRef.current.forEach((mesh, id) => {
      const mat = mesh.material as THREE.MeshPhysicalMaterial;
      if (!mat) return;
      if (id === selectedTooth) {
        mat.emissive.set(SELECTED_EMISSIVE.color);
        mat.emissiveIntensity = SELECTED_EMISSIVE.intensity;
      } else {
        mat.emissive.set(emissive.color);
        mat.emissiveIntensity = emissive.intensity;
      }
    });
  }, [selectedTooth, emissive]);

  /* Pointer handlers — directly mutate hovered mesh material */
  const handleOver = useCallback((e: any) => {
    e.stopPropagation?.();
    if (e.object?.userData?.isGum) return;

    // Restore previous hovered mesh
    if (hoveredMeshRef.current && hoveredMeshRef.current !== e.object) {
      const prev = hoveredMeshRef.current;
      const mat = prev.material as THREE.MeshPhysicalMaterial;
      if (mat) {
        const prevId: string = prev.userData.toothId;
        if (prevId === selectedTooth) {
          mat.emissive.set(SELECTED_EMISSIVE.color);
          mat.emissiveIntensity = SELECTED_EMISSIVE.intensity;
        } else {
          mat.emissive.set(emissive.color);
          mat.emissiveIntensity = emissive.intensity;
        }
      }
    }

    // Highlight new hovered mesh in light blue
    hoveredMeshRef.current = e.object;
    const mat = e.object?.material as THREE.MeshPhysicalMaterial;
    if (mat && e.object?.userData?.toothId !== selectedTooth) {
      mat.emissive.set("#60a5fa");
      mat.emissiveIntensity = 0.4;
    }

    const toothId: string | null =
      e.object?.userData?.toothId ??
      findNearestTooth(toothCentersRef.current, e.point);
    onHover(toothId);
    document.body.style.cursor = "pointer";
  }, [onHover, emissive, selectedTooth]);

  const handleOut = useCallback((e: any) => {
    if (e.object?.userData?.isGum) return;
    if (hoveredMeshRef.current) {
      const mat = hoveredMeshRef.current.material as THREE.MeshPhysicalMaterial;
      const id: string = hoveredMeshRef.current.userData.toothId;
      if (mat) {
        if (id === selectedTooth) {
          mat.emissive.set(SELECTED_EMISSIVE.color);
          mat.emissiveIntensity = SELECTED_EMISSIVE.intensity;
        } else {
          mat.emissive.set(emissive.color);
          mat.emissiveIntensity = emissive.intensity;
        }
      }
      hoveredMeshRef.current = null;
    }
    onHover(null);
    document.body.style.cursor = "auto";
  }, [onHover, emissive, selectedTooth]);

  const handleClick = useCallback((e: any) => {
    e.stopPropagation?.();
    if (e.object?.userData?.isGum) return;
    const toothId: string | null =
      e.object?.userData?.toothId ??
      findNearestTooth(toothCentersRef.current, e.point);
    if (toothId) onClick(toothId);
  }, [onClick]);

  return (
    <group ref={groupRef} scale={[scale, scale, scale]} position={[offset.x, offset.y, offset.z]}>
      <primitive
        object={clonedScene}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
      />
      <primitive object={overlayGroupRef.current} />
    </group>
  );
}

/* ─── Full 3D scene ─── */
function Scene({
  viewMode,
  toothData,
  detectionData,
  selectedTooth,
  onHover,
  onClick,
  controlsRef,
  resetTrigger,
}: {
  viewMode: ViewMode;
  toothData: Record<string, ToothStatus>;
  detectionData?: Record<string, ToothDetection[]>;
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
      <DentalModel toothData={toothData} detectionData={detectionData} selectedTooth={selectedTooth} onHover={onHover} onClick={onClick} />
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

  const dataCount = Object.values(toothData).filter((s) => s !== "no_data").length;

  const renderTooth = (def: ToothDef) => {
    const status: ToothStatus = (toothData[def.id] ?? "no_data") as ToothStatus;
    const color = STATUS_COLORS_2D[status];
    const isNoData = status === "no_data";
    const isHovered = hovered === def.id;
    const isSelected = selected === def.id;
    const toothNum = def.id.replace("T", "");
    const isUpper = def.cy < 150;
    // Tooltip above upper teeth, below lower — with edge clamping
    const ttY = isUpper ? def.cy - 26 : def.cy + 14;
    const ttX = Math.max(34, Math.min(def.cx, 226));

    return (
      <g
        key={def.id}
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setHovered(def.id)}
        onMouseLeave={() => setHovered(null)}
        onClick={() => handleClick(def.id)}
      >
        {/* Selection glow */}
        {isSelected && (
          <ellipse
            cx={def.cx} cy={def.cy}
            rx={def.rx + 5} ry={def.ry + 5}
            fill="rgba(79,124,255,0.18)"
            stroke="#4f7cff" strokeWidth={1.5}
          />
        )}

        {/* Hover ring */}
        {isHovered && !isSelected && (
          <ellipse
            cx={def.cx} cy={def.cy}
            rx={def.rx + 3} ry={def.ry + 3}
            fill="rgba(255,255,255,0.07)"
            stroke="rgba(255,255,255,0.35)" strokeWidth={0.8}
          />
        )}

        {/* Tooth body — cream enamel */}
        <ellipse
          cx={def.cx} cy={def.cy}
          rx={def.rx} ry={def.ry}
          fill="rgba(248,244,236,0.90)"
          stroke="rgba(255,255,255,0.28)" strokeWidth={0.5}
        />

        {/* Status color overlay */}
        {!isNoData && (
          <ellipse
            cx={def.cx} cy={def.cy}
            rx={def.rx - 0.8} ry={def.ry - 0.8}
            fill={color}
            opacity={isHovered || isSelected ? 0.65 : 0.42}
          />
        )}

        {/* Tooth number */}
        <text
          x={def.cx} y={def.cy + 1.8}
          textAnchor="middle"
          fill={isNoData ? "rgba(110,110,130,0.75)" : "rgba(255,255,255,0.95)"}
          fontSize={def.rx >= 8 ? "4.5" : "4"}
          fontFamily="'Courier New', monospace"
          fontWeight="700"
          style={{ pointerEvents: "none", userSelect: "none" } as React.CSSProperties}
        >
          {toothNum}
        </text>

        {/* Hover tooltip */}
        {isHovered && (
          <g>
            <rect
              x={ttX - 34} y={ttY}
              width={68} height={15}
              rx={4}
              fill="rgba(10,12,28,0.96)"
              stroke="rgba(255,255,255,0.1)" strokeWidth={0.5}
            />
            <text
              x={ttX} y={ttY + 9.5}
              textAnchor="middle"
              fill="rgba(255,255,255,0.88)"
              fontSize="5.5"
              fontFamily="'Courier New', monospace"
              style={{ pointerEvents: "none" } as React.CSSProperties}
            >
              {def.id} · {status.replace(/_/g, " ").toUpperCase()}
            </text>
          </g>
        )}
      </g>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <svg
        viewBox="0 0 260 314"
        className="w-full max-w-[280px] mx-auto"
        style={{ maxHeight: "100%", overflow: "visible" }}
        aria-label="2D dental chart"
      >
        <defs>
          <radialGradient id="gumU" cx="50%" cy="90%" r="80%">
            <stop offset="0%" stopColor="rgba(195,100,108,0.28)" />
            <stop offset="100%" stopColor="rgba(180,80,90,0.04)" />
          </radialGradient>
          <radialGradient id="gumL" cx="50%" cy="10%" r="80%">
            <stop offset="0%" stopColor="rgba(195,100,108,0.28)" />
            <stop offset="100%" stopColor="rgba(180,80,90,0.04)" />
          </radialGradient>
        </defs>

        {/* Upper gum arch */}
        <path
          d="M 18 140 L 18 102 Q 22 10, 130 6 Q 238 10, 242 102 L 242 140 Z"
          fill="url(#gumU)"
          stroke="rgba(215,120,128,0.14)" strokeWidth={0.8}
        />

        {/* Lower gum arch */}
        <path
          d="M 18 160 L 18 198 Q 22 300, 130 304 Q 238 300, 242 198 L 242 160 Z"
          fill="url(#gumL)"
          stroke="rgba(215,120,128,0.14)" strokeWidth={0.8}
        />

        {/* Midline vertical */}
        <line
          x1={130} y1={10} x2={130} y2={300}
          stroke="rgba(255,255,255,0.08)" strokeWidth={0.7}
          strokeDasharray="4 3"
        />

        {/* Horizontal divider between arches */}
        <line
          x1={22} y1={150} x2={238} y2={150}
          stroke="rgba(255,255,255,0.08)" strokeWidth={0.7}
        />

        {/* Quadrant labels */}
        <text x={64}  y={145} textAnchor="middle" fill="rgba(255,255,255,0.18)" fontSize="7" fontFamily="'Courier New', monospace" fontWeight="700">UR</text>
        <text x={196} y={145} textAnchor="middle" fill="rgba(255,255,255,0.18)" fontSize="7" fontFamily="'Courier New', monospace" fontWeight="700">UL</text>
        <text x={64}  y={160} textAnchor="middle" fill="rgba(255,255,255,0.18)" fontSize="7" fontFamily="'Courier New', monospace" fontWeight="700">LR</text>
        <text x={196} y={160} textAnchor="middle" fill="rgba(255,255,255,0.18)" fontSize="7" fontFamily="'Courier New', monospace" fontWeight="700">LL</text>

        {/* Teeth */}
        {UPPER_TEETH.map(renderTooth)}
        {LOWER_TEETH.map(renderTooth)}

        {/* Footer count */}
        <text
          x={130} y={311} textAnchor="middle"
          fill="rgba(255,255,255,0.18)"
          fontSize="5.8" fontFamily="'Courier New', monospace" letterSpacing="0.06em"
        >
          {dataCount}/32 TEETH MAPPED
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
  detectionData,
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
