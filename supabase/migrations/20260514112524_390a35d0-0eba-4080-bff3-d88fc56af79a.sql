-- scan-splats: private bucket for the splat (gsplat) reconstruction pipeline.
-- Path convention: {patient_id}/{scan_id}/scene.ply
-- Policies mirror scan-pointclouds exactly. Worker uploads via service role;
-- patients read their own folder; doctors read assigned-patient folders;
-- patients can delete their own files.

INSERT INTO storage.buckets (id, name, public)
VALUES ('scan-splats', 'scan-splats', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Service role writes splats' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Service role writes splats"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'scan-splats' AND auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Service role updates splats' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Service role updates splats"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'scan-splats' AND auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Patients view own splats' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Patients view own splats"
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'scan-splats' AND (
          (storage.foldername(name))[1] = get_patient_id_for_user(auth.uid())::text
          OR has_role(auth.uid(), 'doctor'::app_role)
          OR has_role(auth.uid(), 'admin'::app_role)
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Patients delete own splats' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Patients delete own splats"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'scan-splats'
        AND (storage.foldername(name))[1] = get_patient_id_for_user(auth.uid())::text
      );
  END IF;
END $$;