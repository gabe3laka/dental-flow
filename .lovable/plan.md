

# Plan: Replace 3D Tooth Map with Uploaded GLB Models + Unify 2D View

## Problems Identified

1. **3D mode shows "four sets of floating teeth"**: The current `dental-arch.glb` model likely contains multiple arch objects, and the code renders the entire scene graph without filtering. The model may also have incorrect scale/position causing duplicated appearance.

2. **Orientation is wrong**: The `rotation={[0.28, 0, 0]}` and camera presets may not match the new model's coordinate system.

3. **2D mode is inconsistent**: The `ToothChart2D` inside `TeethVisualization.tsx` uses different tooth IDs (`UR1`, `UL1`) than the landing page's `ToothArch.tsx` which uses FDI notation (`T11`, `T21`). The visual style also differs.

4. **Build errors**: 4 edge functions have `err.message` on `unknown` type — needs `(err as Error).message`.

## Changes

### 1. Copy uploaded GLB models to project
- Copy `user-uploads://teeth.glb` → `public/teeth.glb`
- Copy `user-uploads://free_teeth_base_mesh.glb` → `public/free_teeth_base_mesh.glb`
- We'll try `teeth.glb` first as the primary model. If it doesn't look right, fall back to `free_teeth_base_mesh.glb`.

### 2. Rewrite `TeethVisualization.tsx` — 3D mode
- Load the new GLB via `useGLTF("/teeth.glb")` instead of `/dental-arch.glb`
- Log the scene graph structure on first load to understand mesh names/hierarchy
- Apply materials: traverse all meshes, detect gum vs tooth by material name or vertex color, apply `MeshPhysicalMaterial` with enamel properties
- Fix orientation: adjust group rotation and camera presets to properly frame the new model (may need different values depending on model's coordinate system)
- Ensure only ONE instance renders (no duplicate primitives)
- Keep all interactivity: hover highlight, click select, orbit controls, view mode toggle

### 3. Rewrite `TeethVisualization.tsx` — 2D mode
- Replace the current `ToothChart2D` with the same visual approach used in `ToothArch.tsx` (the landing page component)
- Use FDI tooth notation (`T11`–`T48`) consistently
- Include the gum arch guide paths, hover tooltips with tooth ID + status, and the same ellipse styling
- Wire up `onToothSelect` callback

### 4. Update `TeethScene.tsx` (landing page)
- Load the new GLB model instead of `dental-arch.glb`
- Same material/orientation fixes

### 5. Fix build errors
- Fix `err.message` → `(err as Error).message` in 4 edge functions

## Files Modified

| File | Change |
|------|--------|
| `public/teeth.glb` | **New** — copied from upload |
| `public/free_teeth_base_mesh.glb` | **New** — copied from upload (backup) |
| `src/components/3d/TeethVisualization.tsx` | Load new GLB, fix orientation, unify 2D with ToothArch style |
| `src/components/landing/TeethScene.tsx` | Load new GLB, fix orientation |
| `supabase/functions/accept-team-invite/index.ts` | Fix `err` type |
| `supabase/functions/create-billing-portal/index.ts` | Fix `err` type |
| `supabase/functions/run-automations/index.ts` | Fix `err` type |
| `supabase/functions/seed-users/index.ts` | Fix `err` type |

