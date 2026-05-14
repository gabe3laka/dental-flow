-- Splat pipeline (gsplat + COLMAP) — parallel to LingBot.
-- All columns nullable, additive only. Touches no existing column.
-- No CHECK constraint on splat_processing_status — freeform, mirrors how
-- the rest of the splat-side state is written by the new worker.
ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS splat_url               TEXT,
  ADD COLUMN IF NOT EXISTS splat_processing_status TEXT,
  ADD COLUMN IF NOT EXISTS splat_processing_error  TEXT,
  ADD COLUMN IF NOT EXISTS splat_metrics           JSONB,
  ADD COLUMN IF NOT EXISTS splat_reconstructed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS runpod_splat_job_id     TEXT;

CREATE INDEX IF NOT EXISTS scans_splat_processing_status_idx
  ON public.scans (splat_processing_status)
  WHERE splat_processing_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS scans_runpod_splat_job_idx
  ON public.scans (runpod_splat_job_id)
  WHERE runpod_splat_job_id IS NOT NULL;