

# Plan: Improve 3D Tooth Map Interactivity + 2D Tooth Visibility

## Changes

### 1. 3D Mode — Easier orbit + Reset button + Better click handling

**OrbitControls improvements:**
- Enable zoom (`enableZoom: true`) with limits (`minDistance: 2.5, maxDistance: 7`)
- Increase `rotateSpeed` from `0.45` → `0.7` for more responsive dragging
- Enable damping (`enableDamping: true, dampingFactor: 0.1`) for smooth deceleration
- Remove auto-rotation (it fights with user control)

**Reset View button:**
- Add a small "Reset View" button (icon: `RotateCcw` from Lucide) in the top-right corner of the 3D canvas
- On click, set `viewMode` back to `"both"` and use a ref to `OrbitControls` to call `.reset()` which snaps the camera back to the initial position

**Individual tooth click/select:**
- Track a `selectedTooth` state — when a mesh is clicked, highlight it with a bright emissive outline (increase `emissiveIntensity` to 0.5 and change emissive color to `#4f7cff`)
- Show the selected tooth name + status in the tooltip overlay (persistent, not just on hover)
- Call `onToothSelect` with the mesh name so parent components can show annotation panels

### 2. 2D Mode — White outline rings around each tooth

**Current problem:** All `no_data` teeth are `rgba(255,255,255,0.12)` with `0.5` stroke — they blend into the dark background.

**Fix:** Add a permanent thin white circle (`stroke: rgba(255,255,255,0.45)`, `strokeWidth: 1`, `fill: none`) behind every tooth ellipse, slightly larger (`rx+2, ry+2`). This creates a visible boundary for each tooth regardless of status. The status-colored fill ellipse sits inside it.

### 3. Files modified

| File | Change |
|------|--------|
| `src/components/3d/TeethVisualization.tsx` | All changes below |

**No new files or dependencies.**

### Technical details

- `OrbitControls` ref: use `useRef` and pass to the `<OrbitControls ref={controlsRef} />`. Call `controlsRef.current?.reset()` for the reset button.
- Reset button communicates from the outer React component into the R3F canvas via a shared state/ref pattern — pass a `resetTrigger` counter as a prop to `Scene`, and inside Scene use `useEffect` to call `controls.reset()` when it increments.
- Selected tooth state lives in the main component and is passed down to `DentalModel` so it can apply the highlight material, and to the tooltip overlay for persistent display.

