

# Arcline Complete Redesign — Batch 2: Doctor Portal + Landing + 3D Teeth

This is a large scope covering Phase B (3D Teeth), Phase D (Doctor Portal inline style cleanup), Phase E (Landing improvements), and Phase F (Accessibility). Given Lovable's per-message limits, this will be broken into sub-batches.

---

## Sub-Batch 2A: Doctor Portal Inline HSL Refactor + Dialog Standardization (This Session)

The doctor portal has **hundreds** of inline `style={{ background: "hsl(218 26% 11%)", ... }}` across 6 pages + the layout. These should all use Tailwind's dark theme CSS variables that already exist (`bg-card`, `border-border`, `text-muted-foreground`, etc.).

### Files & Changes

#### 1. `src/layouts/DoctorLayout.tsx`
- Replace `style={{ background: "hsl(216 32% 7%)", color: "hsl(38 23% 90%)" }}` on root div with `className="bg-background text-foreground"`
- Replace sidebar `style={{ background: "hsl(218 26% 11%)" }}` with `className="bg-card"`
- Replace sidebar border `style={{ borderRight: "1px solid hsl(0 0% 100% / 0.06)" }}` with `className="border-r border-border"`
- Replace nav item inline styles with Tailwind classes using existing theme tokens
- Replace `onMouseEnter`/`onMouseLeave` on sign-out button with `hover:bg-muted`
- Fix email text size from `text-[9px]` to `mono-label`

#### 2. `src/pages/doctor/Overview.tsx`
- Replace all `style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}` → `className="bg-card border border-border"`
- Replace `style={{ color: "hsl(38 23% 90% / 0.45)" }}` → `className="text-muted-foreground"`
- Replace `style={{ color: "hsl(228 100% 62%)" }}` → `className="text-primary"`
- Replace `style={{ color: "hsl(142 71% 45%)" }}` → `className="text-status-success"`
- Replace `style={{ color: "hsl(38 23% 90% / 0.6)" }}` → `className="text-foreground/60"`
- **Replace broadcast modal** (manual `fixed inset-0` overlay div) with `Dialog` component from `@/components/ui/dialog`
- Replace search input inline styles with `className="bg-background border-border"`
- Replace avatar inline styles with `className="bg-muted text-muted-foreground"`
- Replace progress bar inline styles with `className="bg-primary"` and `className="bg-muted"`
- Fix `text-[10px]` on avatar to `mono-label`

#### 3. `src/pages/doctor/ScanReview.tsx`
- Replace root `style={{ background: "hsl(216 32% 7%)" }}` → `className="bg-background"`
- Replace card `style={{ background: "hsl(218 26% 11%)" }}` → `className="bg-card border border-border"`
- Replace all floating pill inline styles with Tailwind classes
- Replace stat card `style={{ background: "hsl(220 24% 16%)" }}` → `className="bg-muted"`
- Replace quality color variables with Tailwind conditional classes (`text-status-success`, `text-status-warning`, `text-status-danger`)
- Replace detection tag inline colors with Tailwind
- Replace tab content inline styles (backgrounds, colors) with theme tokens
- Replace action button inline styles with proper Button variants
- Fix `text-[10px]` across buttons to `mono-label`

#### 4. `src/pages/doctor/Analytics.tsx`
- Replace `chartCardStyle` object with `className="bg-card border border-border"`
- Replace axis style inline font with Tailwind mono classes
- Replace all label `style={{ color: "..." }}` with `className="text-muted-foreground"`
- Replace shimmer placeholder inline styles with Tailwind `bg-primary/10`

#### 5. `src/pages/doctor/Consults.tsx`
- Replace all card inline styles with `className="bg-card border border-border"`
- Replace all text color inline styles with Tailwind classes
- Replace status badge inline styles with Tailwind conditional classes
- Fix `text-[9px]` on button to `mono-label`

#### 6. `src/pages/doctor/Automations.tsx`
- Replace all card inline styles with `className="bg-card border border-border"`
- Replace `onMouseEnter`/`onMouseLeave` on template cards with `hover:border-primary/30`
- Replace all text color inline styles with Tailwind classes
- Replace input inline styles with `className="bg-background border-border"`
- Replace button inline `style={{ background: "hsl(228 100% 62%)" }}` with `className="bg-primary text-primary-foreground"`

#### 7. `src/pages/doctor/Settings.tsx`
- Replace all ~20 card `style={{ background: "hsl(218 26% 11%)", border: "..." }}` with `className="bg-card border border-border"`
- Replace all `style={{ color: "hsl(38 23% 90% / 0.45)" }}` with `className="text-muted-foreground"`
- Replace specialty pill buttons inline styles with Tailwind conditional classes
- Replace availability slot inline styles with Tailwind
- Replace team invite inline styles with Tailwind
- Replace subscription progress bar inline styles with Tailwind
- Replace danger zone border color with `border-destructive/30`
- **Replace deactivation modal** (manual overlay div) with `Dialog` component
- Replace input inline styles with `className="bg-background border-border"`
- Fix `text-[9px]` font sizes to `mono-label`

### CSS Variable Additions
Add to `.dark` in `src/index.css`:
- `--bg-elevated: 220 24% 16%;` (for stat cards and input backgrounds — maps to current `hsl(220 24% 16%)`)

Add to `tailwind.config.ts`:
- `elevated: "hsl(var(--bg-elevated))"` under `colors`

This gives us `bg-elevated` as a Tailwind class for the slightly-lighter dark surfaces.

---

## Sub-Batch 2B: Landing Page + "How It Works" Section (Next Session)

- Add "How It Works" 3-step section between Features and Pricing
- Steps: Scan → AI Analysis → Doctor Review with connecting line
- Clean up phone mockup font sizes (currently 7-8px, increase to 9-10px minimum)
- Add mobile brand context on auth pages (show ARCLINE label above form on mobile)

## Sub-Batch 2C: 3D Teeth Visualization (Requires Spline URL)

The 3D teeth component requires a Spline scene file. Two options:
1. **With Spline**: Install `@splinetool/react-spline`, create wrapper component, integrate scene URL
2. **Without Spline**: Create an enhanced SVG/CSS 3D-like visualization with perspective transforms and gradients as a placeholder

The user will need to provide a Spline scene URL or confirm the placeholder approach.

## Sub-Batch 2D: Accessibility Polish (Final Pass)

- Ensure 44px touch targets on nav items, toggles
- Add ARIA labels to icon-only buttons (close, attachment, camera)
- Add visible focus rings
- Standardize loading skeletons

---

## Technical Approach

**Inline HSL → Tailwind mapping** (the core pattern for ~200 replacements):
```
"hsl(218 26% 11%)"     → bg-card
"hsl(216 32% 7%)"      → bg-background
"hsl(220 24% 16%)"     → bg-elevated (new) or bg-muted
"hsl(0 0% 100% / 0.07)" → border-border
"hsl(38 23% 90% / 0.45)" → text-muted-foreground
"hsl(38 23% 90%)"      → text-foreground
"hsl(228 100% 62%)"    → text-primary or bg-primary
"hsl(142 71% 45%)"     → text-status-success
"hsl(0 84% 60%)"       → text-destructive
"hsl(43 50% 54%)"      → text-gold
"hsl(0 0% 100% / 0.05)" → bg-muted or bg-white/5
```

**Dialog migration**: Import `Dialog, DialogContent, DialogHeader, DialogTitle` from `@/components/ui/dialog`. Replace manual overlay div with controlled Dialog. Preserves exact same content/functionality.

## Files Modified (Sub-Batch 2A)

| File | Estimated Inline Style Removals |
|------|------|
| `src/index.css` | Add `--bg-elevated` variable |
| `tailwind.config.ts` | Add `elevated` color token |
| `src/layouts/DoctorLayout.tsx` | ~15 inline styles → Tailwind |
| `src/pages/doctor/Overview.tsx` | ~35 inline styles → Tailwind + Dialog migration |
| `src/pages/doctor/ScanReview.tsx` | ~40 inline styles → Tailwind |
| `src/pages/doctor/Analytics.tsx` | ~15 inline styles → Tailwind |
| `src/pages/doctor/Consults.tsx` | ~12 inline styles → Tailwind |
| `src/pages/doctor/Automations.tsx` | ~18 inline styles → Tailwind |
| `src/pages/doctor/Settings.tsx` | ~50 inline styles → Tailwind + Dialog migration |

Total: ~200 inline style removals across 9 files.

