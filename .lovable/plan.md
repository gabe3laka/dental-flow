## Fix splat dispatcher callback URL

In `supabase/functions/reconstruct-splat/index.ts` (lines 113–115), the callback URL points to a non-existent `reconstruct-splat-callback` function. The shared `reconstruct-scan-callback` already routes via the `pipeline=splat` query discriminator.

### Change

Replace:
```ts
const callbackUrl =
  `${ARCLINE_BASE.replace(/\/$/, "")}/functions/v1/reconstruct-splat-callback` +
  `?scan_id=${encodeURIComponent(scan_id)}`;
```

With:
```ts
const callbackUrl =
  `${ARCLINE_BASE.replace(/\/$/, "")}/functions/v1/reconstruct-scan-callback` +
  `?scan_id=${encodeURIComponent(scan_id)}&pipeline=splat`;
```

### Out of scope (will not touch)
- `reconstruct-scan/index.ts` (LingBot dispatcher)
- `reconstruct-scan-callback/index.ts` (shared callback)
- `SPLAT_API_URL` env / RunPod endpoint
- Any other line in `reconstruct-splat/index.ts`

### Verify
- Deploy `reconstruct-splat`
- Confirm function still builds and only the two callback-URL lines changed