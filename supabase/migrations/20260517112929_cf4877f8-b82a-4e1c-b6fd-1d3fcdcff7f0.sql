
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

UPDATE public.scans
SET raw_video_url = NULL,
    pointcloud_url = NULL,
    reconstructed_at = NULL,
    processing_status = CASE
      WHEN processing_status IN ('complete', 'processing', 'queued', 'uploading')
        THEN 'failed'
      ELSE processing_status
    END,
    processing_error = COALESCE(processing_error, 'storage purged')
WHERE raw_video_url IS NOT NULL OR pointcloud_url IS NOT NULL;

DO $$
BEGIN
  PERFORM cron.unschedule('purge-old-scan-videos');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'purge-old-scan-videos',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://qalegwgqtyleuaowvuje.supabase.co/functions/v1/purge-old-scan-videos',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhbGVnd2dxdHlsZXVhb3d2dWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NzY1OTEsImV4cCI6MjA4NzI1MjU5MX0.rK1lOSW3I3pJqNdlL29wIfiFHROU0LJzlcWV8kin_Uo"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);
