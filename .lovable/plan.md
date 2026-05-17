# Two fixes: AI Guide upload error + unified scan capture flow

## 1. Fix: "new row violates row-level security policy"

**Root cause:** The migration for `scan-reference-boards` only created an INSERT policy for `service_role`. But `AiVisualGuidePanel.buildAndDispatch()` uploads the composed board PNG from the **browser** using the patient's JWT — so the insert is blocked.

**Fix:** Add a new migration that lets authenticated patients INSERT/UPDATE into `scan-reference-boards` (and to be safe, the other two new buckets) *but only* under their own patient-id folder — mirroring the pattern used elsewhere via `get_patient_id_for_user(auth.uid())`.

```text
CREATE POLICY "Patients write own scan-reference-boards"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'scan-reference-boards'
    AND (storage.foldername(name))[1] = get_patient_id_for_user(auth.uid())::text
  );
-- + matching UPDATE policy (for upsert:true), same predicate.
```

Doctors/admins keep read-only access via existing SELECT policy. No frontend code change needed for the bug itself.

## 2. UX: pick the pipeline at capture time

Currently, tapping the blue camera icon → ScanSubmission → always runs LingBot + Splat. AI Guide is a separate panel reached only after the scan exists. That's confusing.

**New flow:**

```text
[ blue camera button ]
        ↓
  ┌──────────────────────────┐
  │  Choose capture method   │
  │  • Record video          │
  │  • Upload video / photos │
  └──────────────────────────┘
        ↓
  ┌──────────────────────────┐
  │  What do you want?       │
  │  ◉ 3D Map     (LingBot)  │
  │  ◉ 3D Plus    (Splat)    │
  │  ◉ AI Guide   (beta)     │
  │  ☐ also generate others  │
  └──────────────────────────┘
        ↓
  capture / upload → submit
```

### Frontend changes (ScanSubmission.tsx only)

- Add a new state `pipelines: { lingbot: boolean; splat: boolean; aiGuide: boolean }` rendered as a 3-card chooser shown right after the source choice (record vs upload) and before capture begins. Default = whatever the patient picked last (localStorage `lastPipelineChoice`), falling back to `{ lingbot: true, splat: true, aiGuide: false }` so today's behavior is the default.
- AI Guide option is enabled for *both* video and photo uploads (the existing `referenceBoard.ts` already handles `sampleVideoFrames`).
- In `handleSubmit`, gate the existing dispatch lines:
  - `processing_status: pipelines.lingbot && LINGBOT_ENABLED ? "queued" : null`
  - `splat_processing_status: pipelines.splat && SPLAT_ENABLED ? "queued" : null`
  - Only invoke `reconstruct-scan` / `reconstruct-splat` if their flag is on.
- If `pipelines.aiGuide`, after the scans-row insert auto-compose a reference board from the uploaded frames (video → `sampleVideoFrames`, photos → direct), upload it to `scan-reference-boards/{patient_id}/{scan_id}/board.png`, set `generation_status='reference_board_created'`, and invoke `generate-visual-guide`. This re-uses everything already in `src/lib/scanning/referenceBoard.ts`.
- On the results page, auto-select the tab matching the user's primary pick.

### What does NOT change

- No edits to `SplatTabPanel`, `SuperSplatEmbed`, `reconstruct-scan`, `reconstruct-splat`, `reconstruct-scan-callback`, `generate-visual-guide`, `visual-guide-poll`, or the LingBot/cron paths.
- No DB schema changes beyond the storage policy fix above.
- AiVisualGuidePanel still works exactly as today for scans that didn't pre-select AI Guide.

## Technical summary

- 1 new migration: `scan-reference-boards` patient-folder INSERT + UPDATE policies (and the same for `generated-scenes` / `generated-assets` only if we ever want client writes — for now, scope to the bucket actually written from the browser).
- `ScanSubmission.tsx`: add `PipelinePicker` sub-component, new state, conditional dispatch, optional inline AI-Guide board-build call.
- `ScanResults.tsx`: read `?tab=` query param (or first-completed pipeline) to choose default tab.
- No new secrets, no new edge functions.

## Open question

For uploaded **single-video** AI Guide builds, the user can't tag which frame is LEFT/FRONT/RIGHT/etc. We have two options — please pick one before I implement:

- **A. Auto-tag:** sample 6 evenly-spaced frames and assign them to the 6 cells in order. Fast, zero UI, but tags may be wrong.
- **B. Tag step:** after upload, show the existing reference-board editor so the patient can drag frames into cells before dispatch. One extra screen, better quality.