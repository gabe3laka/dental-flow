# Scanning Flow

End-to-end UX for the three core scanning scenarios in Arcline: onboarding, Scope (exterior), and Wand (interior).

Related: [3d-pipeline.md](./3d-pipeline.md) for the data path, [tech-stack.md](./tech-stack.md) for the stack.

## Onboarding scan (first-time, account creation)

Goal: capture a baseline within 90 seconds of signup so the patient sees value immediately.

1. **Account create** → email/phone OTP via Supabase Auth.
2. **Pre-flight** — short video (15 s) explains: "Hold your phone like this, slowly pan from your left cheek to your right." Sets expectations + reduces motion-blur scans.
3. **Permission grants** — camera + (optional) IMU. We *require* camera; IMU just improves pose priors.
4. **Hardware probe** — if a Scope is paired via BLE we activate the ring light and macro lens; otherwise fall back to bare phone camera at 1× zoom.
5. **Guided sweep** — on-screen target dot moves through five zones (already implemented in `src/components/3d/MouthPanorama.tsx`'s zone model). Patient follows the dot with their phone. We capture the full continuous video; the dot is just for pacing.
6. **Quality gate** — IMU-derived motion magnitude must exceed a parallax threshold; otherwise prompt "scan again, try moving the phone more." Prevents bad uploads.
7. **Upload + reconstruct** — chunked upload to Supabase Storage during capture, LingBot-Map dispatch on `status='uploaded'`. Patient sees a progress UI ("Building your 3D smile…") while pipeline runs.
8. **Result** — patient lands on their first 3D scan in the SuperSplat-based viewer with a doctor-recorded "welcome" overlay.

## Arcline Scope flow (exterior)

The Scope clips to the back of the phone, providing:

- **Macro lens** — sharp focus from 4–10 cm; reveals lip lines, smile arc, occlusion, gingival display.
- **Ring light** — eliminates the harsh shadows from indoor lighting that wreck photometric consistency between frames.

Capture:

1. Patient holds phone ~6–8 cm from mouth, smile open.
2. Slow horizontal sweep ear-to-ear (the on-screen progress bar advances).
3. Optional second pass with lips retracted (for orthodontic monitoring).

Output:
- Scan covers anterior teeth (incisors, canines, first premolars), labial gingiva, smile arc geometry.
- **Limitation**: posterior teeth (molars), occlusal surfaces, lingual surfaces are NOT captured by the Scope. Use the Wand for those.

Use cases:
- Cosmetic monitoring (whitening progress, gum-line stability, smile aesthetics).
- Orthodontic check-ins between in-clinic visits.
- Pre-consult intake — patient submits a Scope scan before their first appointment.

## Arcline Wand flow (interior)

The Wand is a tethered handheld with a small lens tip and a ring of LEDs at the tip. It's designed for the *inside* of the mouth.

Why a separate device:

- **Form factor.** A phone's ~7 mm camera bump can't reach molars or the lingual surfaces of incisors. The Wand's ~12 mm tip diameter does.
- **Lighting.** LEDs at the tip illuminate at the focal plane; phone-flash light bounces off the front teeth and leaves the back of the mouth dark. Even illumination → consistent photometry → cleaner LingBot-Map reconstruction.
- **Spatial accuracy.** With a fixed lens of known focal length and known tip-to-LED geometry, the Wand provides a *scale prior* the Scope-based phone capture cannot. LingBot-Map runs without intrinsics, but a known scale lets us convert "mm of recession" to a real metric — not just relative.

Capture:

1. Patient connects Wand via USB-C (or Lightning adapter).
2. Wand tip rests just inside the lips; on-screen guide shows a six-zone arch sweep (UR molar → UR premolar → upper anterior → UL premolar → UL molar → repeat for lower).
3. Each zone is ~5 seconds; total scan ~60 seconds.
4. Continuous video is uploaded; LingBot-Map runs in `--mode windowed` because the multi-loop sweep exceeds streaming-mode pose stability.

Use cases — both monitoring **and** custom fittings:

- **Monitoring** (no metrology guarantees): caries progression, gum recession trends, plaque maps, occlusal wear over time.
- **Custom-fitting**: grills, mouthguards, retainers, night guards. Wand's scale prior + multi-pass coverage gets us close enough for *most* indications. For aligners or implants we explicitly hand off to a clinical iTero/Trios scan.

## Monitoring vs clinical-grade — the line

Arcline is positioned as a *monitoring* product, not a replacement for clinical impressioning. The distinction:

| Property | Arcline (Scope/Wand) | Clinical (iTero, Trios, CEREC) |
| --- | --- | --- |
| Geometric accuracy | ±200–500 µm (visualization-tier) | ±20–50 µm |
| Calibration | None / scale prior from Wand | Factory-calibrated, structured-light |
| Capture environment | Patient's bathroom | Dental chair, controlled lighting |
| Output | Gaussian Splat (visual) + point cloud | High-accuracy STL mesh |
| Suitable for fabrication | Custom grills, basic night guards | Crowns, bridges, aligners, implants, anything the lab needs |
| Cadence | Daily / weekly | Per appointment ($$$, ~6 mo) |
| Cost / scan | ~$0.20 in compute | ~$50–150 in chair time |

We surface this distinction explicitly in the doctor portal. Each scan is tagged `monitoring` or `visualization` (see `ScanResult.tier` in `src/lib/scanning/types.ts`); fabrication-bound scans must be promoted to a clinical scan event.

## Failure modes & UX recovery

| Failure | Detection | Recovery |
| --- | --- | --- |
| Scan too short | <10 s capture | Re-scan prompt; the previous attempt is discarded client-side. |
| Insufficient parallax (phone barely moved) | IMU motion check pre-upload | Tutorial replay + re-scan. |
| LingBot-Map pose collapse | Server detects extrinsic drift > threshold | Auto-retry once with `--mode windowed`; if still failing, mark scan `failed` and notify patient. |
| 3DGS training NaN'd | gsplat training reports nan loss | Fall back to monitoring-tier (point cloud preview) and notify the doctor. |
| Bad lighting | Per-frame mean luminance variance high | Surface a "try again with better light" hint after upload completes (don't block — some signal is better than none). |
