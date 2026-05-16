
# Revised plan — step 2 only (Inputs picker + Live Camera + Upload Video)

Scope locked to v1. Upload Photos is **out** until the splat worker adds an `image_urls[]` branch. No `reconstruct-splat` shape change. No worker changes.

## Repo-fact corrections folded in

- Splat viewer surface is `src/pages/patient/Scan3DPlusView.tsx`, embedding `src/lib/scanning/SuperSplatEmbed.tsx`. There is no `SplatTabPanel.tsx` and we will not create one. Any disclaimer or copy lives in `Scan3DPlusView.tsx`.
- Splat dispatch defaults **OFF**. Gate is `import.meta.env.VITE_ENABLE_SPLAT === "true"` in `ScanSubmission.tsx`. LingBot dispatch also defaults OFF (`VITE_ENABLE_LINGBOT === "true"`). The `!== "false"` check in `Scan3DPlusView.tsx:17` is viewer-tab selection, not dispatch — leave it alone. All new copy/comments will say "off by default; enable by setting `VITE_ENABLE_SPLAT=true` in the build env."

## Live-camera duration change (in v1)

In `src/pages/patient/ScanSubmission.tsx`:

- `MIN_DURATION_SEC = 10` (unchanged)
- `TARGET_DURATION_SEC: 25 → 34`
- `MAX_DURATION_SEC = 45` (unchanged; auto-stop ceiling)
- Update every UI string referencing "25 s" / "25 seconds" / "~25" to **34 s**. Includes the intro instructions, the live recording HUD target hint, and the review-phase summary.
- Keyframe extraction loop (`setInterval(3000)`) untouched. 34 s → ~12 frames + t=0 frame.
- No `MediaRecorder`, MIME-fallback, camera-flip, or stream-cleanup logic touched.

## New input picker

Replace the current `intro` phase of `ScanSubmission.tsx` with a two-option picker (Upload Photos is hidden in v1, not rendered):

```text
NEW SCAN
 ┌─ Live Camera   (default, existing flow)
 └─ Upload Video  (new)
```

- Treatment chooser stays where it is; picker sits below it.
- Picking **Live Camera** → existing `recording` → `reviewing` → `uploading` phases byte-identical aside from the 34 s constant.
- Picking **Upload Video** → new `uploading_file` → shared `reviewing` → `uploading` phases (see next section).
- Persistent disclaimer banner above the picker:
  > "For visual guidance only. Not a medical device or diagnosis."
- Same disclaimer rendered at the top of `Scan3DPlusView.tsx` (persistent, not a toast).

## Upload Video path (v1)

New phase `uploading_file` inserted before `reviewing`. No new route; all in `ScanSubmission.tsx`.

**Input.** `<input type="file" accept="video/*" capture="environment">` so iOS opens the camera-roll/camera sheet. Hidden input triggered by a styled button.

**Client validation, blocking on failure with inline error:**
- MIME in `video/mp4 | video/webm | video/quicktime`.
- File size ≤ 150 MB.
- Duration via hidden `<video>` `loadedmetadata`: **4 s ≤ duration ≤ 60 s (hard cap)**.
- Soft warning toast at **duration > 40 s**: "Long videos increase the chance reconstruction fails. 30–40 s works best." User can still proceed up to 60 s.
- Reject (with copy) anything > 60 s — surfaced in the validation card, not as a toast.

**Preview.** Same `<video controls>` element used by today's `reviewing` phase. User can re-pick a different file or cancel.

**Submit.** Reuses today's `handleSubmit` with the file's `Blob` substituted for the recorded blob:
1. Upload to `scan-videos/${patientId}/${ts}/raw_video.${ext}` (ext derived from MIME).
2. Insert `scans` row with `scan_type = 'upload_video'`, `raw_video_url`, `zones_captured = null`.
3. Bump `patients.total_scans`.
4. Dispatch `reconstruct-splat` only if `VITE_ENABLE_SPLAT === "true"` (unchanged gate). Edge function and worker contract untouched — they receive exactly the same `{ video_url, scan_id, patient_id, scan_type, callback_url }` shape they already accept.
5. Dispatch `reconstruct-scan` only if `VITE_ENABLE_LINGBOT === "true"`.
6. Fire-and-forget `analyze-scan-quality`.
7. **Skip `analyze-scan-teeth`** for `upload_video` — add `// TODO(phase2): extract keyframes from uploaded video to restore analyze-scan-teeth` at the call site. Known regression vs. live capture.
8. Navigate to `/patient/scans/${id}/results`.

**Progress UI.** Real bytes for the raw-video upload. Use `XMLHttpRequest` against the Supabase signed-upload URL (`createSignedUploadUrl` + `uploadToSignedUrl` is fine but doesn't expose progress; XHR PUT to the signed URL does). Replaces the synthetic 10→80→90→100 bar for this path only. Live-camera path keeps today's synthetic bar in v1 to limit surface area.

**Error handling.** Same `try/catch` wrapper; on failure phase reverts to `reviewing` with the chosen file preserved, destructive toast shown. Per-step errors routed through `logError` exactly as today.

**Mobile.** `accept="video/*" capture="environment"` confirmed to invoke the iOS camera/library sheet. No PWA/orientation work.

## scan_type values

Free-text column, no migration. v1 writes:
- `'scope' | 'wand'` — live camera (unchanged).
- `'upload_video'` — new.

`ScanHistory.tsx`, `ScanResults.tsx`, `Scan3DPlusView.tsx`, doctor surfaces all already render scans regardless of `scan_type`. No changes there beyond the disclaimer on `Scan3DPlusView.tsx`.

## Explicitly out of v1 (will not be built)

- Upload Photos input. Hidden from picker entirely. Gated on `gabe3laka/splat-worker` adding an `image_urls[]` branch.
- Any change to `supabase/functions/reconstruct-splat/index.ts` input shape. The worker today only accepts `{ video_url, scan_id, patient_id, iters?, fps? }`; sending `input.photos` would crash at `download_video`.
- Any change to `rp_handler.py`, Dockerfile, `simple_trainer.py`, or trainer parameters. The gsplat OOM/crash issue is acknowledged but worker-side.
- `analyze-scan-teeth` for `upload_video` (deferred; TODO comment instead).
- Real progress bar for the live-camera path.
- Resume on failure (tus). Defer to phase 2.
- Server-side frame extraction.
- `splat_input_kind` / `splat_input_paths` columns. Not needed in v1.
- Self-hosting SuperSplat; `editor.dental-flow.app` migration.
- Lingbot path changes.
- New routes.

## Files that will change in v1 implementation

- `src/pages/patient/ScanSubmission.tsx` — duration constants, intro→picker, new `uploading_file` phase, XHR-based progress for uploaded video, `scan_type='upload_video'` write, `analyze-scan-teeth` skip + TODO, disclaimer banner.
- `src/pages/patient/Scan3DPlusView.tsx` — persistent disclaimer banner at top of the viewer.
- (Optional, small) `src/lib/scanning/types.ts` — extend `ScanType` to `'scope' | 'wand' | 'upload_video'` if we want type safety; otherwise leave free-text.

No other files touched. No edge-function changes. No migrations. No worker changes.

## Verification checklist for approval

- [ ] Live camera still records end-to-end; HUD shows 34 s target; auto-stops at 45 s.
- [ ] Upload Video path rejects > 60 s, soft-warns > 40 s, accepts 4–60 s mp4/webm/mov ≤ 150 MB.
- [ ] Uploaded scan row has `scan_type='upload_video'`, `raw_video_url` set, `zones_captured=null`.
- [ ] `reconstruct-splat` only invoked when `VITE_ENABLE_SPLAT==='true'`; payload unchanged.
- [ ] `analyze-scan-teeth` not invoked for upload_video; TODO comment present.
- [ ] Disclaimer visible on scan intro and on `Scan3DPlusView.tsx`.
- [ ] No new files under `src/components/scanning/`.

Awaiting "approved" before any code.
