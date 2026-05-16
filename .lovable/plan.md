# Audit: "Upload Video from camera roll" path

Scope: `src/pages/patient/ScanSubmission.tsx` only. No worker / edge function / schema changes.

## What works

- Picker entry from intro screen routes to `uploading_file` phase with `inputSource = "upload_video"`.
- Client validation order is correct: MIME allowlist → size cap (150 MB) → duration probe via hidden `<video>` → soft warning >40s → hard reject >60s / <4s.
- XHR PUT to `createSignedUploadUrl(...).signedUrl` with `Content-Type` + `x-upsert: false`, mapped to 0–80% progress. Signed-URL flow does not need an Authorization header (token is in the URL), so this is correct.
- Storage path is stable and matches live-camera: `scan-videos/${patient.id}/${ts}/raw_video.${ext}`, with `extFromMime` covering mp4/webm/mov.
- `scans` insert writes `scan_type='upload_video'`, `raw_video_url=videoPath`, `zones_captured=null`. `analyze-scan-teeth` skipped for uploads (TODO comment present). `reconstruct-splat` / `reconstruct-scan` correctly gated by `VITE_ENABLE_SPLAT` / `VITE_ENABLE_LINGBOT`.
- Disclaimer banner present on intro and on the upload picker screen.
- File input reset (`e.target.value = ""`) lets the same file be re-picked.

## Bugs to fix

### 1. CRITICAL — `capture="environment"` blocks the camera roll on iOS

Line 583:
```tsx
<input type="file" accept="video/mp4,video/webm,video/quicktime" capture="environment" ... />
```

On iOS Safari (and most Android browsers), presence of the `capture` attribute forces the OS camera UI and **bypasses the photo library entirely**. The user cannot pick an existing video from the camera roll. This directly contradicts the feature name "Upload Video" and the helper copy "From your camera roll or files."

**Fix:** remove the `capture` attribute. With just `accept="video/*"` (or the explicit MIME list), iOS shows the native sheet with "Photo Library / Take Video / Choose File", which is exactly what we want. The "Live Camera" path already covers the record-new flow.

### 2. Duration gate mismatch in the review screen

Line 642–645 disables the "Build 3D Map" button while `elapsed < MIN_DURATION_SEC` (10s). For uploads we accept ≥4s (`UPLOAD_MIN_DURATION_SEC`), and `elapsed` is set from the probed duration (line 290). Result: a valid 4–9s uploaded clip passes validation, lands in review, then the submit button is permanently disabled with the misleading label "Hold ≥10s".

**Fix:** in the review screen, compute the effective minimum from `inputSource`:
- `inputSource === "upload_video"` → `UPLOAD_MIN_DURATION_SEC` (4)
- else → `MIN_DURATION_SEC` (10)

Use that for both the `disabled` check and the button label.

### 3. Review screen copy is recorder-only

- "Re-record" button (line 638) for an uploaded file should say "Pick different video".
- Header "Looks good?" is fine, but the secondary label "REVIEW SCAN" can stay.

**Fix:** branch the Re-record button label on `inputSource`. `handleRetake` already routes uploads back to `uploading_file` correctly, so no logic change.

### 4. Minor — `accept` + iOS HEVC `.mov`

iOS records `.mov` as HEVC inside a QuickTime container; browser reports `video/quicktime`. Allowed. But some Android camera apps export `.mp4` with codec strings the browser still labels `video/mp4` — fine. No change needed; flagging that we'll occasionally see videos the splat worker can't decode. That's a worker problem, out of scope for v1 per prior plan.

## Non-issues confirmed

- Signed upload URL header set: `Content-Type` + `x-upsert: false` only. No `Authorization` needed — token rides in the query string.
- Storage path uniqueness: `Date.now()` folder per scan, `upsert: false`. Collisions effectively impossible.
- Cleanup: `URL.revokeObjectURL(recordedUrl)` runs on retake, on new pick, and in the unmount effect.
- Disclaimer banner is rendered persistent (not a toast) on both intro and `uploading_file` screens, matching the spec.
- `VITE_ENABLE_SPLAT` defaults OFF; `analyze-scan-quality` still fires for uploads (correct).

## Files changed in this fix

- `src/pages/patient/ScanSubmission.tsx` — three edits only:
  1. Remove `capture="environment"` from the file input.
  2. Replace the hard-coded `MIN_DURATION_SEC` in the review screen's submit-button disabled check + label with an `effectiveMin` derived from `inputSource`.
  3. Branch the "Re-record" button label on `inputSource` ("Re-record" vs "Pick different video").

No other files. No new components, routes, migrations, or edge-function changes. Live-camera path stays byte-identical.

## Verification after fix

- iOS Safari: tapping "Upload Video" → "Choose a video" opens the native sheet with **Photo Library** option visible. Picking an existing 8s clip lands in review with the "Build 3D Map" button enabled.
- Android Chrome: same sheet, same outcome.
- Uploaded 50s clip still triggers the soft-warning toast, still uploads, still rejects at >60s.
- Live Camera path unchanged: 34s target, 45s auto-stop, `analyze-scan-teeth` still invoked.

Awaiting "approved" before any code.
