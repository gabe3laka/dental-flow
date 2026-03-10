# Feature Landscape

**Domain:** Dental SaaS — AI-assisted intraoral scanning, 3D oral mapping, remote care, practice management
**Researched:** 2026-03-10
**Confidence Note:** Findings draw on training knowledge (cutoff August 2025) covering Medit, 3Shape, iTero, Dental Monitoring, Curve Dental, Dentrix Ascend, and Open Dental. Confidence levels noted per area.

---

## Table Stakes

Features users (doctors and patients) expect. Missing = product feels broken or amateur.

### 3D Capture Flow

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Guided sweep animation during capture | Users have no clinical training; animation is the only instruction | Medium | Animated overlay showing mouth zones with active highlight. Missing = unusable frames. |
| Real-time quality feedback during capture | Industry standard from Medit/iTero — users see green/red zones as they scan | High | Per-frame quality heuristics. Without this, failure is silent until upload. |
| Capture progress indicator (zones complete) | Multi-zone capture with no progress = users don't know when to stop | Low | Progress ring or zone checklist (upper arch, lower arch, left buccal, right buccal, anterior). |
| Capture failure recovery with retry per zone | A single bad zone should not force full rescan | Medium | Zone-level state machine: pending → capturing → confirmed → failed/retry. |
| Clear instructions before capture starts | Users need priming (lighting, angle, hold still) | Low | One-time modal or animated onboarding before first capture. |
| Camera permission handling with helpful error | Silent failure on permission deny = abandonment | Low | Explicit permission prompt with fallback instructions if denied. |

### 3D Model Viewer (Doctor)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Orbit, pan, zoom controls | Absolute baseline for any 3D viewer | Low | Mouse drag, pinch-zoom, right-click pan. Mobile touch must work. |
| Named tooth highlighting on hover | Doctors must identify specific teeth by number | Medium | FDI / Universal numbering system — hover or click shows tooth ID. |
| Reset to default view button | Single-click reset after deep zoom is standard in all 3D tools | Low | Home/reset icon in viewer toolbar. |
| Multiple view presets (upper, lower, left, right, anterior) | Doctors review specific arch regions; preset buttons save manual navigation | Medium | 6 standard dental views mirroring intraoral scan zones. |
| Loading state with spinner and placeholder | 3D mesh loads asynchronously; blank screen = broken | Low | Skeleton or spinner while GLB fetches from Supabase Storage. |
| Error state when mesh unavailable | Network or processing failures must be communicated | Low | Fallback to procedural arch + "3D model not yet available" message. |

### Clinical Annotation on 3D Model

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Click-to-annotate on mesh surface | Spatially placed clinical notes are the core value | High | Three.js raycasting on mesh → intersection point → place pin at x/y/z. |
| Annotation pins visible in 3D space | Pins must be spatially anchored, not floating UI overlays | Medium | World-space billboards or 3D markers at stored position. |
| Annotation text input on pin click | After placing pin, doctor types clinical note | Low | Popover or sidebar form with note textarea. |
| Annotation list panel alongside viewer | Doctors need to review all notes without rotating to each pin | Low | Sidebar list: tooth number, note excerpt, created date. |
| Annotation persistence across sessions | Annotations stored → still there next session | Low | Stored in scan_annotations table (planned in PROJECT.md). |

### Scan History and Comparison

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Chronological scan list with dates | Patients and doctors expect history browsing | Low | Date + thumbnail or status badge per scan. |
| Side-by-side 3D scan comparison | ScanCompare.tsx exists for 2D; 3D must follow | Medium | Dual-panel with shared orbit state; extend existing pattern. |
| Visual change indicator between scans | The reason comparison exists | High | Color overlay or mesh diff showing changed regions. |
| Scan status badges | Users need to know if a scan is usable | Low | Enum: processing / ready / reviewed / needs-review on scan cards. |

### Patient-Facing Experience

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Patient can view their own 3D model | Visceral engagement; seeing your own mouth in 3D is novel | Medium | Read-only orbit viewer at /patient/3d-view/:id. |
| Progress metric tied to scans | Existing streak system must reflect scan activity | Low | Scan submission → progress update via use-patient-data hook. |
| Scan history with status per scan | Patient must see their own timeline | Low | ScanHistory.tsx already exists; extend with 3D entry type. |
| Doctor feedback visible after scan review | Closes the care loop | Low | Already exists via chat + video response; link from scan context. |

### Practice Management / Doctor UX

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Patient list with search and filter | Unusable without search above ~20 patients | Low | Already exists in doctor/Overview.tsx. |
| Patient detail with scan history inline | One-stop patient record | Low | Already exists in PatientDetail.tsx. |
| Unreviewed scan queue / inbox | Doctors need to know what requires attention | Medium | Count badge + filterable scan list with status "needs review". |
| Notification for new scans | Doctor must know when patient submits | Medium | Supabase realtime on scans table insert → in-app alert. |
| HIPAA-compliant data handling | Non-negotiable for any dental PHI system | High | RLS + Supabase pattern already implemented; must extend identically to 3D scan data. |

### Platform Professionalism Signals

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| No crashes on bad data | Doctors encountering crashes lose trust immediately | Low | Null guards, .single() safety, Promise.allSettled() — flagged in PROJECT.md. |
| Camera stops when leaving capture | Camera LED staying on = privacy concern and broken UX | Low | Known bug in PROJECT.md; must fix before launch. |
| Loading states on all async operations | Blank screens after clicks feel broken | Low | Every fetch needs a skeleton or spinner. |
| Error messages that explain what happened | "Something went wrong" is unacceptable on clinical tools | Low | Context-aware: "Scan upload failed — check connection and retry." |
| Mobile-responsive capture and viewer | Patients use phones for capture and viewing | Medium | Touch controls (pinch-zoom, drag-orbit) required. |

---

## Differentiators

Features that create competitive advantage. Not universally expected, but meaningfully valued.

### 3D and AI Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI color overlay on 3D mesh (risk heat map) | Doctor sees exactly where plaque/recession is on the model spatially | High | Maps analyze-scan-teeth per-tooth findings to mesh regions. Red = attention, green = healthy. Planned in PROJECT.md. |
| Point-to-point measurement on mesh | Orthodontists and restorative dentists need mm-level measurements | High | Two raycasted points + Euclidean distance in Three.js world units. Planned in PROJECT.md. |
| Synced rotation in 3D comparison | Rotating one scan rotates the other — precise anatomical alignment | Medium | Shared camera state between two Three.js canvases. Planned in PROJECT.md. |
| Screenshot/export button | Doctors embed screenshots in treatment plans | Low | canvas.toDataURL() → download PNG. Planned in PROJECT.md. |
| AI-extracted key frames from video | Gallery of clinically significant frames from video scan | High | Frame-scoring heuristic or AI call. Planned in PROJECT.md. |
| Fallback procedural arch when no scan exists | Continuity of care visualization before first 3D scan | Low | TeethScene.tsx already exists; extend with per-tooth status coloring. |
| Temporal 3D comparison (change over time) | Bone loss and recession trends across months — clinical gold standard | Very High | Requires ICP mesh alignment. Defer to post-launch milestone. |

### Practice Management Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI copilot clinical notes | Saves 5-10 min per patient on documentation | High | Already exists; extend prompt context to include 3D findings. |
| Workflow automations | Reduces front-desk work for small practices | Medium | Already exists; extend triggers to include 3D scan submission events. |
| Doctor video response to patients | Async teleconsult; more personal than text for explaining findings | Medium | Already exists in RecordResponse.tsx. |
| Practice analytics with scan metrics | ROI evidence for practice owners | Medium | Already exists; extend with 3D scan counts and AI overlay usage. |
| Virtual consult booking from scan review | Doctor reviews 3D scan → immediately books follow-up | Medium | Add "Book Consult" CTA to 3D viewer sidebar. |

### Patient Experience Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Gamified oral health streak | Keeps patients engaged between visits | Low | Already exists in Progress.tsx. |
| "Your mouth in 3D" patient screen | Visceral engagement; drives word of mouth | Medium | /patient/3d-view/:id — planned in PROJECT.md. |
| AI summary in plain language | Findings explained without clinical jargon | Medium | Already exists; surface prominently in patient Home after scan review. |

---

## Anti-Features

Features to explicitly NOT build for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Real photogrammetry API integration (Polycam, Meshroom) | Vendor not chosen; premature integration = hard coupling to unvetted vendor | Stub process-3d-scan edge function returning sample GLB. Wire real API in separate milestone after evaluation. |
| Real-time co-annotation on 3D model | Requires CRDT/OT sync, multi-cursor UX — engineering cost far exceeds v1 value | Single-doctor annotations are sufficient; add collab post-launch. |
| Offline / PWA support | Service workers + 3D mesh caching + IndexedDB for HIPAA PHI creates compliance surface | Web-first with internet assumption. Revisit with mobile native milestone. |
| Mobile native app (iOS/Android) | Doubles platform surface area | Mobile web optimized browser experience. |
| Social login / OAuth | Adds auth dependencies; HIPAA audit trail cleaner with direct auth | Keep Supabase email auth. |
| AI scan analysis on individual video frames | Duplicates existing image AI; adds cost; video is for doctor review | Doctor reviews full video; AI quality analysis covers video submission. |
| DICOM import/export | EHR interoperability is a business development milestone | Note as future roadmap item for EHR integration. |
| Hardware scanner integration (Medit, iTero SDK) | Requires vendor partnerships and platform approval | Phone camera is the input device. |
| Complex dental billing / insurance claims | Separate SaaS category | Stripe subscription billing only. |

---

## Feature Dependencies

```
Camera permission grant
  → capture flow starts
  → frame extraction (30-60 frames from video stream)
  → frame upload to 3d-scans Supabase bucket
  → process-3d-scan edge function (stub returns sample GLB)
  → GLB URL stored in three_d_scans table

GLB stored in three_d_scans
  → MouthModelViewer.tsx loads GLB via Three.js GLTFLoader
  → Doctor 3D viewer renders with OrbitControls
  → Annotation raycasting enabled (click-to-pin)
  → scan_annotations stored on click (position_x/y/z + note)
  → Annotation list panel renders from scan_annotations query

GLB stored (2+ scans for same patient)
  → Side-by-side 3D comparison enabled
  → Synced camera rotation (shared orbit state)

analyze-scan-teeth (existing, per-tooth findings)
  → AI color overlay mapped to mesh regions (red/green gradient)

Scan submitted by patient
  → Doctor notification (Supabase realtime on scans insert)
  → Doctor opens ScanReview.tsx
  → "VIEW 3D MODEL" CTA → /doctor/3d-view/:scanId
  → 3D viewer + annotations + AI overlay
```

---

## What Makes Dental SaaS Feel Professional vs Amateur in 2025

**Professional signals:**
- Every destructive action has a confirmation dialog (delete scan, archive patient)
- Clinical data never disappears silently — soft deletes with audit trail
- Dates are consistent throughout the app (locale-aware, never mixed formats)
- Upload failures show specific feedback with retry — not just "error"
- 3D viewers include snap-to presets (upper occlusal, lower occlusal, buccal L/R, anterior) alongside free orbit
- Tooth numbering uses a recognized system (FDI or Universal Numbering System)
- Patient records show last contact date and last scan date at a glance on list views
- Loading states never last more than 3 seconds without progress feedback
- Color system used deliberately everywhere: red = attention/pathology, yellow = monitor, green = healthy
- No raw error codes or stack traces visible to clinical staff or patients

**Amateur signals:**
- Camera stream stays on after leaving capture (privacy and trust failure)
- Clicking submit twice submits twice (no loading lock or debounce)
- Rotating a 3D model resets to default on tab switch
- Annotations placed but not persisted after page reload
- "Something went wrong" as the only error message on clinical tools
- Inconsistent loading states (some actions have spinners, others silently block)
- Any unhandled null causing a visible crash or white screen for clinical staff

---

*Feature analysis: 2026-03-10*
