
-- New tables for v3.0 features

-- Team invites
CREATE TABLE public.team_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_id UUID NOT NULL,
  invited_email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors can manage their team invites" ON public.team_invites FOR ALL
  USING (practice_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (practice_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Referrals
CREATE TABLE public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_doctor_id UUID NOT NULL,
  to_doctor_id UUID,
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  reason TEXT,
  urgency TEXT NOT NULL DEFAULT 'routine',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Referral access" ON public.referrals FOR ALL
  USING (from_doctor_id = auth.uid() OR to_doctor_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (from_doctor_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Consult requests (public submissions)
CREATE TABLE public.consult_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL,
  patient_name TEXT NOT NULL,
  patient_email TEXT NOT NULL,
  scan_video_url TEXT,
  concern_text TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new',
  reply_video_url TEXT,
  replied_at TIMESTAMPTZ
);
ALTER TABLE public.consult_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors can view their consult requests" ON public.consult_requests FOR SELECT
  USING (doctor_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can submit consult requests" ON public.consult_requests FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Doctors can update their consult requests" ON public.consult_requests FOR UPDATE
  USING (doctor_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Automations
CREATE TABLE public.automations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'no_scan',
  trigger_days INTEGER NOT NULL DEFAULT 7,
  action_type TEXT NOT NULL DEFAULT 'send_message',
  message_template TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors can manage their automations" ON public.automations FOR ALL
  USING (doctor_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (doctor_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Scan shares
CREATE TABLE public.scan_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.scans(id),
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  shared_by UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scan_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Share access" ON public.scan_shares FOR ALL
  USING (shared_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (shared_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view shared scans by token" ON public.scan_shares FOR SELECT
  USING (true);

-- Add columns to existing tables
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS device_linked BOOLEAN DEFAULT false;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS device_paired_at TIMESTAMPTZ;

ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'patient';
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS detection_tags JSONB;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS doctor_slug TEXT UNIQUE;

-- Consult videos storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('consult-videos', 'consult-videos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can upload consult videos" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'consult-videos');
CREATE POLICY "Anyone can view consult videos" ON storage.objects FOR SELECT
  USING (bucket_id = 'consult-videos');

-- Seed feature flags
INSERT INTO public.feature_flags (flag_key, enabled, description) VALUES
  ('AI_ANALYSIS_ENABLED', true, 'Enable AI scan analysis for eligible plans'),
  ('VIDEO_RESPONSES_ENABLED', true, 'Enable video response recording'),
  ('ANALYTICS_ENABLED', true, 'Enable practice analytics dashboard')
ON CONFLICT (flag_key) DO NOTHING;
