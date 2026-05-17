DO $$
DECLARE
  pn text;
BEGIN
  pn := 'Patients write own scan-reference-boards';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = pn AND tablename = 'objects') THEN
    EXECUTE $sql$
      CREATE POLICY "Patients write own scan-reference-boards"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'scan-reference-boards'
        AND auth.uid() IS NOT NULL
        AND (storage.foldername(name))[1] = get_patient_id_for_user(auth.uid())::text
      )
    $sql$;
  END IF;

  pn := 'Patients update own scan-reference-boards';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = pn AND tablename = 'objects') THEN
    EXECUTE $sql$
      CREATE POLICY "Patients update own scan-reference-boards"
      ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'scan-reference-boards'
        AND auth.uid() IS NOT NULL
        AND (storage.foldername(name))[1] = get_patient_id_for_user(auth.uid())::text
      )
      WITH CHECK (
        bucket_id = 'scan-reference-boards'
        AND (storage.foldername(name))[1] = get_patient_id_for_user(auth.uid())::text
      )
    $sql$;
  END IF;
END $$;