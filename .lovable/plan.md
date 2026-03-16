

# Plan: Fix 3D Individual Tooth Selection + 2D Labels

## Problem Analysis

### 3D: Selecting entire jaw instead of individual teeth
The GLB model (`teeth.glb`) likely has all upper teeth merged into one mesh and all lower teeth merged into another. When you click, `e.object` returns the entire jaw mesh, not an individual tooth. The code already handles click events correctly — the issue is the model structure itself.

**Fix approach**: Add a debug log during scene traversal to print all mesh names. Then, regardless of model structure, use **raycasting with face/position detection** to determine which tooth was clicked based on the hit point's position along the arch. Map the click position to the nearest FDI tooth ID using a position-to-tooth lookup table. This gives individual tooth identification even on merged meshes.

### 2D: UPPER/LOWER labels not visible enough
The labels exist but are at y=8 and y=299, right at the edges of the 300px viewBox — likely clipped or hard to see. The user wants them "on the same plane as where the teeth are showing."

**Fix**: Move labels inside the arch area — place "UPPER" centered between the upper arch teeth (around y=75) and "LOWER" centered between the lower arch teeth (around y=225). Increase font size and opacity.

## Changes — Single File

**`src/components/3d/TeethVisualization.tsx`**

### 1. 3D individual tooth detection via hit-point mapping

- Add a `TOOTH_REGIONS` lookup: an array of 32 entries mapping FDI tooth IDs to approximate 3D bounding positions (x/y ranges) on the arch
- In `handleClick` and `handleOver`, use `e.point` (the world-space intersection point) to find the nearest tooth region
- Transform `e.point` into model-local coordinates using the group's inverse world matrix
- Return the matched FDI tooth ID (e.g., "T11") instead of the raw mesh name
- This works regardless of whether the model has individual or merged tooth meshes

### 2. Add scene graph debug logging

- In `DentalModel`, add a one-time `useEffect` that traverses the cloned scene and logs each mesh name, type, and vertex count to the console
- This helps diagnose the model structure for future improvements

### 3. 2D labels repositioned inside the arch

- Move "UPPER" label to `y=75` (center of upper arch area)
- Move "LOWER" label to `y=225` (center of lower arch area)
- Increase font size to `10`, opacity to `0.5`, add subtle styling

## Files Modified

| File | Change |
|------|--------|
| `src/components/3d/TeethVisualization.tsx` | Hit-point tooth detection, debug logging, 2D label repositioning |

