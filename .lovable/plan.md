# Restructure scan submission flow

## Goal
Make pipeline choice the FIRST decision (single-select, not multi). Then branch the rest of the flow based on which pipeline was picked:

- **3D Map** or **3D Plus** → keep the existing Live Camera / Upload Video picker and the whole record / review / upload flow.
- **AI Guide (β)** → skip the video flow entirely and drop the user into the AI Guide's own photo/video upload UI (the one currently living in `AiVisualGuidePanel` on the scan results page).

## UX flow (patient)

```text
[Intro screen]
  DISCLAIMER
  CAPTURE DEVICE  (Scope / Wand)
  WHAT TO BUILD   (single radio: 3D Map | 3D Plus | AI Guide β)
  [Continue →]

  ├── 3D Map / 3D Plus selected
  │     → existing picker: LIVE CAMERA  /  UPLOAD VIDEO
  │     → record or upload → review → submit → ScanResults
  │
  └── AI Guide β selected
        → create a lightweight draft `scans` row (scan_type, patient_id,
          processing_status=null, splat_processing_status=null,
          generation_status='awaiting_reference_board')
        → navigate to /patient/scans/:id?tab=ai-guide
        → ScanResults auto-selects AI GUIDE tab, AiVisualGuidePanel
          handles photos+video upload, board composition, dispatch
          (this is the panel the user already approved)
```

## Why this shape

- The two yellow options (Live Camera + Upload Video) only make sense for pipelines that consume a single continuous scan video. AI Guide composes a 2×3 board from arbitrary photos / sampled frames, which is a different mental model and already has its own purpose-built UI.
- One pipeline per submission also removes the confusing "pick one or more" copy from the screenshot.
- No new backend, no new edge function, no schema change — we reuse the existing `AiVisualGuidePanel`, `generate-visual-guide`, `scan-reference-boards` bucket, and `generation_status` column.

## Files to change (frontend only)

### `src/pages/patient/ScanSubmission.tsx`
- Replace `PipelineChoice` multi-checkbox with single-select state: `pipeline: 'lingbot' | 'splat' | 'aiGuide'` (persisted in `localStorage` under the existing key).
- Update the WHAT TO BUILD card group to render as a radio group (one selected at a time), remove the "Pick one or more…" helper, replace with "Same scan video powers both 3D options" only when a 3D option is highlighted.
- Add a `Continue` button on the intro screen (replaces auto-advance) that:
  - If `pipeline === 'aiGuide'`: insert a draft `scans` row via the supabase client (patient_id from `get_patient_id_for_user`, `scan_type`, `generation_status='awaiting_reference_board'`), then `navigate('/patient/scans/' + id + '?tab=ai-guide')`. On insert error, toast and stay.
  - Else: advance to the existing `picker` phase (Live Camera / Upload Video) exactly as today.
- In `handleSubmit`, drop the `pipelines.aiGuide` branch and the inline `composeBoard` / `generate-visual-guide` dispatch (no longer reachable from this path). Keep the LingBot / Splat dispatch gating, but driven by `pipeline === 'lingbot'` / `pipeline === 'splat'`.
- Remove now-unused imports from `referenceBoard` (`composeBoard`, `BOARD_CELLS`, `estimateSharpness`, `qualityFor`, `sampleVideoFrames`, `CellAssignment`, `BoardCellKey`) — they live in `AiVisualGuidePanel` already.

### `src/pages/patient/ScanResults.tsx`
- Read `?tab=ai-guide` (or similar) from `useSearchParams` on mount and set the active tab to AI Guide when present, so the redirect lands the patient straight on the panel.

## Files NOT changed
- `AiVisualGuidePanel.tsx`, `referenceBoard.ts`, `SplatTabPanel.tsx`, `SuperSplatEmbed`.
- `reconstruct-scan`, `reconstruct-splat`, `generate-visual-guide`, `visual-guide-poll`.
- Storage buckets, RLS policies, DB schema.

## Open question
Creating the draft `scans` row for AI Guide requires inserting with only `patient_id` + `scan_type` + `generation_status`. Existing scan inserts on this page always also set `raw_video_url` and a few NOT-NULL-ish fields. I'll need to verify the `scans` table column nullability before writing the insert (quick `supabase--read_query` at implementation time). If a column is NOT NULL with no default, the alternative is to keep the user on `ScanSubmission` and mount `AiVisualGuidePanel` inline with a temporary in-memory id, deferring the row insert to the panel's dispatch step. I'll choose between these two during implementation based on what the schema allows — both keep the UX identical.
