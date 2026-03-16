

# Plan: Model-Driven 3D Tooth Identification

## Root Cause

The current approach uses **hardcoded coordinate regions** (`TOOTH_REGIONS_UPPER/LOWER`) that are arbitrary guesses disconnected from the actual `teeth.glb` geometry. These regions don't match the real model, so tooth identification is inaccurate and breaks when the user rotates/zooms.

## Solution: Derive Tooth Mapping From the Model Itself

Instead of hardcoded regions, **dynamically build the tooth map during scene traversal** by analyzing each mesh in the GLB.

### Approach (works for both individual and merged meshes)

**Step 1: Catalog every non-gum mesh during traversal**

In the existing `useMemo` that clones the scene, for each tooth mesh:
- Compute its bounding box center (in local model space)
- Store it as `child.userData.toothId` and `child.userData.center`
- Build a `meshToothMap: Map<THREE.Mesh, string>` that maps each mesh object to an FDI tooth ID

**Step 2: Sort meshes by position to assign FDI IDs**

- Separate meshes into upper (positive y center) and lower (negative y center) groups
- Within each group, sort by x-coordinate (left to right from the model's perspective)
- Assign FDI IDs in dental order: upper right molars → incisors → upper left molars (T18→T11, T21→T28), same for lower

This is deterministic and tied to the model geometry — no guessing.

**Step 3: Use `e.object` directly in click/hover handlers**

R3F raycasting already returns the specific mesh that was hit via `e.object`. Instead of converting hit points through an inverse matrix and searching hardcoded regions:
- Look up `e.object.userData.toothId` directly
- This works at any zoom level or rotation because it's mesh-based, not coordinate-based

**Step 4: Fallback for merged meshes**

If the model has only a few large meshes (e.g., entire upper jaw as one mesh), fall back to nearest-center matching using the dynamically computed centers from Step 1, which is still more accurate than the current hardcoded approach.

### Changes — Single File

**`src/components/3d/TeethVisualization.tsx`**

| Change | Details |
|--------|---------|
| Remove hardcoded `TOOTH_REGIONS_UPPER/LOWER` | Delete lines 24–63 and `identifyToothFromPoint` |
| Add dynamic mesh cataloging in `useMemo` | During traversal, compute each tooth mesh's bounding box center, sort by position, assign FDI IDs |
| Store mesh-to-tooth mapping in a ref | `meshToothMap` ref maps `THREE.Mesh` → FDI ID string |
| Simplify `handleOver`/`handleClick` | Use `e.object.userData.toothId` directly instead of inverse matrix + region lookup |
| Keep fallback for merged meshes | If `e.object.userData.toothId` is missing, use nearest-center from dynamic centers |
| Remove `inverseMatrix` ref and `getToothIdFromEvent` | No longer needed since identification is mesh-based |

### How the FDI Assignment Works

```text
Upper arch (y > 0), sorted by x position:
  Rightmost → T18 (3rd molar)
  ...
  Center-right → T11 (central incisor)
  Center-left → T21 (central incisor)  
  ...
  Leftmost → T28 (3rd molar)

Lower arch (y < 0), same pattern:
  Rightmost → T48, ... T41, T31, ... T38 leftmost
```

This mapping is derived from the model's actual geometry, so it's always accurate regardless of zoom, rotation, or camera position.

