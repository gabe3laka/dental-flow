

# Plan: 3D Teeth Visualization + Integration

## Summary

Replace the 2D SVG `ToothArch` component with an interactive 3D teeth model using the already-installed `@react-three/fiber` and `@react-three/drei`. No new dependencies needed. The existing `TeethScene.tsx` provides a foundation but is never imported anywhere — we'll create a new production-ready component.

## Approach

**Why react-three-fiber instead of Spline**: The project already has `@react-three/fiber@^8.18.0`, `@react-three/drei@^9.122.0`, and `three@^0.160.1` installed. No Spline scene URL is available. Building with R3F gives full programmatic control over tooth colors, hover states, and camera presets.

## New Component: `src/components/3d/TeethVisualization.tsx`

A self-contained React Three Fiber Canvas showing anatomically positioned upper + lower arches (like the uploaded reference image — open mouth with pink gums):

- **32 teeth** along two U-shaped arch curves, each with a unique ID (`tooth_1` through `tooth_32`)
- **Pink gum meshes** (extruded along arch curves, matching `TeethScene.tsx` pattern)
- **Status coloring**: Each tooth's material color/emissive changes based on status prop:
  - `on_track` → green emissive glow
  - `deviation` → amber emissive glow
  - `attention` → red emissive glow
  - `no_data` → gray, no glow
- **Auto-rotation** (slow Y-axis, pausable on drag via `OrbitControls`)
- **Hover**: Tooth brightens + tooltip with tooth ID and status
- **View toggle**: `both` | `upper` | `lower` — animates camera position
- **Props**: `toothData: Record<string, string>`, `viewMode`, `onToothSelect`, `className`, `compact` (smaller for scan history cards)
- **Loading fallback**: Skeleton placeholder while Canvas initializes

## Integration Points (5 files)

| File | Current | Change |
|------|---------|--------|
| `src/pages/patient/Progress.tsx` | `<ToothArch>` | Replace with `<TeethVisualization>` + view toggle pills |
| `src/pages/doctor/ScanReview.tsx` | `<ToothArch>` | Replace with `<TeethVisualization>` (full size) |
| `src/pages/patient/ScanHistory.tsx` | `<ToothArch>` in expanded cards | Replace with `<TeethVisualization compact>` |
| `src/pages/doctor/PatientDetail.tsx` | `<ToothArch>` in progress tab | Replace with `<TeethVisualization>` |
| `src/pages/public/SharedProgress.tsx` | `<ToothArch>` | Replace with `<TeethVisualization>` |

The `HeroPhoneMockup.tsx` will NOT embed a full R3F Canvas (too heavy for a decorative phone screen). Instead, the existing SVG arch in the mockup stays — the 3D model is for functional pages.

## Component Architecture

```text
TeethVisualization (wrapper div)
├── View Toggle Pills (both/upper/lower)
├── Canvas (R3F)
│   ├── Lights (ambient + 2 directional + point)
│   ├── Environment (studio preset)
│   ├── OrbitControls (auto-rotate, drag to pause)
│   ├── DentalModel (group)
│   │   ├── UpperArch
│   │   │   ├── GumMesh (extruded pink shape along curve)
│   │   │   └── Tooth × 16 (LatheGeometry, status-colored)
│   │   └── LowerArch
│   │       ├── GumMesh
│   │       └── Tooth × 16
│   └── Camera animation (lerp to preset on view change)
├── Legend Row (On Track / Deviation / Attention / No Data)
└── Hover Tooltip (absolute positioned div)
```

## Files Modified/Created

1. **Create** `src/components/3d/TeethVisualization.tsx` — Main component (~250 lines)
2. **Edit** `src/pages/patient/Progress.tsx` — Swap ToothArch → TeethVisualization
3. **Edit** `src/pages/doctor/ScanReview.tsx` — Swap ToothArch → TeethVisualization
4. **Edit** `src/pages/patient/ScanHistory.tsx` — Swap ToothArch → TeethVisualization compact
5. **Edit** `src/pages/doctor/PatientDetail.tsx` — Swap ToothArch → TeethVisualization
6. **Edit** `src/pages/public/SharedProgress.tsx` — Swap ToothArch → TeethVisualization
7. **Keep** `src/components/patient/ToothArch.tsx` — Retained as fallback, not deleted
8. **Keep** `src/components/landing/TeethScene.tsx` — Unused but retained

No database changes. No new dependencies.

