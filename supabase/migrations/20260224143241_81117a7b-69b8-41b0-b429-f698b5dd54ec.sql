
-- 1. user_preferences table for notification toggles
CREATE TABLE public.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pref_key text NOT NULL,
  pref_value boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, pref_key)
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preferences"
  ON public.user_preferences FOR ALL
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- 2. doctor_availability table for available slots
CREATE TABLE public.doctor_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL,
  day_of_week text NOT NULL,
  start_time text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage own availability"
  ON public.doctor_availability FOR ALL
  USING (doctor_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (doctor_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Patients can read assigned doctor availability"
  ON public.doctor_availability FOR SELECT
  USING (doctor_id = get_assigned_doctor_for_user(auth.uid()) OR has_role(auth.uid(), 'doctor'::app_role));

-- 3. progress_shares table for shareable progress links
CREATE TABLE public.progress_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  share_token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.progress_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients can insert own shares"
  ON public.progress_shares FOR INSERT
  WITH CHECK (patient_id = get_patient_id_for_user(auth.uid()));

CREATE POLICY "Anyone can read by token"
  ON public.progress_shares FOR SELECT
  USING (true);

-- 4. Add pairing_code column to patients
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS pairing_code text;

-- 5. Add estimated_cost column to patients
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS estimated_cost numeric;
