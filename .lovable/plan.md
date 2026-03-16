

# Plan: Patient-Controlled Scan Flow, AI Analysis, Education & Progress Enhancement

This is a large plan spanning 5 features. Implementation will be broken into phases.

---

## Phase 1: Database Migration + Scan Flow Control

### DB Migration
Add 4 columns to `scans`:
- `ai_analysis jsonb` — stores structured AI analysis result
- `sent_to_doctor boolean DEFAULT false` — patient controls when doctor sees scan
- `sent_to_doctor_at timestamptz` — timestamp of send action
- `patient_note text` — optional note when sending to doctor

### Edge Function: `analyze-scan-teeth/index.ts`
**Remove** the block (lines ~72-81) that auto-creates a `scan_reviews` row. Keep everything else. Store the full AI result in `scans.ai_analysis` in addition to `detection_tags`.

### `ScanSubmission.tsx`
- Change post-submit toast from "Your doctor will review it shortly" to "Scan complete! View your AI analysis"
- Change navigation from `/patient/scans` to `/patient/scans/${scanId}/results`

### New Page: `ScanResults.tsx`
Post-scan results page showing:
- Animated quality score
- AI analysis breakdown (alignment, detections with severity)
- Toggle between "Scan Photos" and "3D Map"
- Two CTAs: "Send to Doctor for Review" (with optional patient note) and "Save & Track Progress"
- Route: `/patient/scans/:scanId/results`

### `ScanHistory.tsx` Updates
- Show `sent_to_doctor` status on each scan card ("AI Analyzed" vs "Sent to Doctor")
- Add "Send to Doctor" button on unsent scans
- When sent: insert `scan_reviews` row and update `sent_to_doctor = true`

### `App.tsx`
- Add route: `/patient/scans/:scanId/results` → `ScanResults`

---

## Phase 2: Scan Photo Viewer

### New Component: `ScanPhotoGrid.tsx`
- Fetches signed URLs from `scan-videos` bucket using paths in `zones_captured`
- Displays 5-zone grid (Upper, Lower, Left, Right, Front) with quality indicators
- Supports original vs AI-annotated toggle (annotations rendered as CSS overlays from `ai_analysis`)

### New Component: `ScanPhotoViewer.tsx`
- Full-screen image viewer opened on tap
- Pinch-to-zoom via CSS `touch-action` and transform
- Swipe between zones
- AI annotation overlay toggle

### Integration
- Used in both `ScanResults.tsx` and `ScanHistory.tsx` (expanded view toggle: "3D Map" / "Scan Photos")

---

## Phase 3: Educational Detection Tags + Marketplace CTAs

### New File: `src/lib/dental-education.ts`
Hardcoded content dictionary covering: plaque, tartar, recession, cavity, crowding, spacing, rotation, misalignment, inflammation, bone_change, appliance_fit. Each entry has: title, description, causes, prevention tips, when-to-see-doctor advice, and matching specialist type.

### New Component: `DetectionTagSheet.tsx`
Sheet/dialog opened when tapping a detection tag pill. Shows:
- Educational content from dictionary
- Patient's specific severity + confidence from `ai_analysis`
- Affected teeth list
- Self-care tips
- "Find a Specialist" CTA → navigates to Chat Find tab with `prefilterSpecialty`
- "Ask Your Doctor" CTA → navigates to Chat Messages tab

### Updates to `ScanHistory.tsx` and `ScanResults.tsx`
- Make detection tag pills clickable → open `DetectionTagSheet`

### Updates to `Chat.tsx`
- Read `location.state` for `prefilterSpecialty` and `fromDetection`
- Auto-select Find tab and show contextual banner when navigated from detection

---

## Phase 4: Progress Page Enhancement

### New Components
| Component | Purpose |
|-----------|---------|
| `ScanActivityChart.tsx` | Simple bar chart (pure CSS/SVG) showing scans per week |
| `DetectionTrendCard.tsx` | First scan vs latest scan comparison for each detection type |
| `NextActionCard.tsx` | Dynamic CTA based on days since last scan, unsent scans, unread reviews |

### `Progress.tsx` Redesign
New section order:
1. Treatment progress bar (linear timeline: start → now → goal)
2. Scan activity chart with streak count
3. Detection trends (improving/stable/worsening arrows)
4. AI Insight card (kept, with trend-aware fallback)
5. 3D Tooth Map (kept, with "Reflects your latest scan" label)
6. Next Action card
7. Milestones timeline (kept)
8. Share Progress (kept)

Data: fetch all scans (not just latest) to compute trends, weekly counts, and comparison.

---

## Phase 5: AI Image Annotation Edge Function

### New Edge Function: `annotate-scan-image/index.ts`
- Uses Lovable AI Gateway (google/gemini-3-flash-preview) with vision
- Input: scan image signed URL + detection tags
- Output: array of annotation objects with bounding box percentages and descriptions
- Stored in `scans.ai_analysis.annotated_regions`
- Called from `analyze-scan-teeth` after initial analysis completes

### Client-Side Rendering
- `ScanPhotoGrid` renders annotations as positioned CSS overlays (colored borders + labels) on top of original images
- Toggle to show/hide annotations

---

## Files Summary

### New Files (10)
- `supabase/migrations/xxx_scan_flow_control.sql`
- `src/pages/patient/ScanResults.tsx`
- `src/components/patient/ScanPhotoGrid.tsx`
- `src/components/patient/ScanPhotoViewer.tsx`
- `src/components/patient/DetectionTagSheet.tsx`
- `src/components/patient/ScanActivityChart.tsx`
- `src/components/patient/DetectionTrendCard.tsx`
- `src/components/patient/NextActionCard.tsx`
- `src/lib/dental-education.ts`
- `supabase/functions/annotate-scan-image/index.ts`

### Modified Files (6)
- `supabase/functions/analyze-scan-teeth/index.ts` — remove auto-review, store ai_analysis
- `src/pages/patient/ScanSubmission.tsx` — new post-submit flow
- `src/pages/patient/ScanHistory.tsx` — photo toggle, send-to-doctor button, interactive tags
- `src/pages/patient/Progress.tsx` — new layout with trends/activity/next-action
- `src/pages/patient/Chat.tsx` — accept filter params from navigation state
- `src/App.tsx` — add ScanResults route
- `supabase/config.toml` — add annotate-scan-image function

### Unchanged
All doctor pages, admin pages, `Home.tsx`, `Profile.tsx`, `DoctorMarketplace.tsx`, `PatientBottomNav.tsx`, `TeethVisualization.tsx`, `Onboarding.tsx`, `VideoResponse.tsx`, `ToothArch.tsx`

