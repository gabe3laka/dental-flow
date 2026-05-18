-- public.scans had RLS policies for SELECT / INSERT / UPDATE but none for
-- DELETE. With RLS enabled and no DELETE policy, every delete was silently
-- denied (PostgREST returns 200 with an empty result, no error), so the
-- patient UI removed the row optimistically but it reappeared on reload and
-- the underlying storage objects were orphaned.
--
-- Allow a patient to delete their own scans, and admins to delete any.
-- scan_reviews / scan_relationships already cascade via ON DELETE CASCADE.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Scan delete'
      AND tablename = 'scans'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY "Scan delete" ON public.scans
      FOR DELETE TO authenticated
      USING (
        public.has_role(auth.uid(), 'admin')
        OR patient_id = public.get_patient_id_for_user(auth.uid())
      );
  END IF;
END $$;
