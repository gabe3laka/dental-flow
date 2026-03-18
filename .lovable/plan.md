

# Plan: Personalized 3D Tooth Map with Detection Overlays

## Problem

The 3D map currently shows a generic white tooth model with only emissive glow colors (green/amber/red) to indicate status. The user wants:

1. **Detection-specific visual effects on exact teeth** — plaque shown as yellow deposits, tartar as brown buildup, recession as exposed roots, inflammation as reddened gums near teeth
2. **Per-tooth material customization based on AI analysis** — each tooth's material should reflect what the AI found in the scan photos, not just a uniform glow

## Approach

True photogrammetric 3D reconstruction from 2D phone photos is not feasible in-browser. Instead, we will:

- **Enhance the AI analysis** to return per-tooth detection types (what condition, which surface)
- **Apply detection-specific materials** to individual tooth meshes in the 3D model, making each tooth visually distinct based on its findings
- **Add 3D overlay meshes** (small geometry patches) on affected teeth to represent deposits like plaque/tartar

This creates a personalized-looking model where you can see exactly which tooth has plaque (yellowish rough patches), which has tartar (brown calcified spots), recession (gum pulled back), etc.

## Changes

### 1. Enhance AI Analysis Output (`analyze-scan-teeth/index.ts`)

Update the tool schema to include per-tooth `detections` array:
```
teeth: [{
  id: "T14",
  zone: "Upper Right First Premolar",
  status: "attention",
  confidence: "87%",
  detections: [
    { type: "plaque", surface: "buccal", severity: "moderate" },
    { type: "tartar", surface: "lingual", severity: "mild" }
  ]
}]
```

This tells the 3D renderer exactly what to show and where on each tooth.

### 2. Add Detection Materials & Overlays (`TeethVisualization.tsx`)

**New prop**: `detectionData` — a record mapping tooth IDs to their detection arrays.

**Per-tooth material customization**:
- **Plaque**: Yellowish tint (`#e8d44d`), increased roughness (0.7), reduced clearcoat — looks like a film deposit
- **Tartar**: Brown-yellow tint (`#c4a43a`), high roughness (0.85), slight metalness — calcified appearance
- **Recession**: Normal tooth material but gum mesh near that tooth gets modified (color shifts to pale pink, slight transparency to show "exposed" root)
- **Inflammation**: Gum near affected teeth turns deep red (`#c0392b`) with increased emissive
- **Cavity**: Dark spot (`#4a3728`), very high roughness, no clearcoat
- **Healthy/On-track**: Standard clean enamel (current look)

**Implementation**: After FDI ID assignment in the `clonedScene` useMemo, iterate through `detectionData` and apply detection-specific material overrides per tooth. For plaque/tartar, create a secondary semi-transparent mesh (clone of tooth geometry, slightly scaled up by 1.002) with the deposit material — this creates a visible "layer" effect on the tooth surface.

### 3. Update `DentalModel` Component

Add `detectionData` prop alongside existing `toothData`:
```typescript
interface ToothDetection {
  type: "plaque" | "tartar" | "recession" | "cavity" | "inflammation" | "crowding" | "spacing";
  surface?: "buccal" | "lingual" | "occlusal" | "mesial" | "distal";
  severity?: "mild" | "moderate" | "severe";
}

// DentalModel receives:
detectionData?: Record<string, ToothDetection[]>;
```

After mesh splitting and FDI assignment:
- For each tooth with detections, replace its enamel material with a detection-specific material
- For deposit-type detections (plaque, tartar), add a semi-transparent overlay mesh
- For gum-related detections (recession, inflammation), modify nearby gum mesh color

### 4. Pass Detection Data from ScanResults/ScanHistory

Extract detection info from `ai_analysis.teeth[].detections` and pass as the new `detectionData` prop to `TeethVisualization`.

### 5. Update Hover/Selection Info

When a tooth with detections is hovered or selected, show the detection type in the tooltip and bottom info bar (e.g., "T14 · Upper Right First Premolar · PLAQUE, TARTAR").

## Files Modified

| File | Changes |
|------|---------|
| `src/components/3d/TeethVisualization.tsx` | Add `detectionData` prop, detection-specific materials, overlay meshes, updated tooltips |
| `src/pages/patient/ScanResults.tsx` | Extract and pass `detectionData` from `ai_analysis` to `TeethVisualization` |
| `src/pages/patient/ScanHistory.tsx` | Same — pass `detectionData` |
| `src/pages/patient/Progress.tsx` | Same — pass `detectionData` from latest scan |
| `supabase/functions/analyze-scan-teeth/index.ts` | Add `detections` array to per-tooth schema |

## Visual Result

A tooth with plaque will have a visible yellowish rough film on it. A tooth with tartar will show brown calcified deposits. Recession will show the gum pulled back. When the user rotates the 3D model, they see exactly which teeth have which issues — it looks personalized to their mouth rather than a generic template.

