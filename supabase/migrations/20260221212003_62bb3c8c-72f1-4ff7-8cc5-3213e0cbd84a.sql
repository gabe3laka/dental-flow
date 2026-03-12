
-- =============================================
-- v2 Schema Updates
-- =============================================

-- 1. New columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS practice_setup_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- 2. New column on patients
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS treatment_category text;

-- 3. Admin notes table
CREATE TABLE IF NOT EXISTS public.admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  target_type text NOT NULL, -- 'practice', 'patient', 'scan'
  target_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage admin_notes"
  ON public.admin_notes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. Feature flags table
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read feature_flags"
  ON public.feature_flags FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage feature_flags"
  ON public.feature_flags FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5. Platform announcements table
CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  audience text NOT NULL DEFAULT 'all', -- 'all', 'doctors', 'patients'
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active announcements"
  ON public.platform_announcements FOR SELECT
  USING (active = true);

CREATE POLICY "Admins can manage announcements"
  ON public.platform_announcements FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 6. Impersonation log table
CREATE TABLE IF NOT EXISTS public.impersonation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
ALTER TABLE public.impersonation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage impersonation_log"
  ON public.impersonation_log FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 7. Seed default feature flags
INSERT INTO public.feature_flags (flag_key, enabled, description) VALUES
  ('ai_scan_analysis', false, 'Enable AI-powered scan analysis'),
  ('video_responses', true, 'Enable doctor video responses'),
  ('sms_reminders', false, 'Enable Twilio SMS reminders'),
  ('stripe_billing', false, 'Enable Stripe billing integration'),
  ('maintenance_mode', false, 'Put platform in maintenance mode')
ON CONFLICT (flag_key) DO NOTHING;

-- 8. Update handle_new_user to store specialty
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role app_role;
BEGIN
  _role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::app_role,
    'patient'
  );

  INSERT INTO public.profiles (user_id, full_name, specialty)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'specialty'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role);

  IF _role = 'patient' THEN
    INSERT INTO public.patients (user_id)
    VALUES (NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;
