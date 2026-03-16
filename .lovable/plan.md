

# Plan: Personalized 3D Tooth Map, AI Analysis Polling, and Progress Page Refocus

## Three Core Problems

1. **ScanHistory/ScanResults show a generic 3D tooth model** — it should reflect the user's actual AI analysis data (tooth statuses mapped from `ai_analysis.teeth`)
2. **"AI analysis processing..." never resolves** — `analyze-scan-teeth` is called fire-and-forget; ScanResults loads once and never re-checks for updated `ai_analysis`
3. **Progress page has too much clutter** — user wants it focused on the tooth map, next action, milestones, scan activity, and scan history link (remove AI Insight section)

---

## Changes

### 1. Pass AI Analysis Data to TeethVisualization

Currently `TeethVisualization` receives `toothData={}` (empty) everywhere in the patient UI. The AI analysis already returns per-tooth data with `id`, `zone`, `status` fields.

**ScanHistory.tsx** — fetch `ai_analysis` column for each scan, parse `ai_analysis.teeth` into a `Record<string, ToothStatus>` mapping, and pass it as `toothData` prop to `TeethVisualization`.

**ScanResults.tsx** — same: derive `toothData` from `scan.ai_analysis.teeth` and pass to `TeethVisualization`. Also pass detection tags as annotation overlays on the 3D model by mapping tooth statuses.

**Mapping logic** (shared helper):
```
function aiTeethToToothData(teeth: any[]): Record<string, ToothStatus> {
  const map: Record<string, ToothStatus> = {};
  for (const t of teeth) {
    const id = t.id; // e.g. "T14"
    const status = t.status;
    if (status === "on_track" || status === "healthy") map[id] = "on_track";
    else if (status === "deviation") map[id] = "deviation";
    else map[id] = "attention";
  }
  return map;
}
```

This makes the 3D model highlight teeth with issues in amber/red based on the actual scan analysis, personalizing it to the user's mouth.

### 2. Fix "AI Analysis Processing..." with Polling

**ScanResults.tsx** — when `scan.ai_analysis` is null/empty on initial load, poll the `scans` table every 3 seconds (up to 10 attempts) until `ai_analysis` is populated. Once populated, update state and stop polling. Show a proper loading spinner with "Analyzing your scan..." text instead of the static italic message.

**ScanHistory.tsx** — when expanding a scan that has no `ai_analysis`, fetch it from the DB (it's not currently in the select list). Add `ai_analysis` to the scan query.

### 3. Refocus Progress Page

Remove the "AI INSIGHT" card section. Keep:
1. Hero progress ring + treatment category
2. Horizontal stat pills
3. **3D Tooth Map** (moved up, made larger/more prominent, with `toothData` from latest scan's `ai_analysis`)
4. Scan Activity Chart
5. Detection Trends
6. Next Action Card
7. Milestones
8. View Scan History + Share Progress buttons

### 4. Detection Annotations on 3D Map

When a user taps a detection tag in expanded ScanHistory or ScanResults while viewing the 3D map, highlight the affected teeth on the model by updating the `toothData` to show those specific teeth in "attention" status. Add a small info panel below the 3D map showing the selected detection's description from the education dictionary.

---

## Files Modified

| File | Changes |
|------|---------|
| `src/pages/patient/ScanResults.tsx` | Add polling for ai_analysis, derive toothData from AI analysis, pass to TeethVisualization, show loading state during analysis |
| `src/pages/patient/ScanHistory.tsx` | Fetch ai_analysis in scan query, derive toothData per scan, pass to TeethVisualization, add detection-to-3D-highlight interaction |
| `src/pages/patient/Progress.tsx` | Remove AI Insight section, move tooth map up, pass latest scan's toothData to TeethVisualization, make map section larger |

## Files Unchanged
- `TeethVisualization.tsx` — already accepts `toothData` prop, no changes needed
- All edge functions — no changes
- All other pages

