import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ message: "No email provided" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find pending invites for this email
    const { data: invites, error } = await supabase
      .from("team_invites")
      .select("*")
      .eq("invited_email", email.toLowerCase())
      .is("accepted_at", null);

    if (error) throw error;
    if (!invites || invites.length === 0) {
      return new Response(JSON.stringify({ accepted: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Accept all pending invites
    const ids = invites.map((i: any) => i.id);
    const { error: updateErr } = await supabase
      .from("team_invites")
      .update({ accepted_at: new Date().toISOString() })
      .in("id", ids);

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ accepted: ids.length, invite_ids: ids }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
