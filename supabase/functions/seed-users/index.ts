import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const USERS = [
  { email: "user@test.com", password: "password123", role: "patient", full_name: "Test Patient" },
  { email: "doctor@test.com", password: "password123", role: "doctor", full_name: "Test Doctor" },
  { email: "admin@test.com", password: "password123", role: "admin", full_name: "Admin User" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const results = [];

    for (const u of USERS) {
      const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
      const alreadyExists = existing?.users?.find((x) => x.email === u.email);

      if (alreadyExists) {
        const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
          alreadyExists.id,
          { password: u.password }
        );
        results.push({ email: u.email, status: updateErr ? "update_error" : "password_updated" });
        continue;
      }

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { role: u.role, full_name: u.full_name },
      });

      if (error) {
        results.push({ email: u.email, status: "error", message: error.message });
      } else {
        results.push({ email: u.email, status: "created", id: data.user.id });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
