import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all enabled automations
    const { data: automations, error: autoErr } = await supabase
      .from("automations")
      .select("*")
      .eq("enabled", true);

    if (autoErr) throw autoErr;
    if (!automations || automations.length === 0) {
      return new Response(JSON.stringify({ message: "No active automations" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let messagesSent = 0;

    for (const auto of automations) {
      const { doctor_id, trigger_type, trigger_days, message_template, action_type } = auto;

      // Get all patients assigned to this doctor
      const { data: patients } = await supabase
        .from("patients")
        .select("id, user_id, compliance_streak")
        .eq("assigned_doctor_id", doctor_id);

      if (!patients || patients.length === 0) continue;

      for (const patient of patients) {
        let shouldSend = false;

        if (trigger_type === "no_scan") {
          // Check if patient has submitted a scan in the last trigger_days
          const cutoff = new Date(Date.now() - trigger_days * 86400000).toISOString();
          const { data: recentScans } = await supabase
            .from("scans")
            .select("id")
            .eq("patient_id", patient.id)
            .gte("submitted_at", cutoff)
            .limit(1);
          shouldSend = !recentScans || recentScans.length === 0;
        } else if (trigger_type === "low_compliance") {
          shouldSend = (patient.compliance_streak || 0) < trigger_days;
        } else if (trigger_type === "recurring") {
          // Check if an automated message was sent in the last trigger_days
          const cutoff = new Date(Date.now() - trigger_days * 86400000).toISOString();
          const { data: recentMsgs } = await supabase
            .from("messages")
            .select("id")
            .eq("sender_id", doctor_id)
            .eq("receiver_id", patient.user_id)
            .gte("created_at", cutoff)
            .limit(1);
          shouldSend = !recentMsgs || recentMsgs.length === 0;
        }

        if (shouldSend && message_template) {
          // Get patient name
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", patient.user_id)
            .single();

          const patientName = profile?.full_name || "Patient";
          const content = message_template
            .replace("{patient_name}", patientName)
            .replace("{days}", String(trigger_days));

          await supabase.from("messages").insert({
            sender_id: doctor_id,
            receiver_id: patient.user_id,
            content,
            message_type: "text",
          });
          messagesSent++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, messages_sent: messagesSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
