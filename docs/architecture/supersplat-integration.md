# SuperSplat Integration

Browser-based 3D Gaussian Splat editor and viewer. Used in Arcline as the doctor's annotation surface and the patient's review viewer.

Upstream: <https://github.com/playcanvas/supersplat> · MIT license · 6.1k+ stars · live editor at <https://superspl.at/editor>.

## What SuperSplat is (and isn't)

- **Is**: a full-featured Gaussian Splat *editor* — load `.ply`/`.splat`/`.compressed.ply`, inspect, crop, recolor, optimize, publish. Built on PlayCanvas (WebGL/WebGPU) + TypeScript. Ships as a static web app.
- **Isn't**: a packaged React/JS library you `npm install` and drop in. There is no `@playcanvas/supersplat` viewer SDK. To use it inside Arcline you have two real choices:
  1. **Embed the hosted editor in an iframe** — simplest, full editor UX, fast to ship.
  2. **Build a custom viewer with `playcanvas` (or `@playcanvas/react`)** — the splat-rendering pieces SuperSplat uses are public PlayCanvas APIs. More work, but full control over the dental annotation UX.

For Arcline we use **(1)** for the doctor's authoring surface and **(2)** for the patient's read-only review surface.

## Option 1 — iframe embed (doctor authoring)

The hosted editor at <https://superspl.at/editor> accepts a `?load=<url>` query parameter to bootstrap with a remote splat. Strategy:

```tsx
<iframe
  src={`https://superspl.at/editor?load=${encodeURIComponent(signedSplatUrl)}`}
  className="w-full h-[80vh] rounded-lg border"
  allow="clipboard-write; fullscreen"
  sandbox="allow-scripts allow-same-origin allow-downloads allow-forms"
/>
```

Caveats:

- Annotations created inside the editor live in *its* document model. To get them out, we either:
  - **Self-host the editor.** Fork SuperSplat, add a `postMessage` channel that emits annotation events, and serve from `editor.arcline.app`. ~1 week of work.
  - **Use file export round-trip.** Doctor exports JSON from the editor menu; we re-ingest it. Simpler but loses real-time sync.
- iframe is heavyweight (~5 MB JS). Only mount on the doctor's review screen, not the patient list.

A self-hosted fork is the production answer; the public iframe is fine for the prototype phase.

### Self-hosting build

```bash
git clone https://github.com/playcanvas/supersplat.git
cd supersplat
npm install
npm run build         # outputs to dist/
# deploy dist/ to S3 / Supabase Storage / Cloudflare Pages
```

The fork lives in `external/supersplat/` (git submodule) so we can pull upstream patches.

## Option 2 — custom viewer with PlayCanvas (patient review)

For the patient-facing splat viewer we don't need any editor chrome — just rotate, zoom, click hotspots. PlayCanvas Engine (the underlying renderer SuperSplat uses) supports Gaussian Splat rendering directly.

Stack:

- `playcanvas` (engine) — already supports `GSplatComponent` natively.
- `@playcanvas/react` — React bindings, mirrors r3f's API but optimized for splats.

Add to `package.json`:

```bash
bun add playcanvas @playcanvas/react
```

The wrapper lives at [`src/lib/scanning/supersplat-embed.tsx`](../../src/lib/scanning/supersplat-embed.tsx).

> **Why not just use `@react-three/fiber`?** r3f doesn't ship a built-in Gaussian Splat material; you'd be wiring a third-party loader (e.g. `@mkkellogg/gaussian-splats-3d`). PlayCanvas ships first-party splat support and SuperSplat exports are guaranteed compatible.

## Dental annotation model

Annotations are stored separately from the splat — keeping the `.splat` immutable means we can re-render annotations after a model swap without re-running the GPU pipeline.

Schema (mirrored in `src/lib/scanning/types.ts`):

```ts
interface ToothAnnotation {
  id: string;
  scanId: string;
  toothNumber: string;            // FDI: "11"–"48", or Universal: "1"–"32"
  numberingSystem: 'fdi' | 'universal';
  position: [number, number, number];   // splat-space coord
  surface?: 'occlusal' | 'mesial' | 'distal' | 'buccal' | 'lingual';
  kind: 'decay' | 'recession' | 'plaque' | 'wear' | 'restoration' | 'note';
  severity?: 1 | 2 | 3 | 4 | 5;
  note: string;
  createdBy: string;              // doctor user id
  createdAt: string;              // ISO
}
```

Tooth-numbering picker is a small React component: a 32-tooth diagram with click targets, FDI/Universal toggle, defaults to FDI for international clinics.

## Hotspot rendering

Hotspots are rendered as **DOM overlays** projected onto the splat — not as 3D meshes inside the scene. This keeps:

- Hotspot styling in regular CSS/Tailwind/shadcn — consistent with the rest of Arcline.
- Click targets accessible without hit-testing GPU primitives.
- The splat itself untouched.

The viewer projects each annotation's world-space `position` to screen space every frame (cheap — a 4×4 matmul) and emits an `onAnnotationsProjected` callback the React component renders into.

## Doctor video review sync

When the doctor records a walkthrough video:

1. The viewer emits camera-pose events at 10 Hz via `onCameraPose`.
2. The recorder writes a sidecar `walkthrough.json` with `[{ tMs, position, target, fov }]`.
3. On playback, the patient's viewer subscribes to the video's `timeupdate` and lerps the camera to the recorded pose.
4. Annotation drops during the recording become timestamped chips on the video timeline; clicking jumps both the video and the camera.

Schema: `DoctorReview` in `src/lib/scanning/types.ts`.

## Performance budget

| Scan size | Format | First paint | Steady-state FPS (M1 MacBook Pro) |
| --- | --- | --- | --- |
| 100k splats | `.compressed.ply` (~5 MB) | <1 s | 60 |
| 500k splats | `.compressed.ply` (~20 MB) | ~2 s | 60 |
| 2M splats | `.compressed.ply` (~80 MB) | ~5 s | 30–60 |

Dental scans are small (~100–500k splats covering the oral cavity). Always export from SuperSplat as `.compressed.ply` (their custom quantized format) — the savings vs raw `.ply` are ~5×.

## Security

- The splat URL is a Supabase signed URL with 1-hour TTL.
- The iframe `sandbox` attribute denies `allow-top-navigation` so the editor can't break out of its frame.
- For the self-hosted fork we strip telemetry, network exfil paths, and the "publish" button (PlayCanvas's hosted publishing isn't appropriate for PHI).
- Splat files do not embed PHI directly, but the splat *is* the patient's mouth — handle as PHI under HIPAA. Never serve from a public CDN.

## Out-of-scope (today)

- Real-time collaborative editing (two doctors annotating simultaneously). Possible via Supabase Realtime + CRDT but not needed for v1.
- Automated tooth segmentation. Future: train a 3D mask R-CNN on the splat point cloud to auto-place tooth labels.
