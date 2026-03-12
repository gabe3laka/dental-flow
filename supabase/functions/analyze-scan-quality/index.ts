import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { scan_id } = await req.json();
    if (!scan_id) throw new Error("scan_id required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: scan } = await supabase.from("scans").select("zones_captured, quality_score").eq("id", scan_id).single();
    if (!scan) throw new Error("Scan not found");

    const zonesInfo = scan.zones_captured ? JSON.stringify(scan.zones_captured) : "5 zones captured";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        tools: [{
          type: "function",
          function: {
            name: "score_quality",
            description: "Return a scan quality score from 0-100",
            parameters: {
              type: "object",
              properties: { quality_score: { type: "number", description: "Quality score 0-100" }, feedback: { type: "string", description: "Brief quality feedback" } },
              required: ["quality_score", "feedback"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "score_quality" } },
        messages: [
          { role: "system", content: "You are a dental scan quality analyzer. Based on the scan metadata, estimate a quality score from 0-100." },
          { role: "user", content: `Scan zones: ${zonesInfo}` },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ quality_score: scan.quality_score || 85, feedback: "Auto-scored" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    let result = { quality_score: 85, feedback: "Good quality scan" };
    try {
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) result = JSON.parse(toolCall.function.arguments);
    } catch { /* use default */ }

    await supabase.from("scans").update({ quality_score: result.quality_score }).eq("id", scan_id);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analyze-scan-quality error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
