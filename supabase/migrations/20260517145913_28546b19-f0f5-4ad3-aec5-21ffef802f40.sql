
SELECT cron.schedule(
  'visual-guide-poll-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qalegwgqtyleuaowvuje.supabase.co/functions/v1/visual-guide-poll',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhbGVnd2dxdHlsZXVhb3d2dWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NzY1OTEsImV4cCI6MjA4NzI1MjU5MX0.rK1lOSW3I3pJqNdlL29wIfiFHROU0LJzlcWV8kin_Uo"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
