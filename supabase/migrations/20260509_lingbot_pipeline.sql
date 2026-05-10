-- ═══════════════════════════════════════════════════════════════════════════
-- LingBot-Map pipeline — schema additions
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds the columns and storage bucket required by the new video → point-cloud
-- scan pipeline (Arcline Scope / Wand → LingBot-Map → R3F viewer).
--
-- Date: 2026-05-09
-- Branch: claude/check-gsd-skill-Jaqd4
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. scans: add LingBot fields ─────────────────────────────────────────
ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS scan_type TEXT,
  ADD COLUMN IF NOT EXISTS raw_video_url TEXT,
  ADD COLUMN IF NOT EXISTS pointcloud_url TEXT,
  ADD COLUMN IF NOT EXISTS processing_status TEXT,
  ADD COLUMN IF NOT EXISTS processing_error TEXT,
  ADD COLUMN IF NOT EXISTS reconstructed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lingbot_metrics JSONB,
  ADD COLUMN IF NOT EXISTS doctor_review_id UUID;

-- Constrain scan_type to known values (NULL allowed for legacy rows).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scans_scan_type_check'
  ) THEN
    ALTER TABLE public.scans
      ADD CONSTRAINT scans_scan_type_check
      CHECK (scan_type IS NULL OR scan_type IN ('scope', 'wand'));
  END IF;
END $$;

-- Constrain processing_status to known values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scans_processing_status_check'
  ) THEN
    ALTER TABLE public.scans
      ADD CONSTRAINT scans_processing_status_check
      CHECK (processing_status IS NULL OR processing_status IN (
        'queued', 'uploading', 'processing', 'complete', 'failed'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS scans_processing_status_idx
  ON public.scans (processing_status)
  WHERE processing_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS scans_patient_submitted_idx
  ON public.scans (patient_id, submitted_at DESC);

-- Backfill: existing rows have a video_url but no raw_video_url. For
-- legacy photo-zone scans, leave raw_video_url NULL (they don't have one).
-- For rows where video_url looks like a video file (.mp4/.webm), promote it.
UPDATE public.scans
SET raw_video_url = video_url
WHERE raw_video_url IS NULL
  AND video_url IS NOT NULL
  AND (video_url ILIKE '%.mp4' OR video_url ILIKE '%.webm' OR video_url ILIKE '%.mov');

-- Default processing_status for older rows so the UI doesn't show "queued" forever.
UPDATE public.scans
SET processing_status = 'complete'
WHERE processing_status IS NULL
  AND status IN ('reviewed', 'flagged', 'action_required');

-- ─── 2. scan_reviews: timestamped comments ────────────────────────────────
ALTER TABLE public.scan_reviews
  ADD COLUMN IF NOT EXISTS comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS video_duration_ms INTEGER;

-- Comment shape (documented for downstream type generation):
-- [{
--   "id":         "uuid",
--   "t_ms":       12340,
--   "text":       "Notice the recession on T11",
--   "author_id":  "uuid (doctor user_id)",
--   "created_at": "2026-05-09T12:00:00Z",
--   "position":   [x, y, z]   -- optional, splat-space
-- }]

-- ─── 3. progress_snapshots: per-patient longitudinal deltas ───────────────
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Patients can view own progress snapshots'
      AND tablename = 'progress_snapshots'
  ) THEN
    CREATE POLICY "Patients can view own progress snapshots"
      ON public.progress_snapshots FOR SELECT
      USING (patient_id = get_patient_id_for_user(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Doctors can view assigned patient snapshots'
      AND tablename = 'progress_snapshots'
  ) THEN
    CREATE POLICY "Doctors can view assigned patient snapshots"
      ON public.progress_snapshots FOR SELECT
      USING (
        has_role(auth.uid(), 'doctor'::app_role)
        AND EXISTS (
          SELECT 1 FROM public.patients p
          WHERE p.id = progress_snapshots.patient_id
            AND p.assigned_doctor_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Service role manages progress snapshots'
      AND tablename = 'progress_snapshots'
  ) THEN
    CREATE POLICY "Service role manages progress snapshots"
      ON public.progress_snapshots FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ─── 4. scan-pointclouds storage bucket ───────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('scan-pointclouds', 'scan-pointclouds', false)
ON CONFLICT (id) DO NOTHING;

-- Per-patient folder ownership: path is `{patient_id}/{scan_id}/pointcloud.ply`.
-- LingBot writes via the service role; patients and their doctors read.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Service role writes pointclouds'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Service role writes pointclouds"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'scan-pointclouds' AND auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Service role updates pointclouds'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Service role updates pointclouds"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'scan-pointclouds' AND auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Patients view own pointclouds'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Patients view own pointclouds"
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'scan-pointclouds'
        AND (
          (storage.foldername(name))[1] = get_patient_id_for_user(auth.uid())::text
          OR has_role(auth.uid(), 'doctor'::app_role)
          OR has_role(auth.uid(), 'admin'::app_role)
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Patients delete own pointclouds'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Patients delete own pointclouds"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'scan-pointclouds'
        AND (storage.foldername(name))[1] = get_patient_id_for_user(auth.uid())::text
      );
  END IF;
END $$;

-- ─── 5. Notify channel for the GPU dispatcher ─────────────────────────────
-- Edge Function `reconstruct-scan` listens for INSERT on scans where
-- scan_type IS NOT NULL AND raw_video_url IS NOT NULL AND processing_status = 'queued'.
-- The trigger keeps dispatch idempotent: if the function fails or the worker
-- restarts, a manual re-queue (UPDATE … SET processing_status = 'queued') re-fires.
CREATE OR REPLACE FUNCTION public.notify_lingbot_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.processing_status = 'queued'
     AND NEW.raw_video_url IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.processing_status IS DISTINCT FROM 'queued')
  THEN
    PERFORM pg_notify(
      'lingbot_queue',
      json_build_object(
        'scan_id', NEW.id,
        'patient_id', NEW.patient_id,
        'scan_type', NEW.scan_type,
        'raw_video_url', NEW.raw_video_url
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scans_lingbot_dispatch ON public.scans;
CREATE TRIGGER scans_lingbot_dispatch
  AFTER INSERT OR UPDATE OF processing_status ON public.scans
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_lingbot_queue();
