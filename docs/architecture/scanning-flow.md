# Scanning Flow

End-to-end UX for the three core scanning scenarios in Arcline: onboarding, Scope (exterior), and Wand (interior). All three feed the **same** LingBot-Map → R3F point-cloud pipeline; the difference is hardware and capture path, not pipeline.

Related: [3d-pipeline.md](./3d-pipeline.md) for the data path, [tech-stack.md](./tech-stack.md) for the stack.

## Onboarding scan (first-time, account creation)

Goal: a usable 3D map within ~90 seconds of signup.

1. **Account create** → email/phone OTP via Supabase Auth.
2. **Pre-flight tip** — a short video (15 s) explains: "Hold your phone like this, slowly pan from your left cheek to your right." Sets expectations + reduces motion-blur scans.
3. **Permission grants** — camera + (optional) IMU. We *require* camera; IMU just improves pose priors.
4. **Hardware probe** — if a Scope is paired via BLE we activate the ring light and macro lens; otherwise the bare phone camera at 1× zoom is fine for the first scan.
5. **Guided sweep** — `/patient/scan` runs the recorder ([`src/pages/patient/ScanSubmission.tsx`](../../src/pages/patient/ScanSubmission.tsx)). Five staged hints rotate every ~5 seconds — "open wide", "tilt down", "turn left", etc. — to pace the patient.
6. **Quality gates** — minimum 10 s; max 45 s; target 25 s. Stop button locks until the minimum is reached.
7. **Upload + dispatch** — chunked upload to `scan-videos/{patient_id}/{ts}/raw_video.webm`, scans row inserted with `processing_status='queued'`, Edge Function `reconstruct-scan` POSTs to the GPU host. Patient lands on `/patient/scans/:id/results` with the "BUILDING YOUR 3D MAP…" placeholder.
8. **Result** — when LingBot finishes, the callback flips `processing_status='complete'` and writes `pointcloud_url`. Polling on the results page picks up the change and the R3F viewer renders the actual point cloud.

## Arcline Scope flow (exterior)

The Scope clips to the back of the phone:

- **Macro lens** — sharp focus from 4–10 cm; reveals lip lines, smile arc, occlusion, gingival display.
- **Ring light** — eliminates the harsh shadows from indoor lighting that wreck photometric consistency between frames.

Capture (~25 s):

1. Patient holds phone ~6–8 cm from mouth, smile open.
2. Slow horizontal sweep ear-to-ear; on-screen progress bar advances against the target duration.
3. Optional second pass with lips retracted (orthodontic monitoring).

Output:
- Covers anterior teeth (incisors, canines, first premolars), labial gingiva, smile arc geometry.
- **Limitation**: posterior teeth (molars), occlusal surfaces, lingual surfaces are NOT captured by the Scope. Use the Wand for those.

Use cases:
- Cosmetic monitoring (whitening progress, gum-line stability, smile aesthetics).
- Orthodontic check-ins between in-clinic visits.
- Pre-consult intake — patient submits a Scope scan before their first appointment.

## Arcline Wand flow (interior)

The Wand is a tethered handheld with a small lens tip and a ring of LEDs at the tip. It's designed for the *inside* of the mouth.

Why a separate device:

- **Form factor.** A phone's ~7 mm camera bump can't reach molars or the lingual surfaces of incisors. The Wand's ~12 mm tip diameter does.
- **Lighting.** LEDs at the tip illuminate at the focal plane; phone-flash bounces off the front teeth and leaves the back of the mouth dark. Even illumination → consistent photometry → cleaner LingBot reconstruction.
- **Spatial accuracy.** Fixed lens + known tip-to-LED geometry give a *scale prior* the Scope-based phone capture cannot. LingBot runs without intrinsics either way, but a known scale lets us convert "mm of recession" to a real metric — not just relative.

Capture (~60 s):

1. Patient connects Wand via USB-C (or Lightning adapter).
2. Wand tip rests just inside the lips; on-screen guide pages through six arch zones (UR molar → UR premolar → upper anterior → UL premolar → UL molar → repeat for lower).
3. Continuous video is uploaded; LingBot runs in `--mode windowed` because the multi-loop sweep exceeds streaming-mode pose stability.

Use cases — both monitoring **and** custom fittings:

- **Monitoring** (no metrology guarantees): caries progression, gum recession trends, plaque maps, occlusal wear over time.
- **Custom-fitting**: grills, mouthguards, retainers, night guards. The Wand's scale prior + multi-pass coverage gets us close enough for *most* of these. For aligners or implants we explicitly hand off to a clinical iTero/Trios scan.

## Monitoring vs clinical-grade — the line

Arcline is positioned as a *monitoring* product, not a replacement for clinical impressioning.

| Property | Arcline (Scope/Wand) | Clinical (iTero, Trios, CEREC) |
| --- | --- | --- |
| Geometric accuracy | ±200–500 µm | ±20–50 µm |
| Calibration | None / scale prior from Wand | Factory-calibrated, structured-light |
| Capture environment | Patient's bathroom | Dental chair, controlled lighting |
| Output | `.ply` point cloud, R3F-rendered | High-accuracy STL mesh |
| Suitable for fabrication | Custom grills, basic night guards | Crowns, bridges, aligners, implants, anything the lab needs |
| Cadence | Daily / weekly | Per appointment ($$$, ~6 mo) |
| Cost / scan | ~$0.02 in compute | ~$50–150 in chair time |

This distinction is surfaced explicitly in the doctor portal. Each scan row carries `scan_type` (`scope`/`wand`); fabrication-bound scans are still handed off to a clinical scan event.

## Failure modes & UX recovery

| Failure | Detection | Recovery |
| --- | --- | --- |
| Scan too short | <10 s capture | Stop button is locked until the minimum; can't submit. |
| Insufficient parallax (phone barely moved) | IMU motion check pre-upload (future v1.1) | Tutorial replay + re-scan. |
| LingBot pose collapse | Server detects extrinsic drift > threshold | Auto-retry once with `--mode windowed`; if still failing, mark `processing_status='failed'` and notify patient. |
| Upload failure mid-scan | `supabase.storage.upload` error | Toast with retry; the keyframes succeed independently so AI analysis still runs on partial data. |
| Bad lighting | Per-frame mean luminance variance high | Surface a "try again with better light" hint after upload completes (don't block — some signal is better than none). |
