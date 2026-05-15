## Fix: Forward `patient_id` in reconstruct-splat dispatch

Single-file change to `supabase/functions/reconstruct-splat/index.ts`.

### Changes

1. **Add defensive guard** after the existing `raw_video_url` check (~line 82):
   ```ts
   if (!scan.patient_id) {
     return jsonResponse({ error: "scan has no patient_id" }, { status: 400 });
   }
   ```

2. **Add `patient_id` to the dispatch input** (~line 119-128), inserted between `scan_id` and `scan_type`:
   ```ts
   body: JSON.stringify({
     input: {
       video_url: signed.signedUrl,
       scan_id,
       patient_id: scan.patient_id,
       scan_type: effectiveType,
       callback_url: callbackUrl,
     },
     webhook: callbackUrl,
   }),
   ```

3. **Redeploy** the `reconstruct-splat` Edge Function.

### Out of scope (untouched)

splat-worker, rp_handler.py, Dockerfile, reconstruct-scan, reconstruct-scan-callback, ScanSubmission.tsx, ScanResults.tsx, Scan3DPlusView.tsx, SuperSplatEmbed.tsx, migrations, RLS policies, bucket settings. No other dispatch fields renamed or reshaped. Logging/error handling unchanged.

### Verification

- `patient_id: scan.patient_id` appears inside `input` object.
- Guard returns 400 with `"scan has no patient_id"` when missing.
- No other files modified.
- Edge Function deploys successfully.