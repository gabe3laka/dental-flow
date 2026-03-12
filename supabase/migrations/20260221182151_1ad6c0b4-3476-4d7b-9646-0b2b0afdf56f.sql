
-- ═══════════════════════════════════════
-- 1. ENUM TYPE
-- ═══════════════════════════════════════
CREATE TYPE public.app_role AS ENUM ('admin', 'doctor', 'patient');
CREATE TYPE public.scan_status AS ENUM ('pending', 'reviewed', 'flagged', 'action_required');
CREATE TYPE public.message_type AS ENUM ('text', 'video', 'scan_attachment');
CREATE TYPE public.plan_tier AS ENUM ('starter', 'growth', 'enterprise');
CREATE TYPE public.subscription_status AS ENUM ('active', 'past_due', 'canceled', 'trialing');
CREATE TYPE public.action_type AS ENUM ('schedule_visit', 'rescan_needed', 'compliance_check', 'none');

-- ═══════════════════════════════════════
-- 2. USER ROLES TABLE
-- ═══════════════════════════════════════
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════
-- 3. SECURITY DEFINER HELPER FUNCTIONS
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- ═══════════════════════════════════════
-- 4. PROFILES TABLE
-- ═══════════════════════════════════════
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  -- Doctor-specific
  specialty TEXT,
  practice_name TEXT,
  years_practice INTEGER DEFAULT 0,
  rating NUMERIC(3,2) DEFAULT 0,
  total_patients INTEGER DEFAULT 0,
  -- Shared
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════
-- 5. PATIENTS TABLE
-- ═══════════════════════════════════════
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  assigned_doctor_id UUID REFERENCES auth.users(id),
  treatment_type TEXT,
  start_date DATE,
  estimated_end_date DATE,
  current_stage INTEGER DEFAULT 1,
  total_stages INTEGER DEFAULT 1,
  compliance_streak INTEGER DEFAULT 0,
  total_scans INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════
-- 6. SCANS TABLE
-- ═══════════════════════════════════════
CREATE TABLE public.scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status scan_status NOT NULL DEFAULT 'pending',
  thumbnail_url TEXT,
  video_url TEXT,
  zones_captured JSONB DEFAULT '[]'::jsonb,
  quality_score NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════
-- 7. SCAN REVIEWS TABLE
-- ═══════════════════════════════════════
CREATE TABLE public.scan_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES public.scans(id) ON DELETE CASCADE NOT NULL,
  doctor_id UUID REFERENCES auth.users(id) NOT NULL,
  review_notes TEXT,
  ai_analysis JSONB,
  action_type action_type DEFAULT 'none',
  response_video_url TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scan_reviews ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════
-- 8. MESSAGES TABLE
-- ═══════════════════════════════════════
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES auth.users(id) NOT NULL,
  receiver_id UUID REFERENCES auth.users(id) NOT NULL,
  content TEXT,
  message_type message_type DEFAULT 'text',
  attachment_url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════
-- 9. TREATMENT PLANS TABLE
-- ═══════════════════════════════════════
CREATE TABLE public.treatment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  doctor_id UUID REFERENCES auth.users(id) NOT NULL,
  plan_data JSONB DEFAULT '{}'::jsonb,
  appliance_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════
-- 10. TREATMENT MILESTONES TABLE
-- ═══════════════════════════════════════
CREATE TABLE public.treatment_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.treatment_milestones ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════
-- 11. PRACTICE ANALYTICS TABLE
-- ═══════════════════════════════════════
CREATE TABLE public.practice_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES auth.users(id) NOT NULL,
  date DATE NOT NULL,
  scans_reviewed INTEGER DEFAULT 0,
  visits_avoided INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  active_patients INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, date)
);
ALTER TABLE public.practice_analytics ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════
-- 12. SUBSCRIPTIONS TABLE
-- ═══════════════════════════════════════
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  plan_tier plan_tier NOT NULL DEFAULT 'starter',
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  status subscription_status NOT NULL DEFAULT 'trialing',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════
-- 13. HELPER FUNCTIONS FOR RLS
-- ═══════════════════════════════════════

-- Get patient record for a user
CREATE OR REPLACE FUNCTION public.get_patient_id_for_user(_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.patients WHERE user_id = _user_id LIMIT 1
$$;

-- Check if doctor is assigned to a patient
CREATE OR REPLACE FUNCTION public.is_assigned_doctor(_doctor_user_id UUID, _patient_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = _patient_id AND assigned_doctor_id = _doctor_user_id
  )
$$;

-- Get assigned doctor user_id for a patient user_id
CREATE OR REPLACE FUNCTION public.get_assigned_doctor_for_user(_patient_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT assigned_doctor_id FROM public.patients WHERE user_id = _patient_user_id LIMIT 1
$$;

-- ═══════════════════════════════════════
-- 14. RLS POLICIES
-- ═══════════════════════════════════════

-- user_roles: users can read own, admins can manage all
CREATE POLICY "Users can read own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- profiles
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'doctor')
  );

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- patients
CREATE POLICY "Patients can read own record" ON public.patients
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR assigned_doctor_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can insert own patient record" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Patients and doctors can update" ON public.patients
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR assigned_doctor_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- scans
CREATE POLICY "Scan access" ON public.scans
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR patient_id = public.get_patient_id_for_user(auth.uid())
    OR (public.has_role(auth.uid(), 'doctor') AND public.is_assigned_doctor(auth.uid(), patient_id))
  );

CREATE POLICY "Patients can insert scans" ON public.scans
  FOR INSERT TO authenticated
  WITH CHECK (patient_id = public.get_patient_id_for_user(auth.uid()));

CREATE POLICY "Scan update" ON public.scans
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR patient_id = public.get_patient_id_for_user(auth.uid())
    OR (public.has_role(auth.uid(), 'doctor') AND public.is_assigned_doctor(auth.uid(), patient_id))
  );

-- scan_reviews
CREATE POLICY "Review access" ON public.scan_reviews
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR doctor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.scans s
      JOIN public.patients p ON s.patient_id = p.id
      WHERE s.id = scan_reviews.scan_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Doctors can insert reviews" ON public.scan_reviews
  FOR INSERT TO authenticated
  WITH CHECK (doctor_id = auth.uid() AND public.has_role(auth.uid(), 'doctor'));

CREATE POLICY "Doctors can update own reviews" ON public.scan_reviews
  FOR UPDATE TO authenticated
  USING (doctor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- messages
CREATE POLICY "Message access" ON public.messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can update own messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- treatment_plans
CREATE POLICY "Treatment plan access" ON public.treatment_plans
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR doctor_id = auth.uid()
    OR patient_id = public.get_patient_id_for_user(auth.uid())
  );

CREATE POLICY "Doctors can create plans" ON public.treatment_plans
  FOR INSERT TO authenticated
  WITH CHECK (doctor_id = auth.uid() AND public.has_role(auth.uid(), 'doctor'));

CREATE POLICY "Doctors can update plans" ON public.treatment_plans
  FOR UPDATE TO authenticated
  USING (doctor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- treatment_milestones
CREATE POLICY "Milestone access" ON public.treatment_milestones
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR patient_id = public.get_patient_id_for_user(auth.uid())
    OR (public.has_role(auth.uid(), 'doctor') AND public.is_assigned_doctor(auth.uid(), patient_id))
  );

CREATE POLICY "Doctors can create milestones" ON public.treatment_milestones
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'doctor') AND public.is_assigned_doctor(auth.uid(), patient_id));

CREATE POLICY "Doctors can update milestones" ON public.treatment_milestones
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'doctor') AND public.is_assigned_doctor(auth.uid(), patient_id))
  );

-- practice_analytics
CREATE POLICY "Analytics access" ON public.practice_analytics
  FOR SELECT TO authenticated
  USING (doctor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert analytics" ON public.practice_analytics
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- subscriptions
CREATE POLICY "Subscription access" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (doctor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Doctors can manage own subscription" ON public.subscriptions
  FOR UPDATE TO authenticated
  USING (doctor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ═══════════════════════════════════════
-- 15. AUTO-CREATE PROFILE + ROLE ON SIGNUP
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role app_role;
BEGIN
  -- Default to 'patient' if no role in metadata
  _role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::app_role,
    'patient'
  );

  -- Create profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );

  -- Assign role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role);

  -- If patient, create patient record
  IF _role = 'patient' THEN
    INSERT INTO public.patients (user_id)
    VALUES (NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════
-- 16. UPDATED_AT TRIGGER
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_patients_updated_at
  BEFORE UPDATE ON public.patients FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_treatment_plans_updated_at
  BEFORE UPDATE ON public.treatment_plans FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════
-- 17. ENABLE REALTIME FOR MESSAGES
-- ═══════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
