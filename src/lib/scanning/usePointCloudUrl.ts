import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UsePointCloudUrlResult {
  url: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Resolves a Supabase Storage object path under the `scan-pointclouds` bucket
 * to a short-lived signed URL suitable for `PointCloudViewer`.
 *
 * Pass `path = null` for the empty state — the hook returns `{ url: null }`
 * without making a request.
 */
export function usePointCloudUrl(
  path: string | null,
  ttlSec = 3600,
  bucket = "scan-pointclouds",
): UsePointCloudUrlResult {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: signErr } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, ttlSec);
        if (cancelled) return;
        if (signErr || !data?.signedUrl) {
          setError(signErr?.message ?? "Could not sign URL");
          setUrl(null);
        } else {
          setUrl(data.signedUrl);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, ttlSec, bucket]);

  return { url, loading, error };
}
