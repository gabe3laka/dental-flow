
ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS generation_engine text,
  ADD COLUMN IF NOT EXISTS generation_status text,
  ADD COLUMN IF NOT EXISTS reference_board_url text,
  ADD COLUMN IF NOT EXISTS generative_scene_url text,
  ADD COLUMN IF NOT EXISTS generative_glb_url text,
  ADD COLUMN IF NOT EXISTS generative_assets jsonb,
  ADD COLUMN IF NOT EXISTS generation_error text,
  ADD COLUMN IF NOT EXISTS generation_job_id text,
  ADD COLUMN IF NOT EXISTS generation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS generative_saved_to_record boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS scans_generation_status_idx
  ON public.scans (generation_status)
  WHERE generation_status IS NOT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('scan-reference-boards', 'scan-reference-boards', false),
  ('generated-scenes',      'generated-scenes',      false),
  ('generated-assets',      'generated-assets',      false)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  b text;
  pn text;
  buckets text[] := ARRAY['scan-reference-boards','generated-scenes','generated-assets'];
BEGIN
  FOREACH b IN ARRAY buckets LOOP
    pn := 'Service role writes ' || b;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = pn AND tablename = 'objects') THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR INSERT WITH CHECK (bucket_id = %L AND auth.role() = ''service_role'')',
        pn, b
      );
    END IF;

    pn := 'Service role updates ' || b;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = pn AND tablename = 'objects') THEN
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR UPDATE USING (bucket_id = %L AND auth.role() = ''service_role'')',
        pn, b
      );
    END IF;

    pn := 'Patients view own ' || b;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = pn AND tablename = 'objects') THEN
      EXECUTE format(
        $sql$CREATE POLICY %I ON storage.objects FOR SELECT USING (
          bucket_id = %L AND (
            (storage.foldername(name))[1] = get_patient_id_for_user(auth.uid())::text
            OR has_role(auth.uid(), 'doctor'::app_role)
            OR has_role(auth.uid(), 'admin'::app_role)
          )
        )$sql$,
        pn, b
      );
    END IF;

    pn := 'Patients delete own ' || b;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = pn AND tablename = 'objects') THEN
      EXECUTE format(
        $sql$CREATE POLICY %I ON storage.objects FOR DELETE USING (
          bucket_id = %L
          AND (storage.foldername(name))[1] = get_patient_id_for_user(auth.uid())::text
        )$sql$,
        pn, b
      );
    END IF;
  END LOOP;
END $$;
