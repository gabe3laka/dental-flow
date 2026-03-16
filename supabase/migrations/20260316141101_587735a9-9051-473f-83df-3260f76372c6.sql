
ALTER TABLE public.scans 
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb,
  ADD COLUMN IF NOT EXISTS sent_to_doctor boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sent_to_doctor_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS patient_note text;
