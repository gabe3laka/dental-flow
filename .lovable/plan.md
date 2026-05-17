## Goal

1. One-time: empty the `scan-videos` and `scan-pointclouds` buckets (329 + 5 objects, ~1.18 GB).
2. Ongoing: auto-delete every object in `scan-videos` 2 hours after upload. Keep `scan-pointclouds` permanent (that's the actual artifact).

## Approach

### Part 1 — One-time purge

Run via the Supabase insert tool (data operation, not schema):

```sql
-- Remove all objects in both buckets
DELETE FROM storage.objects WHERE bucket_id = 'scan-videos';
DELETE FROM storage.objects WHERE bucket_id = 'scan-pointclouds';
```

Note: this also wipes the pointclouds for the 5 existing scans, so those scans' 3D MAP tab will go back to its empty state. Confirming this is intended before running.

Also null out the now-dangling DB references so the UI doesn't try to sign missing paths:

```sql
UPDATE public.scans
SET raw_video_url = NULL,
    pointcloud_url = NULL,
    processing_status = 'failed',
    processing_error = 'storage purged'
WHERE raw_video_url IS NOT NULL OR pointcloud_url IS NOT NULL;
```

### Part 2 — Auto-delete `scan-videos` after 2 hours

Two pieces:

**A. New edge function `purge-old-scan-videos`** (`supabase/functions/purge-old-scan-videos/index.ts`)
- Uses service role.
- Queries `storage.objects` for `bucket_id = 'scan-videos'` where `created_at < now() - interval '2 hours'`.
- Batches `supabase.storage.from('scan-videos').remove([...paths])` (chunks of 100).
- For each deleted object, also `UPDATE scans SET raw_video_url = NULL WHERE raw_video_url = <path>` so the DB stays consistent. `pointcloud_url` is untouched.
- Returns `{ deleted: N }`. Idempotent — safe to run repeatedly.
- Registered in `supabase/config.toml` with `verify_jwt = false` (cron caller).

**B. pg_cron schedule** — runs every 15 minutes (granularity is fine; the 2-hour window is the contract). Created via the **insert** tool (not migration) because it embeds the project URL + anon key:

```sql
SELECT cron.schedule(
  'purge-old-scan-videos',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qalegwgqtyleuaowvuje.supabase.co/functions/v1/purge-old-scan-videos',
    headers := '{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

Requires `pg_cron` + `pg_net` extensions — enable via migration if not already on.

### Part 3 — Frontend implications (no code changes needed)

- `ScanResults.tsx` already renders the point cloud from `pointcloud_url` independently of `raw_video_url`, so deleting the source video after reconstruction doesn't break the 3D MAP tab.
- Doctor's `ScanReview` / scan video playback: if anything still plays the raw video, it will 404 after 2 hours. Will grep for `raw_video_url` consumers during implementation and flag any that need a "video expired" empty state. (Out of scope to redesign those — just noting.)

## Files touched

- New: `supabase/functions/purge-old-scan-videos/index.ts`
- Edit: `supabase/config.toml` (register function, `verify_jwt = false`)
- Migration: enable `pg_cron`, `pg_net` if missing
- Insert (data): purge SQL + cron schedule SQL

## Open questions

1. Confirm the existing 5 pointcloud files should be wiped too — once gone, those scans lose their 3D reconstruction permanently. Alternative: purge only `scan-videos` and leave `scan-pointclouds` intact.
2. Confirm 2 hours is measured from **upload time** (`storage.objects.created_at`), not from `scans.reconstructed_at`. Upload-time is simpler and safer (no orphans if reconstruction never completes).
