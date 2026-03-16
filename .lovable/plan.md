

# Plan: Anatomically Realistic 3D Teeth

## The Core Problem

The current teeth use `THREE.LatheGeometry`, which rotates a 2D profile around an axis — producing **rotationally symmetric cylinders/cones**. Real teeth are fundamentally **not rotationally symmetric**:

- **Incisors**: Flat, shovel-shaped (wide but thin front-to-back)
- **Canines**: Pointed but with a ridge, not a cone
- **Premolars**: Two cusps on top, oval cross-section
- **Molars**: Wide, flat occlusal surface with 4 cusps, roughly rectangular cross-section

`LatheGeometry` can never produce these shapes. This is why they look like pegs.

## Solution: ExtrudeGeometry with Shaped Cross-Sections

Replace `LatheGeometry` with `THREE.ExtrudeGeometry` using hand-crafted `THREE.Shape` outlines for each tooth type. Each tooth gets:

1. **A 2D cross-section shape** (the top-down footprint — oval for incisors, rectangular-ish for molars)
2. **An extrude path** that tapers from root to crown with proper curves
3. **Crown surface details** via vertex displacement for cusps on molars/premolars

### Tooth Geometry Approach

```text
Current (LatheGeometry):        New (ExtrudeGeometry):
    ╭─╮                            ╭────╮
    │ │  ← circular cross-section  │    │ ← oval/rectangular
    │ │                             │    │   cross-section
    ╰─╯                            ╰────╯
  (looks like a peg)             (looks like a real tooth)
```

**Per tooth type:**
- **Incisor**: Thin oval Shape (~0.12 wide × 0.06 deep), extruded along a curve that widens at the crown into a flat chisel edge
- **Canine**: Slightly rounder oval, extruded to a pointed tip with a labial ridge
- **Premolar**: Rounded rectangle shape, flat top with two bump vertices (buccal + lingual cusps)
- **Molar**: Wide rounded rectangle (~0.14 × 0.12), flat top with 4 cusp bumps, widest tooth

### Gum Improvements

- Color change from `#c87072` → `#d4878a` (more realistic pink, less saturated red)
- Add `meshPhysicalMaterial` with `transmission: 0.1` for subtle translucency (subsurface scattering approximation)
- Thicker gum ridge that wraps slightly around the base of each tooth

### Material Improvements

- Base tooth color: `#f5f0e8` (natural off-white) — status applied via emissive only, not base color
- Use `meshPhysicalMaterial` instead of `meshStandardMaterial`:
  - `clearcoat: 0.3` for enamel sheen
  - `clearcoatRoughness: 0.4`
  - Lower emissive intensities (0.25 instead of 0.4-0.5) for subtlety
- Slow rotation from `0.15` → `0.08` rad/s

### Lighting

- Add rim light from behind for depth separation
- Warmer key light for more natural tooth appearance

## Files Modified

| File | Change |
|------|--------|
| `src/components/3d/TeethVisualization.tsx` | Complete rewrite of tooth geometry (LatheGeometry → ExtrudeGeometry), new materials, gum improvements, lighting |

No new dependencies. No other files change — the component's props/API remain identical.

## Technical Details

Each tooth will be built with this pattern:

```typescript
function createToothShape(type: ToothType): THREE.Shape {
  // Returns the 2D footprint of the tooth (top-down view)
  // Incisor: thin oval | Canine: teardrop | Premolar: oval | Molar: rounded rect
}

function createToothGeometry(type: ToothType, wS: number, hS: number): THREE.BufferGeometry {
  const shape = createToothShape(type);
  const extrudeSettings = {
    steps: 12,
    depth: height,  // varies per type
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.005,
    bevelSegments: 3,
  };
  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  
  // Post-process: taper root end narrower, add cusp bumps to crown
  // by displacing vertices based on Y position
  
  return geo;
}
```

The vertex displacement pass will:
1. **Taper the root**: Vertices near Y=0 scale inward by ~40%
2. **Add cusps to molars/premolars**: Vertices near the crown (max Y) get pushed upward at cusp positions
3. **Round the crown edge**: Smooth transition at the top

This produces teeth that are visually distinct by type — flat incisors, pointed canines, bumpy molars — matching the reference image.

