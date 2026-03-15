

# Plan: Fix Build Errors + Arcline Complete Redesign

## Part 1 — Fix Build Errors (Immediate)

Two test files have TypeScript errors that need type casts.

### `src/test/logger.test.ts`
Add `as [string, Record<string, any>]` cast on all 7 destructuring lines (19, 27, 34, 41, 48, 55, 66):
```ts
const [tag, obj] = consoleErrorSpy.mock.calls[0] as [string, Record<string, any>];
```

### `src/test/protected-route.test.tsx`
Add double-cast through `unknown` on all 5 mock return lines (51, 58, 66, 74, 80):
```ts
mockUseAuth.mockReturnValue(baseAuthState({ suspended: true }) as unknown as ReturnType<typeof useAuth>);
```

---

## Part 2 — Arcline Complete Redesign

This is a massive redesign specification. Given the scope, it should be broken into multiple implementation phases. Here is the sequenced plan:

### Phase A: Design System Fixes (Foundation)
1. **Update `mono-label` minimum size** from 9px to 11px in `src/index.css`
2. **Lower noise texture z-index** from 9999 to 1
3. **Standardize card padding** — add utility classes for consistent 20px (`p-5`) padding
4. **Add spacing/radius design tokens** to tailwind config for `radius-xl`, consistent spacing scale
5. **Fix pricing** — align landing page ($149/$349) with PracticeSetup page

### Phase B: 3D Teeth Visualization
1. **Install `@splinetool/react-spline`** package
2. **Create `src/components/3d/TeethVisualization.tsx`** — Lazy-loaded Spline component with tooth status mapping, legend overlay, view toggle (Full/Upper/Lower)
3. **Replace `ToothArch` usage** in Patient Progress, Scan History, and Doctor Scan Review with the new 3D component
4. **Fallback**: Show existing 2D arch when Spline fails to load

### Phase C: Patient Portal Improvements
1. **Patient Home** — Narrow max-width to 480px, add avatar to header, improve card visual hierarchy with subtle shadows, fix bottom nav overlap
2. **Scan Submission** — Switch to rear camera (`facingMode: "environment"`), add visual zone guides, add re-capture per zone, add 3-second countdown
3. **Scan History** — Add badge counts to filter tabs, improve empty state with illustration
4. **Progress** — Integrate 3D tooth map, add scroll fade on milestones section
5. **Chat** — Add typing indicators, read receipts, improve input bar
6. **Profile** — Reorganize into accordion/tabs, use Dialog for pairing and category picker modals

### Phase D: Doctor Portal Improvements
1. **Refactor inline HSL styles** across all doctor pages to use CSS custom properties
2. **Standardize modals** — Replace inline overlay divs (Broadcast) with Dialog component
3. **Scan Review** — Integrate 3D TeethVisualization, improve spacing and information density
4. **Analytics** — Better empty states with shimmer placeholders
5. **Overview** — Wire AI insights to actual data patterns instead of client-side conditionals

### Phase E: Auth & Landing
1. **Login** — Add "Forgot Password" link
2. **Signup** — Add password strength indicator with requirements checklist
3. **Landing** — Fix pricing to $149/$349, add "How It Works" section, improve mobile hero layout
4. **Landing** — Add brand context on mobile (currently hidden left panel)

### Phase F: Accessibility & Polish
1. **Touch targets** — Ensure 44px minimum on all interactive elements
2. **Focus states** — Add visible focus rings for keyboard navigation
3. **ARIA labels** — Add to all icon-only buttons
4. **Loading states** — Standardize on Skeleton component across all pages
5. **Consistent button hierarchy** — Document and enforce primary/secondary/ghost usage

---

## Implementation Order

Given the scope, I recommend tackling this in order:
1. **Part 1** (build fixes) — immediate
2. **Phase A** (design system) — foundation for everything else
3. **Phase C** (patient portal) — highest user impact
4. **Phase D** (doctor portal) — second priority
5. **Phase B** (3D visualization) — requires Spline scene URL
6. **Phase E** (auth + landing) — conversion improvements
7. **Phase F** (accessibility) — polish pass

Each phase would be a separate implementation prompt to keep changes manageable and reviewable.

### Spline Dependency Note
The 3D teeth visualization requires a Spline scene file (`.splinecode`) with individually named tooth objects. You would need to either:
- Create this in Spline's editor (spline.design) and provide the scene URL
- Or use a pre-built dental model and import it into Spline

Without the scene URL, the 3D component can be built with a placeholder that swaps in when ready.

