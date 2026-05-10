import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { logError } from "@/lib/logger";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createElement } from "react";

/**
 * Global watcher that listens for the patient's in-progress scans to finish
 * 3D reconstruction and shows a toast (with a "View" action) when one does.
 *
 * Mounted inside PatientBottomNav so it stays alive across the entire patient
 * portal. Re-queries on tab focus (visibilitychange) instead of relying on a
 * Realtime INSERT subscription filtered by patient_id, because Supabase
 * postgres_changes filters do not reliably support equality on non-PK columns.
 */
export function useScanCompletionWatcher() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const patientIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let aborted = false;
    const channels = channelsRef.current;

    const attachWatcher = (scanId: string) => {
      if (channels.has(scanId)) return;
      const channel = supabase
        .channel(`scan-watch-${scanId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "scans", filter: `id=eq.${scanId}` },
          (payload) => {
            const next = payload.new as { id: string; processing_status?: string | null };
            const status = next.processing_status;
            if (status === "complete") {
              toast({
                title: "Scan ready",
                description: "Your 3D reconstruction is complete.",
                action: createElement(
                  ToastAction,
                  {
                    altText: "View",
                    onClick: () => navigate(`/patient/scans/${next.id}/results`),
                  },
                  "View"
                ),
              });
              const ch = channels.get(scanId);
              if (ch) {
                supabase.removeChannel(ch);
                channels.delete(scanId);
              }
            } else if (status === "failed") {
              toast({
                title: "Reconstruction failed",
                description: "We couldn't build a 3D map from your last scan.",
                variant: "destructive",
              });
              const ch = channels.get(scanId);
              if (ch) {
                supabase.removeChannel(ch);
                channels.delete(scanId);
              }
            }
          }
        )
        .subscribe();
      channels.set(scanId, channel);
    };

    const refetchInProgressScans = async () => {
      try {
        let pid = patientIdRef.current;
        if (!pid) {
          const { data: patient } = await supabase
            .from("patients")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (!patient?.id) return;
          pid = patient.id;
          patientIdRef.current = pid;
        }
        const { data } = await supabase
          .from("scans")
          .select("id")
          .eq("patient_id", pid)
          .in("processing_status", ["queued", "processing"]);
        if (aborted || !data) return;
        for (const row of data) {
          attachWatcher((row as { id: string }).id);
        }
      } catch (e) {
        logError(e, { operation: "useScanCompletionWatcher/refetch", userId: user.id });
      }
    };

    refetchInProgressScans();

    const onVisibility = () => {
      if (document.visibilityState === "visible") refetchInProgressScans();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      aborted = true;
      document.removeEventListener("visibilitychange", onVisibility);
      for (const ch of channels.values()) supabase.removeChannel(ch);
      channels.clear();
      patientIdRef.current = null;
    };
  }, [user, navigate]);
}