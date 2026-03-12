import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { logError } from "@/lib/logger";

export function useDoctorPatients() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["patients", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, user_id, total_scans, treatment_category, created_at")
        .eq("assigned_doctor_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (query.error) {
      logError(query.error, { operation: "useDoctorPatients/fetchPatients", userId: user?.id });
    }
  }, [query.error, user?.id]);

  return query;
}
