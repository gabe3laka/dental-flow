

# Plan: Fix 3D Tooth Selection, Hover Highlight, and Tooltip Placement

## Problems Identified

1. **Individual tooth selection not working**: The `TOOTH_REGIONS` mapping uses hardcoded coordinate ranges that likely don't match the actual model geometry. The hit-point detection identifies a tooth ID, but the `selectedTooth` comparison on line 282 compares against `child.name` (the mesh name from the GLB), not the FDI ID. Since the model likely has only 2-3 large meshes (upper jaw, lower jaw, gums), `child.name` will never equal "T11" etc. The highlight never applies.

2. **Hover not highlighting the specific tooth area**: Same root issue — the hover handler increases emissive on `e.object` (the whole jaw mesh), not a localized area. With merged meshes, hovering anywhere lights up the entire jaw.

3. **Tooltip shows outside the white card**: The tooltip (lines 704-714) uses `absolute top-2 left-2` positioning on the outer wrapper div, which places it outside/above the 3D canvas area. It should be inside the canvas container div.

## Solution

### Fix 1: Move tooltip inside the canvas container
Move the hover/selected tooltip from lines 704-714 into the canvas container div (line 669) so it overlays on top of the 3D view inside the card, not outside it.

### Fix 2: Improve hover visual feedback
Since the model has merged meshes, we can't highlight individual teeth geometrically. Instead:
- Show a **tooltip that follows the mouse** inside the 3D container, displaying the identified tooth ID + status
- Track mouse position relative to the container using `onPointerMove` on the canvas wrapper div
- This gives clear visual feedback of which tooth the cursor is over

### Fix 3: Better tooth identification from hit point
- Add a `console.log` of `e.point` in the click handler to help calibrate the `TOOTH_REGIONS` mapping
- Use the `z` coordinate in addition to `x`/`y` for better differentiation (the arch curves in z-space, which helps distinguish upper from lower and front from back teeth)
- The current regions only use x/y ranges — adding z or using nearest-distance with better calibrated centers will improve accuracy

### Fix 4: Visual selection indicator
Since we can't highlight individual teeth on a merged mesh, show selection state via:
- A persistent tooltip inside the card showing the selected tooth ID + status badge
- When a tooth is selected, show it as a small info bar at the bottom of the 3D canvas area

## Changes — Single File

**`src/components/3d/TeethVisualization.tsx`**

| Change | Details |
|--------|---------|
| Move tooltip inside canvas container | Relocate the tooltip div from line 704 into the `div` at line 669, so it overlays inside the card |
| Add mouse-tracking tooltip on hover | Track `onPointerMove` on the canvas wrapper, convert to local coords, show floating tooltip at cursor position inside the 3D area |
| Log hit points for calibration | Add `console.log` of local point coords in click handler to verify/tune `TOOTH_REGIONS` |
| Add bottom info bar for selection | When `selectedTooth` is set, show a small bar at the bottom of the 3D canvas area with the tooth ID, status, and a dismiss button |
| Use z-coordinate in tooth identification | Expand `ToothRegion` to include z-range for better upper/lower differentiation |

