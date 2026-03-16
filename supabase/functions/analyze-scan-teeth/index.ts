import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { scan_id, treatment_plan } = await req.json();
    if (!scan_id) throw new Error("scan_id required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: scan } = await supabase.from("scans").select("patient_id, zones_captured").eq("id", scan_id).single();
    if (!scan) throw new Error("Scan not found");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        tools: [{
          type: "function",
          function: {
            name: "analyze_teeth",
            description: "Return per-tooth analysis and detection tags",
            parameters: {
              type: "object",
              properties: {
                teeth: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      zone: { type: "string" },
                      deviation: { type: "string" },
                      target: { type: "string" },
                      confidence: { type: "string" },
                      status: { type: "string" },
                    },
                    required: ["id", "zone", "deviation", "target", "confidence", "status"],
                  },
                },
                detection_tags: { type: "array", items: { type: "string" } },
              },
              required: ["teeth", "detection_tags"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "analyze_teeth" } },
        messages: [
          { role: "system", content: "You are a dental AI analyst. Generate realistic per-tooth analysis for a dental scan. Include 3-5 teeth with deviations, targets, confidence percentages, and status. Detection tags should be from: plaque, inflammation, bone change, tartar, recession, appliance fit. Only include tags that are detected." },
          { role: "user", content: `Scan zones: ${JSON.stringify(scan.zones_captured || [])}\nTreatment plan: ${treatment_plan || "Standard orthodontic"}` },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ teeth: [], detection_tags: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    let result = { teeth: [], detection_tags: [] };
    try {
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) result = JSON.parse(toolCall.function.arguments);
    } catch { /* use default */ }

    // Update scan with detection tags and full AI analysis (no auto-send to doctor)
    await supabase.from("scans").update({ 
      detection_tags: result.detection_tags,
      ai_analysis: result,
    }).eq("id", scan_id);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analyze-scan-teeth error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
