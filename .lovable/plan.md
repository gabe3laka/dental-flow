## Goal

Collapse the standalone `/patient/scans/:scanId/view-3d-plus` page into a 4th "3D PLUS" tab on the scan results page. Same data, same behavior, just inlined.

## Changes

### 1. `src/pages/patient/ScanResults.tsx`

- Widen `viewMode` state union to `"photos" | "3d" | "analysis" | "3d-plus"`.
- Extend the tab list array to `["analysis", "photos", "3d", "3d-plus"]`, with label mapping `"3d-plus" → "3D PLUS"`. Tab order: ANALYSIS | PHOTOS | 3D MAP | 3D PLUS.
- Add a new content panel `{viewMode === "3d-plus" && <SplatTabPanel scanId={scan.id} />}` rendered alongside the existing photos / 3d panels.
- Remove the "View 3D Plus" `<Button>` block (lines ~684–694) entirely. Also drop the immediately-following `!scan.pointcloud_url` helper text (lines 695–699), which only existed to qualify that button. Keep "Save & Track Progress" and the delete flow intact.
- Drop the now-unused `Sparkles` import from `lucide-react`.

### 2. New file `src/components/scanning/SplatTabPanel.tsx`

Self-contained panel that mirrors `Scan3DPlusView.tsx` behavior, scoped to the splat pipeline only (no LingBot tab logic — that already lives in the "3D MAP" tab).

Responsibilities:
- Fetch `id, splat_url, splat_processing_status, splat_processing_error` from `scans` for the given `scanId` on mount.
- Poll the same row every 8s; clear interval on unmount or once status reaches a terminal state (`complete` / `failed`).
- Sign `splat_url` via `usePointCloudUrl(path, 3600, "scan-splats")`.
- Render states:
  - `null` or `"queued"` → "Reconstructing splat…" loader.
  - `"processing"` → "Reconstructing splat… (in progress)" loader.
  - `"complete"` + `splat_url` → `<SuperSplatEmbed fileUrl={signedUrl} filename="scene.ply" />` inside a `rounded-card overflow-hidden bg-card border border-border` wrapper.
  - `"failed"` → error panel showing `splat_processing_error` + `Retry` button that calls `supabase.functions.invoke("reconstruct-splat", { body: { scan_id: scanId } })`, then re-fetches the row (identical payload + flow to current `Scan3DPlusView.retrySplat`).
- Reuse the existing inline `ReconstructingPanel` / `FailedPanel` / `EmptyState` patterns from `Scan3DPlusView.tsx` (copy them into this component so it stays self-contained).

### 3. `src/App.tsx`

- Delete line 103: `<Route path="/patient/scans/:scanId/view-3d-plus" element={<Scan3DPlusView />} />`.
- Remove the `Scan3DPlusView` import at the top.

### 4. Delete `src/pages/patient/Scan3DPlusView.tsx`

## Untouched

- `src/lib/scanning/SuperSplatEmbed.tsx` — iframe contract unchanged.
- The existing "3d" tab (LingBot point cloud) — content byte-identical, value `"3d"`, label `"3D MAP"`.
- `ScanSubmission.tsx`, all Edge Functions, migrations, RLS policies, worker code.
- Splat polling cadence (8s), signed-URL bucket (`scan-splats`, 3600s TTL), `reconstruct-splat` invoke payload (`{ scan_id }`), and the status string set.
- `LINGBOT_ENABLED` / `SPLAT_ENABLED` env-flag logic — not relevant once tab selection is user-driven (default tab stays `"analysis"` as today).

## Verification

- Open a scan → confirm 4 tabs render in order: ANALYSIS | PHOTOS | 3D MAP | 3D PLUS.
- "3D MAP" tab unchanged.
- "3D PLUS" on a scan with `splat_processing_status="complete"` shows the SuperSplat iframe.
- "3D PLUS" on an in-flight scan shows the reconstructing state and flips after the 8s poll.
- Failed splat → Retry invokes `reconstruct-splat`, status flips back to `processing`.
- Direct nav to `/patient/scans/:id/view-3d-plus` now 404s (route removed) — acceptable per the refactor.
- Build passes; no orphan imports of `Scan3DPlusView` or `Sparkles`.
