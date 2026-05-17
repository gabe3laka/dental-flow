# Fix "maximum size exceeded" on Upload Video

## Root cause

Live recordings and uploaded videos use the **identical** code path (same bucket, same SDK call, same folder layout, same downstream dispatch). The only difference is **file size**:

- Live recording: short WebM, typically 5–20 MB.
- Camera-roll upload: iOS `.mov` HEVC or large MP4, often 60–200 MB.

The `scan-videos` bucket currently has `file_size_limit = NULL`, so it falls back to the **project-wide default of 50 MiB**. Anything over 50 MB returns "Payload too large / maximum size exceeded" from Supabase Storage. Live captures squeeze under, uploads don't.

The client-side cap was bumped to 200 MB earlier, but the **bucket-side cap** was never raised — so the browser lets the file through, then Storage rejects it.

## Fix (one migration, no code changes)

Raise the bucket's per-file limit to match the client cap.

```sql
update storage.buckets
   set file_size_limit = 209715200  -- 200 MiB
 where id = 'scan-videos';
```

Optionally also pin the allowed MIME types to the same allowlist the client enforces (`video/mp4`, `video/webm`, `video/quicktime`) so junk files are rejected at the edge instead of consuming bandwidth:

```sql
update storage.buckets
   set allowed_mime_types = array['video/mp4','video/webm','video/quicktime']
 where id = 'scan-videos';
```

## Project-wide upload cap

The bucket-level `file_size_limit` overrides the project global, so this single migration is enough — **but** if the Supabase project's global upload limit is still set to 50 MB in Dashboard → Storage → Settings, uploads will still be capped there. If 200 MB uploads still 413 after the migration, the project-global cap needs to be raised in the Supabase dashboard (one click, requires the user). I'll flag this if it reproduces.

## Verification

1. After migration: re-upload a 120 MB iOS `.mov` from the camera roll. Expect success and the same flow as a live recording (row inserts, `reconstruct-splat` dispatched).
2. Re-upload a 250 MB file: client still rejects at 200 MB (unchanged).
3. Live-camera path unchanged.

No frontend, edge-function, RLS, or schema changes.

Awaiting approval to run the migration.
