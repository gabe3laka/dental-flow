import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { logError } from "@/lib/logger";

export function useSubscription() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("doctor_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (query.error) {
      logError(query.error, { operation: "useSubscription/fetchSubscription", userId: user?.id });
    }
  }, [query.error, user?.id]);

  return query;
}
