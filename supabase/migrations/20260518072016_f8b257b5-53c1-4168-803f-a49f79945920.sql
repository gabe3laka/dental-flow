DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Scan delete' AND tablename = 'scans' AND schemaname = 'public'
  ) THEN
    CREATE POLICY "Scan delete" ON public.scans
      FOR DELETE TO authenticated
      USING (
        public.has_role(auth.uid(), 'admin')
        OR patient_id = public.get_patient_id_for_user(auth.uid())
      );
  END IF;
END $$;