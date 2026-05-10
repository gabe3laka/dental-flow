## Goal
Make the patient UI react automatically when RunPod finishes a 3D reconstruction — both while the user is watching the page and when they have navigated away to another patient screen.

---

## Fix 1 — `src/pages/patient/Progress.tsx` (Realtime on the watched scan)

Add a second `useEffect` that opens a Supabase Realtime channel for `latestScan` and merges updates into local state.

- Effect deps: `[latestScan?.id]`. Skip if no `latestScan` or it is already `complete` with a `pointcloud_url`.
- Channel: `supabase.channel(\`scan-status-${latestScan.id}\`)`.
- Subscribe with `event: 'UPDATE'`, `schema: 'public'`, `table: 'scans'`, `filter: \`id=eq.${latestScan.id}\``.
- On payload:
  - `setAllScans(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...(payload.new as ScanRecord) } : s))`
  - `setLatestScan(prev => prev && prev.id === payload.new.id ? { ...prev, ...(payload.new as ScanRecord) } : prev)`
- Cleanup: `supabase.removeChannel(channel)`.

The setter names `setAllScans` / `setLatestScan` already exist in the file. `usePatientData()` is a separate hook with no scan setters and is correctly left untouched. The existing derived flags (`isReconstructing`, `isReconstructionFailed`) and `usePointCloudUrl` will reactively flip — no UI changes needed.

---

## Fix 2 — `src/pages/patient/ScanResults.tsx` (extend existing poll)

The existing `analysisPolling` interval (lines ~134–166) only selects `ai_analysis, detection_tags, quality_score`. Extend it:

- Add `processing_status, pointcloud_url` to the select.
- After the fetch, in addition to the existing AI-analysis branch:
  - If `data.processing_status === 'complete'` and `data.pointcloud_url`, `setScan(prev => prev ? { ...prev, processing_status: 'complete', pointcloud_url: data.pointcloud_url } : prev)` so `PointCloudViewer` mounts.
  - If `data.processing_status === 'failed'`, fire `toast({ title: "Reconstruction failed", description: "...", variant: "destructive" })`, update scan state to reflect failure, and clear the interval.
- Polling continues while `ai_analysis` is empty **or** `processing_status` is `queued`/`processing`. Stops when both resolved, status is `failed`, or `MAX_POLLS` is hit.
- **Update the initial trigger condition explicitly** (currently AND-gated on missing `ai_analysis` only — would never start polling for a scan that already has AI analysis but is still reconstructing):
  ```ts
  if (
    !scanData.ai_analysis?.teeth?.length ||
    (scanData.processing_status &&
      scanData.processing_status !== 'complete' &&
      scanData.processing_status !== 'failed')
  ) {
    setAnalysisPolling(true);
  }
  ```
- Keep the `MAX_POLLS` guard untouched.

---

## Fix 3 — Global "scan ready" watcher for when the user has navigated away

Create `src/hooks/use-scan-completion-watcher.ts`:

- Inputs: none. Reads `useAuth()` for the current `user.id`, then resolves the patient row to get `patient_id`.
- Maintain `const channels = new Map<string, RealtimeChannel>()` to dedupe subscriptions.
- `refetchInProgressScans()`:
  1. Query `scans` for `patient_id = X` and `processing_status in ('queued','processing')`, select `id`.
  2. For each scan **not already in the Map**, open a channel `scan-watch-${scan.id}` filtered to `id=eq.${scan.id}` listening for `UPDATE`.
  3. On payload:
     - If `payload.new.processing_status === 'complete'`:
       ```ts
       toast({
         title: "Scan ready",
         description: "Your 3D reconstruction is complete.",
         action: (
           <ToastAction altText="View" onClick={() => navigate(`/patient/scans/${payload.new.id}/results`)}>
             View
           </ToastAction>
         ),
       });
       ```
       Then `supabase.removeChannel(channel)` and delete from the Map.
     - If `processing_status === 'failed'`, fire a destructive toast, remove the channel, delete from the Map.
- On mount: call `refetchInProgressScans()` once.
- **Re-query on tab focus** (replaces the broken INSERT-subscription idea — Supabase Realtime `postgres_changes` filters do not reliably support equality on non-primary-key columns like `patient_id`, so an INSERT subscription filtered by `patient_id` would silently receive no events):
  ```ts
  const onVisibility = () => {
    if (document.visibilityState === 'visible') refetchInProgressScans();
  };
  document.addEventListener('visibilitychange', onVisibility);
  ```
  Any newly-submitted scan that has appeared since the last query will pick up a fresh UPDATE channel via the Map dedup guard.
- Cleanup: remove the `visibilitychange` listener, remove every channel in the Map, and use an `aborted` flag to ignore late fetch resolutions.

Mount the hook in `src/components/patient/PatientBottomNav.tsx` (renders on Home, Scans, Progress, Chat, Profile): call `useScanCompletionWatcher()` near the top of the component so the watcher is alive across the entire patient section.

Toast route confirmed: `/patient/scans/${id}/results` matches `App.tsx` line 87.

---

## Out of scope
- No changes to RunPod worker, `reconstruct-scan` / `reconstruct-scan-callback` Edge Functions, RLS, or DB schema.
- No new visual components beyond the existing toast.
- No service worker or push notifications — the watcher only fires while the patient is anywhere inside the patient portal (and the visibilitychange handler covers tab-return).

## Prerequisite to verify during implementation
Supabase Realtime must be enabled for the `scans` table. If channels never fire in testing, run a migration:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.scans;
```

## Verification
1. Submit a scan, stay on Progress → viewer auto-appears within ~1s of callback (Fix 1).
2. Submit a scan, stay on ScanResults → viewer auto-appears, failure shows toast (Fix 2).
3. Submit a scan, navigate to Home/Chat/Profile, wait → toast appears with "View" button that opens the results page (Fix 3).
4. Submit a scan, switch browser tabs, switch back after completion → tab-focus re-query attaches a watcher and the toast fires.