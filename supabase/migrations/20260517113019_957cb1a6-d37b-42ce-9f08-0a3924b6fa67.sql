
CREATE OR REPLACE FUNCTION public.list_stale_storage_objects(
  _bucket_id text,
  _older_than timestamptz,
  _limit int DEFAULT 1000
)
RETURNS TABLE(name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = _bucket_id
    AND o.created_at < _older_than
  LIMIT _limit;
$$;

REVOKE ALL ON FUNCTION public.list_stale_storage_objects(text, timestamptz, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_stale_storage_objects(text, timestamptz, int) TO service_role;
