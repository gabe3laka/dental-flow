

# Plan: Fix 3D Camera Snap-Back, Individual Tooth Clicks, and 2D Labels

## Problems

1. **Camera snaps back after rotation**: `CameraAnimator` runs `useFrame` every frame, continuously lerping the camera back to the preset position. This fights with `OrbitControls` — the user rotates, but the camera immediately pulls back. The animator should only activate when `viewMode` changes, then stop.

2. **Can't click individual teeth**: The `onClick` handler fires but the GLB model may have teeth as a single merged mesh or grouped hierarchy. Need to ensure each mesh gets its own pointer events by setting `raycast` properly and potentially splitting the model's scene graph so individual meshes are clickable.

3. **2D "UPPER" / "LOWER" labels too subtle**: The current labels exist but are `fontSize="6"` with `opacity="0.4"` — barely visible. Need to make them more prominent.

## Changes — Single File

**`src/components/3d/TeethVisualization.tsx`**

### Fix 1: CameraAnimator snap-back

Replace the always-running `useFrame` lerp with a **transition-based** approach:
- Track a `isAnimating` ref that becomes `true` when `viewMode` changes
- In `useFrame`, only lerp when `isAnimating` is true
- When the camera is within a small epsilon of the target, set `isAnimating = false` and stop lerping
- This lets OrbitControls take full control once the view-mode animation finishes

```text
viewMode changes → isAnimating = true → lerp each frame → reach target → isAnimating = false → OrbitControls has full control
```

### Fix 2: Individual tooth clicking

The current code attaches `onPointerOver/onClick` to `<primitive object={clonedScene}>`. R3F raycasting propagates to child meshes automatically, but the issue may be that gum meshes intercept clicks. Fix:
- During the `traverse` in `useMemo`, set `child.userData.isTooth = true` on tooth meshes and mark gum meshes with `child.raycast = () => {}` (disable raycasting on gums entirely) so clicks pass through to teeth
- This ensures only tooth meshes respond to pointer events

### Fix 3: 2D UPPER/LOWER labels

- Increase font size from `6` → `8`
- Increase opacity from `0.4` → `0.7`  
- Add slight letter-spacing and position them with more margin from the arch

