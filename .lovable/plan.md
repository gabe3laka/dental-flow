

# Plan: Add 3D+ Scan Button to Progress Page Tooth Map

## What
Add a "3D+ Scan" CTA button to the Progress page's tooth map section, matching the same button already present in `ScanResults.tsx`. This gives patients a direct path to the guided 7-zone capture from their progress dashboard.

## Changes

### `src/pages/patient/Progress.tsx`
Add a "3D+ Scan" button below the quality bar inside the tooth map card (lines ~278-283), styled identically to the one in `ScanResults.tsx`:
- Full-width `rounded-pill` button with `bg-primary text-primary-foreground`
- Text: "Scan with 3D+" with a camera or sparkle icon
- Navigates to `/patient/scan/3d-plus`
- Placed inside the card, after the "Reflects your latest scan" text

No other files need changes — the route and capture page already exist.

