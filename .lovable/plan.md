# Make Upload Video use the same splat pipeline as Live Camera

## Problem

The "Upload Video" path in `ScanSubmission.tsx` looks like it dispatches to `reconstruct-splat`, but it diverges from the live-camera path in one place that breaks the worker contract:

- Live camera inserts `scans` with `scan_type = scanType` (`"scope"` or `"wand"`) and dispatches `reconstruct-splat` with that same value.
- Upload Video overrides `effectiveScanType = "upload_video"` and writes `scan_type = "upload_video"` to the row. `reconstruct-splat` then reads `scan.scan_type` and forwards `"upload_video"` to the RunPod worker, which only knows `"scope" | "wand"`. The job either fails validation worker-side or runs with the wrong preset.

Everything else is already aligned: same bucket, same path layout (`scan-videos/${patient.id}/${ts}/raw_video.${ext}`), same SDK upload call, same `splat_processing_status = "queued"`, same `supabase.functions.invoke("reconstruct-splat", ...)`.

## Fix (frontend only, one file)

`src/pages/patient/ScanSubmission.tsx`:

1. Stop overriding `scan_type` for uploads. Persist `scan_type = scanType` (the user-selected `"scope" | "wand"`, defaulting to `"scope"`) for both live and upload rows so `reconstruct-splat` sends a valid type to the worker.
2. Keep `source = "upload_video"` (and a separate `inputSource` flag if needed) so analytics/UI can still distinguish camera-roll uploads from live captures. The pipeline contract uses `scan_type`; the provenance uses `source`.
3. Pass `scan_type: scanType` (not `"upload_video"`) in the `reconstruct-splat` invoke body for symmetry, even though the edge function already prefers the DB value.
4. Leave `analyze-scan-teeth` still skipped for uploads (no client keyframes) — that's an analysis concern, not the splat pipeline.

No edge-function, schema, RLS, or storage changes. Live-camera path stays byte-identical.

## Verification

- Upload an MP4/MOV from camera roll → row inserts with `scan_type='scope'`, `source='upload_video'`, `splat_processing_status='queued'`.
- `reconstruct-splat` logs show the same payload shape as a live capture (`video_url`, `scan_id`, `patient_id`, `scan_type:'scope'`, `callback_url`).
- Callback writes `splat_url`; results page renders the splat exactly like a live-recorded scan.
- Live-camera flow unchanged.

Awaiting approval.
