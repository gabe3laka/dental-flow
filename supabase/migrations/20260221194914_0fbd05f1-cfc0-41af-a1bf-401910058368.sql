-- Add missing storage policies (some already exist from prior migration)
-- Use IF NOT EXISTS pattern via DO blocks

DO $$
BEGIN
  -- scan-videos policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Patients can upload own scans' AND tablename = 'objects') THEN
    CREATE POLICY "Patients can upload own scans" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'scan-videos' AND auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = get_patient_id_for_user(auth.uid())::text);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Patients can view own scans' AND tablename = 'objects') THEN
    CREATE POLICY "Patients can view own scans" ON storage.objects FOR SELECT
    USING (bucket_id = 'scan-videos' AND ((storage.foldername(name))[1] = get_patient_id_for_user(auth.uid())::text OR has_role(auth.uid(), 'doctor'::app_role)));
  END IF;

  -- profile-photos policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Profile photos are publicly accessible' AND tablename = 'objects') THEN
    CREATE POLICY "Profile photos are publicly accessible" ON storage.objects FOR SELECT
    USING (bucket_id = 'profile-photos');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile photo' AND tablename = 'objects') THEN
    CREATE POLICY "Users can update own profile photo" ON storage.objects FOR UPDATE
    USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  -- response-videos policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Doctors can upload response videos' AND tablename = 'objects') THEN
    CREATE POLICY "Doctors can upload response videos" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'response-videos' AND has_role(auth.uid(), 'doctor'::app_role));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view response videos' AND tablename = 'objects') THEN
    CREATE POLICY "Users can view response videos" ON storage.objects FOR SELECT
    USING (bucket_id = 'response-videos' AND (has_role(auth.uid(), 'doctor'::app_role) OR auth.uid() IS NOT NULL));
  END IF;
END $$;