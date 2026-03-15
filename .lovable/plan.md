

# Arcline UI/UX Refinement — Implementation Plan

This plan addresses the comprehensive redesign prompt across 3 batches, prioritized by visual impact and clinical credibility.

---

## Batch 1: Clinical Credibility + Navigation (This Session)

### 1. Replace Gradient Orb with Progress Ring
**Files:** `src/pages/patient/Home.tsx`, `src/pages/patient/Progress.tsx`

Remove the `GradientOrb` component usage and replace with an Apple Watch-style circular progress ring:
- ~100px diameter SVG ring with blue arc on muted track
- Fraunces serif percentage centered inside
- Animated on mount (0 → value over 800ms via CSS transition)
- Below ring: colored dot + status text ("On Track" / "Needs Attention" / "Review Pending")
- Contextual subtext: "Week X of Y" or "X scans completed"
- Wrap in a white card with "TREATMENT PROGRESS" mono-label header
- Create as `src/components/ui/progress-ring.tsx` for reuse

### 2. Bottom Nav with Icons + FAB
**File:** `src/components/patient/PatientBottomNav.tsx`

- Add Lucide icons to each nav item: Home, ScanLine, TrendingUp, MessageCircle, UserCircle
- Icon 24px above 11px text label
- Active state: blue icon + text + 2px top border
- Height: 64px + `pb-[env(safe-area-inset-bottom)]`
- Background: `bg-background/80 backdrop-blur-lg`

**File:** `src/pages/patient/Home.tsx`
- Replace inline "Start Scan" button with a fixed floating action button (FAB)
- 56px circle, `bg-primary`, white Camera icon, `shadow-lg`, centered above bottom nav
- `aria-label="Start new scan"`

### 3. Font Size Cleanup (Global)
Fix all `text-[7px]`, `text-[8px]`, `text-[9px]`, `text-[10px]` across the app:

| File | Count | Fix |
|------|-------|-----|
| `src/components/ui/status-badge.tsx` | `text-[9px]` | → `text-[11px]` (mono-label size) |
| `src/components/landing/HeroPhoneMockup.tsx` | ~12 instances of 7-9px | → minimum 9px for phone UI (contextually tiny is OK inside mockup, but bump to 9px minimum) |
| `src/pages/Landing.tsx` | ~25 instances of `text-[10px]` | → `mono-label` class or `text-[11px]` |
| `src/layouts/DoctorLayout.tsx` | 2 instances of `text-[10px]` | → `mono-label` |
| `src/pages/patient/Chat.tsx` | `text-[10px]` on DR avatar | → `text-xs` |
| `src/components/landing/HeroOverlays.tsx` | `text-[8px]`, `text-[9px]` | → `text-[11px]` |

### 4. Improved Empty States
**File:** `src/pages/patient/ScanHistory.tsx` — Replace bare empty state with:
- 3-step "How it works" mini-guide (Camera → RotateCw → Sparkles icons)
- "Takes only 60 seconds · Reviewed within 24 hours" reassurance text
- Clear CTA button

**File:** `src/pages/patient/Chat.tsx` — Add doctor preview placeholder:
- "Once Dr. [Name] reviews your scans, you'll see personalized feedback here"

---

## Batch 2: 3D Teeth Polish + Dark Theme Integration (Next Session)

### 5. Teeth Visualization Polish
**File:** `src/components/3d/TeethVisualization.tsx`

The current model uses LatheGeometry with basic profiles. To improve anatomical accuracy:
- Refine tooth profiles: wider/flatter molars, pointed canines, flat incisors with distinct shapes
- Improve gum color to more realistic `#d4878a` with subsurface scattering approximation (translucent material)
- Base tooth color: `#f5f0e8` (natural off-white) instead of status-tinted base
- Reduce emissive intensity to 0.3 (currently 0.4-0.5) for subtlety
- Slow auto-rotation to 0.08 rad/s (currently 0.15)

### 6. Tooth Map Dark Card Integration
**File:** `src/pages/patient/Progress.tsx`

- Move "TOOTH MAP" label above the dark card (not inside)
- Smooth transition: add `shadow-xl` and proper `rounded-2xl` to feel like "embedded medical display"
- Remove remaining `style={{ background: "hsl(var(--card))" }}` inline styles (3 instances)
- Use `bg-[#111820]` directly on container for consistent dark embed

### 7. Landing Page Phone Mockup
**File:** `src/components/landing/HeroPhoneMockup.tsx`

- Replace all inline styles with Tailwind classes where possible
- Bump minimum font size inside phone to 9px (acceptable for mockup context)
- Clean up floating badges: use proper CSS tokens instead of inline `hsl()` and `rgba()`

---

## Batch 3: Trust Markers + Doctor Portal Polish (Future Session)

### 8. Trust & HIPAA Markers
- Add "HIPAA Compliant" shield badge to patient portal footer area
- Add "Last reviewed by Dr. [Name] on [Date]" to scan review results
- Add tooltips for medical terminology

### 9. Doctor Portal Font/Nav Fixes
**File:** `src/layouts/DoctorLayout.tsx`
- Fix `text-[10px]` on nav items and sign-out button → `mono-label`

### 10. Chat UX Improvements
- Increase send button from 32px to 44px touch target
- Add typing indicator placeholder (visual only)

---

## Technical Approach

**Progress Ring**: Pure SVG component with CSS `transition` on `stroke-dashoffset`. No animation library needed. Accepts `value`, `size`, `status` props.

**FAB positioning**: `fixed bottom-[88px] left-1/2 -translate-x-1/2 z-40` to sit above the 64px bottom nav.

**Font cleanup strategy**: Search-and-replace `text-[10px]` → `mono-label` where the element already has `font-mono uppercase tracking-[0.15em]` (redundant classes). For standalone cases, use `text-[11px]`.

**Safe area**: Use `pb-[env(safe-area-inset-bottom,0px)]` on bottom nav for notched devices.

## Files Modified (Batch 1)

| File | Changes |
|------|---------|
| `src/components/ui/progress-ring.tsx` | **New** — Reusable SVG progress ring |
| `src/components/patient/PatientBottomNav.tsx` | Icons, height, safe-area, blur bg, active indicator |
| `src/pages/patient/Home.tsx` | Progress ring card replaces orb, FAB replaces inline button |
| `src/pages/patient/Progress.tsx` | Progress ring card replaces orb |
| `src/pages/patient/ScanHistory.tsx` | Enhanced empty state with how-it-works guide |
| `src/pages/patient/Chat.tsx` | Fix font sizes, improved empty state text |
| `src/components/ui/status-badge.tsx` | Fix `text-[9px]` → `text-[11px]` |
| `src/layouts/DoctorLayout.tsx` | Fix `text-[10px]` → `mono-label` |
| `src/pages/Landing.tsx` | Fix ~25 font size violations |
| `src/components/landing/HeroPhoneMockup.tsx` | Bump minimum font to 9px |
| `src/components/landing/HeroOverlays.tsx` | Fix font sizes |

No database changes. No new dependencies.

