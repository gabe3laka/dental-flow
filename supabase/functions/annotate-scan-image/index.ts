import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageUrl, zone, detections } = await req.json();
    if (!imageUrl || !zone) throw new Error("imageUrl and zone required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        tools: [{
          type: "function",
          function: {
            name: "annotate_image",
            description: "Return bounding box annotations for detected dental issues in the image",
            parameters: {
              type: "object",
              properties: {
                annotations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", description: "Detection type e.g. plaque, tartar" },
                      bbox: {
                        type: "object",
                        properties: {
                          x: { type: "number", description: "Left position as percentage 0-100" },
                          y: { type: "number", description: "Top position as percentage 0-100" },
                          width: { type: "number", description: "Width as percentage 0-100" },
                          height: { type: "number", description: "Height as percentage 0-100" },
                        },
                        required: ["x", "y", "width", "height"],
                      },
                      description: { type: "string" },
                    },
                    required: ["type", "bbox", "description"],
                  },
                },
              },
              required: ["annotations"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "annotate_image" } },
        messages: [
          {
            role: "system",
            content: "You are a dental image analyst. Given a dental scan image and detected issues, provide bounding box coordinates (as percentages) for where each issue appears in the image. Be precise with coordinates.",
          },
          {
            role: "user",
            content: `Zone: ${zone}\nDetections: ${JSON.stringify(detections || [])}\nAnalyze the dental scan and provide annotation coordinates for the detected issues.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI error:", response.status, await response.text());
      return new Response(JSON.stringify({ annotations: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let result = { annotations: [] };
    try {
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) result = JSON.parse(toolCall.function.arguments);
    } catch { /* use default */ }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("annotate-scan-image error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
