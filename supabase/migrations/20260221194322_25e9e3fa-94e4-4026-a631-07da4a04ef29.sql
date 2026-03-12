
-- Phase 7: Create 3 storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('scan-videos', 'scan-videos', false),
  ('profile-photos', 'profile-photos', true),
  ('response-videos', 'response-videos', false);

-- Storage RLS policies

-- scan-videos: patients can upload their own scans
CREATE POLICY "Patients can upload scan videos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'scan-videos'
  AND auth.uid() IS NOT NULL
  AND public.has_role(auth.uid(), 'patient')
);

-- scan-videos: patients can view their own, doctors can view assigned patients'
CREATE POLICY "Users can view scan videos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'scan-videos'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'patient')
    OR public.has_role(auth.uid(), 'doctor')
  )
);

-- profile-photos: anyone can view (public bucket)
CREATE POLICY "Anyone can view profile photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-photos');

-- profile-photos: authenticated users can upload their own
CREATE POLICY "Users can upload own profile photo"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profile-photos'
  AND auth.uid() IS NOT NULL
);

-- profile-photos: users can update own
CREATE POLICY "Users can update own profile photo"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'profile-photos'
  AND auth.uid() IS NOT NULL
);

-- response-videos: doctors can upload
CREATE POLICY "Doctors can upload response videos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'response-videos'
  AND public.has_role(auth.uid(), 'doctor')
);

-- response-videos: doctors and patients can view
CREATE POLICY "Users can view response videos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'response-videos'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'patient')
    OR public.has_role(auth.uid(), 'doctor')
  )
);

-- Phase 9: Add notes column to patients table
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS notes text;
