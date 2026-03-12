import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";

export function useFeatureFlag(flagKey: string): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("feature_flags").select("enabled").eq("flag_key", flagKey).maybeSingle();
        if (!data) {
          logError("Feature flag row missing", { operation: "use-feature-flag", extra: { flagKey } });
          setEnabled(false);
          return;
        }
        setEnabled(data.enabled ?? false);
      } catch (e) {
        logError(e, { operation: "use-feature-flag/fetch", extra: { flagKey } });
        setEnabled(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [flagKey]);

  return { enabled, loading };
}
