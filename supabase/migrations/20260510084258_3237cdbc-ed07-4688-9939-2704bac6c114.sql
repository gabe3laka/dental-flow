-- Bring scans table up to date for LingBot/RunPod pipeline + add runpod_job_id

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS scan_type TEXT,
  ADD COLUMN IF NOT EXISTS raw_video_url TEXT,
  ADD COLUMN IF NOT EXISTS pointcloud_url TEXT,
  ADD COLUMN IF NOT EXISTS processing_status TEXT,
  ADD COLUMN IF NOT EXISTS processing_error TEXT,
  ADD COLUMN IF NOT EXISTS reconstructed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lingbot_metrics JSONB,
  ADD COLUMN IF NOT EXISTS doctor_review_id UUID,
  ADD COLUMN IF NOT EXISTS runpod_job_id TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scans_scan_type_check') THEN
    ALTER TABLE public.scans ADD CONSTRAINT scans_scan_type_check
      CHECK (scan_type IS NULL OR scan_type IN ('scope','wand'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scans_processing_status_check') THEN
    ALTER TABLE public.scans ADD CONSTRAINT scans_processing_status_check
      CHECK (processing_status IS NULL OR processing_status IN ('queued','uploading','processing','complete','failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS scans_processing_status_idx
  ON public.scans (processing_status) WHERE processing_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS scans_patient_submitted_idx
  ON public.scans (patient_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS scans_runpod_job_idx
  ON public.scans (runpod_job_id) WHERE runpod_job_id IS NOT NULL;

UPDATE public.scans
SET raw_video_url = video_url
WHERE raw_video_url IS NULL AND video_url IS NOT NULL
  AND (video_url ILIKE '%.mp4' OR video_url ILIKE '%.webm' OR video_url ILIKE '%.mov');

UPDATE public.scans
SET processing_status = 'complete'
WHERE processing_status IS NULL
  AND status IN ('reviewed','flagged','action_required');

-- scan_reviews: timestamped comments
ALTER TABLE public.scan_reviews
  ADD COLUMN IF NOT EXISTS comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS video_duration_ms INTEGER;

-- progress_snapshots
CREATE TABLE IF NOT EXISTS public.progress_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  from_scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  to_scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  per_tooth JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB,
  UNIQUE (from_scan_id, to_scan_id)
);
ALTER TABLE public.progress_snapshots ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS progress_snapshots_patient_idx
  ON public.progress_snapshots (patient_id, computed_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Patients can view own progress snapshots' AND tablename='progress_snapshots') THEN
    CREATE POLICY "Patients can view own progress snapshots" ON public.progress_snapshots FOR SELECT
      USING (patient_id = get_patient_id_for_user(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Doctors can view assigned patient snapshots' AND tablename='progress_snapshots') THEN
    CREATE POLICY "Doctors can view assigned patient snapshots" ON public.progress_snapshots FOR SELECT
      USING (has_role(auth.uid(),'doctor'::app_role) AND EXISTS (
        SELECT 1 FROM public.patients p WHERE p.id = progress_snapshots.patient_id AND p.assigned_doctor_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Service role manages progress snapshots' AND tablename='progress_snapshots') THEN
    CREATE POLICY "Service role manages progress snapshots" ON public.progress_snapshots FOR ALL
      USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- scan-pointclouds bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('scan-pointclouds','scan-pointclouds', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Service role writes pointclouds' AND tablename='objects') THEN
    CREATE POLICY "Service role writes pointclouds" ON storage.objects FOR INSERT
      WITH CHECK (bucket_id='scan-pointclouds' AND auth.role()='service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Service role updates pointclouds' AND tablename='objects') THEN
    CREATE POLICY "Service role updates pointclouds" ON storage.objects FOR UPDATE
      USING (bucket_id='scan-pointclouds' AND auth.role()='service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Patients view own pointclouds' AND tablename='objects') THEN
    CREATE POLICY "Patients view own pointclouds" ON storage.objects FOR SELECT
      USING (bucket_id='scan-pointclouds' AND (
        (storage.foldername(name))[1] = get_patient_id_for_user(auth.uid())::text
        OR has_role(auth.uid(),'doctor'::app_role)
        OR has_role(auth.uid(),'admin'::app_role)
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Patients delete own pointclouds' AND tablename='objects') THEN
    CREATE POLICY "Patients delete own pointclouds" ON storage.objects FOR DELETE
      USING (bucket_id='scan-pointclouds' AND (storage.foldername(name))[1] = get_patient_id_for_user(auth.uid())::text);
  END IF;
END $$;