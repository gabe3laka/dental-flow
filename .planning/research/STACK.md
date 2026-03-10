# Technology Stack

**Project:** Arcline — 3D Oral Mapping Milestone
**Researched:** 2026-03-10
**Scope:** Additive stack for 3D capture/viewer features on top of the existing React 18 + Three.js 0.160.1 + @react-three/fiber 8 + @react-three/drei 9 + Supabase foundation.

---

## Existing Stack (Do Not Change)

These are already installed and must be used as the foundation. No version upgrades needed.

| Technology | Installed Version | Role |
|------------|------------------|------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.8.3 | Type safety |
| Vite | 5.4.19 | Build tool |
| Three.js | 0.160.1 | 3D renderer |
| @react-three/fiber | 8.18.0 | React renderer for Three.js |
| @react-three/drei | 9.122.0 | Three.js utilities (useGLTF, OrbitControls, Html, Line, etc.) |
| @supabase/supabase-js | 2.97.0 | Database + Storage + Edge Functions |
| TanStack React Query | 5.83.0 | Server state / caching |
| Zod | 3.25.76 | Schema validation |

**CRITICAL: The project constraint explicitly bans new major dependencies without strong justification. Everything below justifies itself against this constraint.**

---

## 3D Feature Stack

### Frame Extraction from Video Streams

**Recommendation: Native Browser APIs only — no library needed.**

The existing `ScanSubmission.tsx` already demonstrates the canonical pattern:

```typescript
const canvas = document.createElement('canvas');
canvas.width = video.videoWidth;
canvas.height = video.videoHeight;
const ctx = canvas.getContext('2d');
ctx.drawImage(video, 0, 0);
canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
```

For the 3D capture flow (30–60 frames), call this in a timed loop with `requestAnimationFrame` or `setInterval`.

| Approach | Verdict | Reason |
|----------|---------|--------|
| `canvas.drawImage(video) + toBlob()` | **USE THIS** | Already in codebase, universal support |
| `ImageCapture.grabFrame()` | Avoid | Chrome-only — incomplete browser support |
| OffscreenCanvas + Worker | Defer | Complexity not warranted for 30–60 frames |
| `ffmpeg.wasm` | Avoid | 8MB+ bundle for what canvas handles natively |

**Confidence: HIGH**

---

### GLB/glTF Loading

**Recommendation: `useGLTF` from @react-three/drei (already installed)**

```typescript
import { useGLTF } from '@react-three/drei';

function MouthModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}
```

**Draco compression setup (no new npm install — ships with Three.js):**
```bash
cp -r node_modules/three/examples/jsm/libs/draco/ public/draco/
```
```typescript
import { useGLTF } from '@react-three/drei';
useGLTF.setDecoderPath('/draco/');
```

**Supabase integration:** Generate a signed URL and pass directly to `useGLTF(signedUrl)`.

| Approach | Verdict | Reason |
|----------|---------|--------|
| `useGLTF` from @react-three/drei | **USE THIS** | Already installed, Suspense-integrated, cached |
| Raw `THREE.GLTFLoader` | Avoid | More boilerplate, no caching, bypasses Suspense |
| `@google/model-viewer` | Avoid | Conflicts with existing Three.js setup |

**Confidence: HIGH**

---

### 3D Annotation with Raycasting

**Recommendation: @react-three/fiber built-in event system + `<Html>` from drei**

```typescript
import { Html } from '@react-three/drei';

// Click handler on mesh — e.point is the 3D intersection
<mesh onClick={(e) => {
  e.stopPropagation();
  onAnnotate({ x: e.point.x, y: e.point.y, z: e.point.z });
}}>

// Annotation pin anchored in 3D space
function AnnotationPin({ position, note }) {
  return (
    <Html position={position} occlude>
      <div className="annotation-pin">{note}</div>
    </Html>
  );
}
```

**Point-to-point measurement:** Use `THREE.Vector3.distanceTo()` on two captured `e.point` values, rendered with `<Line>` from drei.

| Approach | Verdict | Reason |
|----------|---------|--------|
| R3F native event system (onClick on mesh) | **USE THIS** | Built into @react-three/fiber |
| `<Html>` from drei for pin overlays | **USE THIS** | Already installed, handles 3D-to-DOM projection |
| `<Line>` from drei for measurements | **USE THIS** | Already installed |
| Raw `THREE.Raycaster` + mouse events | Avoid | Verbose; R3F wraps this automatically |

**Confidence: HIGH**

---

### Color Overlays on Mesh

**Recommendation: `vertexColors` on `MeshStandardMaterial` or per-node material assignment**

Option A — Vertex colors (continuous photogrammetry mesh):
```typescript
geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
```

Option B — Per-node material swap (segmented GLB with named nodes):
```typescript
const { nodes } = useGLTF(url);
// Mutate nodes.ToothMesh.material based on AI detection data
```

Fallback: `TeethScene.tsx` procedural arch renders when `modelUrl` is null.

**Confidence: MEDIUM** — Which option works depends on photogrammetry output mesh structure (unknown until real API is chosen).

---

### Interactive Viewer Controls

**Recommendation: `OrbitControls` from @react-three/drei**

```typescript
import { OrbitControls } from '@react-three/drei';
<Canvas>
  <OrbitControls enableDamping dampingFactor={0.05} />
</Canvas>
```

**Synced rotation for side-by-side comparison:** Bind both OrbitControls instances to a shared camera state ref via `onChange`, apply to second camera in `useFrame`.

**Confidence: HIGH**

---

### Screenshot/Export

**Recommendation: `gl.domElement.toBlob()` via R3F `useThree()` — no new library**

```typescript
import { useThree } from '@react-three/fiber';
const { gl, scene, camera } = useThree();

const capture = () => {
  gl.render(scene, camera);
  gl.domElement.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'scan-3d.png'; a.click();
  }, 'image/png');
};
```

**Confidence: HIGH**

---

### Supabase Storage — 3D Assets

**Recommendation: Existing `@supabase/supabase-js` 2.97.0 — add `3d-scans` bucket**

Frame upload (same pattern as `ScanSubmission.tsx`):
```typescript
await supabase.storage
  .from('3d-scans')
  .upload(`${patientId}/${sessionId}/frame-${i}.jpg`, blob, {
    contentType: 'image/jpeg',
  });
```

GLB retrieval with signed URL (HIPAA-safe):
```typescript
const { data } = await supabase.storage
  .from('3d-scans')
  .createSignedUrl(`${patientId}/${scanId}/model.glb`, 3600);
// Pass data.signedUrl to useGLTF()
```

Bucket config:
- **Visibility: Private** (HIPAA — no public access)
- **RLS:** Same pattern as `scan-videos`
- **Max file size:** 50MB (dental GLBs with Draco: 5–25MB; frames: small JPEGs)

**Confidence: HIGH**

---

### Photogrammetry Reconstruction API (Stubbed in v1)

Per PROJECT.md: `process-3d-scan` edge function stubs reconstruction in v1.

Edge function contract:
- Input: `{ scan_id, frame_paths: string[] }`
- Output: Update `three_d_scans.model_url` with static sample GLB path; set `status = 'complete'`

**Real API options for a future milestone (LOW confidence):**

| API | Type | Notes |
|-----|------|-------|
| Luma AI | Commercial SaaS | REST API; web-upload friendly; returns GLB/splat. Most promising direction. |
| Polycam API | Commercial SaaS | iOS LiDAR-focused; REST availability for web images unclear |
| Meshroom (AliceVision) | Open-source self-hosted | Requires GPU server; complex pipeline |
| Nerfstudio | Research/self-hosted | High quality NeRF; complex to host |

**Confidence: LOW** — HIPAA compliance, dental use case suitability, and API terms review required before committing to any option.

---

## What NOT to Install

| Library | Why Not |
|---------|---------|
| `three-mesh-bvh` | Overkill — BVH matters for very large meshes; dental models are small |
| `@react-three/postprocessing` | No post-processing effects in scope |
| `zustand` | React Query + useRef sufficient for camera state sync |
| `@google/model-viewer` | Conflicts with existing Three.js setup |
| `babylon.js` | Wrong engine; full rewrite required |
| `ffmpeg.wasm` | 8MB+ bundle for frame extraction the canvas API handles natively |
| `leva` | Debug UI panel; not for production |
| `potree` | Point cloud renderer; overkill for dental meshes |

---

## Installation Summary

**No new production npm installs required for this milestone.**

One build-time file copy (no npm install):
```bash
cp -r node_modules/three/examples/jsm/libs/draco/ public/draco/
```

Then in app entry point:
```typescript
import { useGLTF } from '@react-three/drei';
useGLTF.setDecoderPath('/draco/');
```

Optional dev-only utility (only if converting procedural arch to baked GLB):
```bash
npm install -D @react-three/gltfjsx
```

---

*Stack analysis: 2026-03-10*
