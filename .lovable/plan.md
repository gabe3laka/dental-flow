

# Arcline Complete Redesign — Implementation Plan

This plan covers the remaining phases (C through F) of the approved redesign. Given the massive scope, this will be broken into two implementation batches.

## Batch 1: Patient Portal + Auth Improvements (This Session)

### 1. Patient Home (`src/pages/patient/Home.tsx`)
- Narrow `max-w-lg` to `max-w-[480px]`
- Add user avatar circle (initials) next to Sign Out
- Replace hardcoded `text-[9px]` with `mono-label` (already 11px from Phase A)
- Replace inline HSL style on icon background with Tailwind `bg-primary/10`
- Add `pb-24` to prevent bottom nav overlap with Start Scan button
- Add subtle `shadow-sm` to cards for visual hierarchy differentiation
- Add vertical divider between stats columns in check-in card

### 2. Scan Submission (`src/pages/patient/ScanSubmission.tsx`)
- Switch camera from `facingMode: "user"` to `facingMode: "environment"` (rear camera for dental scans)
- Add zone guidance text: "Position your [upper teeth] in the frame" per zone
- Enable re-capture by allowing clicks on completed zone pills (currently navigates but doesn't re-capture)
- Replace inline HSL color for camera status with Tailwind `text-status-success` / `text-status-warning`
- Add review screen after all captures: 5 thumbnail grid with "Retake" per zone before submit
- Add "Usually reviewed within 24 hours" text below submit button

### 3. Chat (`src/pages/patient/Chat.tsx`)
- Replace inline HSL styles with CSS variables for bubble colors
- Remove hardcoded `text-[9px]` timestamps — use `mono-label`
- Replace inline style on empty state icon with Tailwind classes `bg-accent/20 text-accent`
- Add `pb-24` for bottom nav clearance

### 4. Profile (`src/pages/patient/Profile.tsx`)
- Replace inline pairing modal (card expansion) with proper `Dialog` component
- Replace inline category picker modal with `Dialog`
- Consolidate personal info into single card (Name + Email rows)
- Replace inline HSL styles with Tailwind classes

### 5. Progress (`src/pages/patient/Progress.tsx`)
- Add scroll fade indicators (gradient overlays) on milestones horizontal scroll
- Replace inline HSL styles in dark tooth map card with CSS custom properties
- Replace hardcoded `text-[9px]` with `mono-label`

### 6. Scan History (`src/pages/patient/ScanHistory.tsx`)
- Add badge counts to filter tabs
- Improve empty state with camera icon illustration and better CTA
- Replace inline HSL styles with CSS variables
- Replace hardcoded `text-[8px]` / `text-[10px]` with proper `mono-label`

### 7. Login (`src/pages/Login.tsx`)
- Add "Forgot password?" link below password field
- Add show/hide password toggle (Eye/EyeOff icon)

### 8. Signup (`src/pages/Signup.tsx`)
- Add password strength indicator bar below password field
- Add requirements checklist (8+ chars, contains number, special char)
- Show/hide password toggle

## Batch 2: Doctor Portal + Landing (Separate Session)

### Doctor Portal (Phase D)
- Refactor all inline `style={{ background: "hsl(218 26% 11%)" }}` across Overview, ScanReview, Analytics, Consults, Automations, Settings to use CSS custom properties (`bg-card`, `border-border`, `text-muted-foreground`)
- Replace broadcast modal's manual overlay div with `Dialog` component
- Improve Analytics empty state with shimmer placeholders
- Wire AI insights to data-driven patterns

### Landing Page (Phase E)
- Add "How It Works" 3-step section
- Add mobile brand context (currently hidden left panel on mobile auth pages)
- Verify pricing consistency ($149/$349) — already fixed in Phase A

### Accessibility (Phase F)
- Ensure 44px touch targets on all buttons
- Add ARIA labels to icon-only buttons
- Add visible focus rings

---

## Technical Approach

**Inline HSL removal strategy**: Replace `style={{ color: "hsl(X Y% Z%)" }}` with Tailwind utility classes that map to existing CSS variables. For doctor-specific colors that don't have variables, add new ones to the `.dark` theme in `index.css`.

**Dialog standardization**: Import existing `Dialog` / `DialogContent` / `DialogHeader` from `@/components/ui/dialog` for pairing modal and category picker — no new components needed.

**Password strength**: Simple client-side component using regex checks, renders colored bar segments + checklist. No new dependencies.

**Scroll fade**: CSS `mask-image` with `linear-gradient` on the milestones scroll container — pure CSS, no JS.

## Files Modified (Batch 1)

| File | Key Changes |
|------|-------------|
| `src/pages/patient/Home.tsx` | Avatar, max-width, shadows, pb-24, remove inline styles |
| `src/pages/patient/ScanSubmission.tsx` | Rear camera, zone guides, re-capture, review screen |
| `src/pages/patient/Chat.tsx` | Remove inline styles, pb-24, mono-label fixes |
| `src/pages/patient/Profile.tsx` | Dialog for pairing/category, consolidate info cards |
| `src/pages/patient/Progress.tsx` | Scroll fade, remove inline styles |
| `src/pages/patient/ScanHistory.tsx` | Badge counts, empty state, remove inline styles |
| `src/pages/Login.tsx` | Forgot password link, show/hide toggle |
| `src/pages/Signup.tsx` | Password strength indicator, requirements checklist |

No database changes required. No new dependencies needed.

