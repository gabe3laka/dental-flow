import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { logError } from "@/lib/logger";

interface PatientData {
  complianceStreak: number;
  currentStage: number;
  totalStages: number;
  treatmentType: string | null;
  progressPercent: number;
  hasStarted: boolean;
  nextCheckInDays: number | null;
  unreadCount: number;
  latestMessage: { content: string; senderName: string } | null;
  doctorName: string | null;
  hasScanData: boolean;
}

export function usePatientData() {
  const { user } = useAuth();
  const [data, setData] = useState<PatientData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetch() {
      try {
        // Get patient record
        const { data: patient } = await supabase
          .from("patients")
          .select("*")
          .eq("user_id", user!.id)
          .maybeSingle();

        if (!patient) {
          logError("Patient row missing", { operation: "use-patient-data/loadPatient", userId: user!.id });
          if (!cancelled) setLoading(false);
          return;
        }
        if (cancelled) { setLoading(false); return; }

        // Parallel queries
        const [scansRes, unreadRes, latestMsgRes, doctorRes] = await Promise.allSettled([
          supabase
            .from("scans")
            .select("submitted_at")
            .eq("patient_id", patient.id)
            .order("submitted_at", { ascending: false })
            .limit(1),
          supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("receiver_id", user!.id)
            .is("read_at", null),
          supabase
            .from("messages")
            .select("content, sender_id")
            .eq("receiver_id", user!.id)
            .is("read_at", null)
            .order("created_at", { ascending: false })
            .limit(1),
          patient.assigned_doctor_id
            ? supabase
                .from("profiles")
                .select("full_name")
                .eq("user_id", patient.assigned_doctor_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        if (cancelled) return;

        const scansData = scansRes.status === "fulfilled" ? scansRes.value.data : null;
        const unreadData = unreadRes.status === "fulfilled" ? unreadRes.value : null;
        const latestMsgData = latestMsgRes.status === "fulfilled" ? latestMsgRes.value.data : null;
        const doctorData = doctorRes.status === "fulfilled" ? doctorRes.value.data : null;

        const latestScan = scansData?.[0];
        let nextCheckInDays: number | null = null;
        if (latestScan) {
          const next = new Date(latestScan.submitted_at);
          next.setDate(next.getDate() + 14);
          nextCheckInDays = Math.max(0, Math.ceil((next.getTime() - Date.now()) / 86400000));
        }

        const progress = patient.total_stages
          ? Math.round(((patient.current_stage || 0) / patient.total_stages) * 100)
          : 0;

        let latestMessage: PatientData["latestMessage"] = null;
        if (latestMsgData?.[0]) {
          const msg = latestMsgData[0];
          const { data: senderProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", msg.sender_id)
            .maybeSingle();
          if (!senderProfile) {
            logError("Sender profile missing", { operation: "use-patient-data/loadSenderProfile", userId: user!.id });
          }
          latestMessage = {
            content: msg.content || "",
            senderName: senderProfile?.full_name || "Doctor",
          };
        }

        if (cancelled) return;

        setData({
          complianceStreak: patient.compliance_streak || 0,
          currentStage: patient.current_stage || 1,
          totalStages: patient.total_stages || 1,
          treatmentType: patient.treatment_type,
          progressPercent: progress,
          hasStarted: !!(patient.start_date && (patient.current_stage || 0) > 0),
          nextCheckInDays,
          unreadCount: unreadData?.count || 0,
          latestMessage,
          doctorName: doctorData?.full_name || null,
          hasScanData: !!latestScan,
        });
      } catch (e) {
        logError(e, { operation: "use-patient-data/fetch", userId: user?.id });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [user]);

  return { data, loading };
}
