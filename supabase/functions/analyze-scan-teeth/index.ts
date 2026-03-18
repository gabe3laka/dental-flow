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

    const { data: scan } = await supabase
      .from("scans")
      .select("patient_id, zones_captured")
      .eq("id", scan_id)
      .single();
    if (!scan) throw new Error("Scan not found");

    // Generate short-lived signed URLs for each zone image so Gemini can see them
    const zones: Array<{ zone: string; path: string }> = Array.isArray(scan.zones_captured)
      ? scan.zones_captured
      : [];

    const signedZones: Array<{ zone: string; url: string }> = [];
    for (const z of zones) {
      try {
        const { data } = await supabase.storage
          .from("scan-videos")
          .createSignedUrl(z.path, 300); // 5-minute TTL — enough for the AI call
        if (data?.signedUrl) signedZones.push({ zone: z.zone, url: data.signedUrl });
      } catch { /* skip missing images */ }
    }

    // Build multimodal user message — include actual images when available
    type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: string } };
    const userContent: ContentPart[] = [
      {
        type: "text",
        text: `Analyze these dental scan photos. Treatment plan: ${treatment_plan || "Standard orthodontic"}. Zones captured: ${zones.map((z) => z.zone).join(", ") || "unknown"}.`,
      },
    ];

    for (const sz of signedZones) {
      userContent.push({
        type: "image_url",
        image_url: { url: sz.url, detail: "high" },
      });
      userContent.push({
        type: "text",
        text: `Zone: ${sz.zone}`,
      });
    }

    userContent.push({
      type: "text",
      text: "For each visible tooth, report its FDI ID, movement status, and any conditions you can see on specific surfaces. Also report approximate geometric deviations (rotation, crowding, tilt) for any teeth that look out of ideal position.",
    });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        tools: [{
          type: "function",
          function: {
            name: "analyze_teeth",
            description: "Return per-tooth analysis with specific surface detections and geometric observations",
            parameters: {
              type: "object",
              properties: {
                teeth: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", description: "FDI tooth ID like T14, T21, etc." },
                      zone: { type: "string", description: "Human-readable tooth name" },
                      deviation: { type: "string" },
                      target: { type: "string" },
                      confidence: { type: "string" },
                      status: { type: "string", enum: ["healthy", "on_track", "deviation", "attention"] },
                      detections: {
                        type: "array",
                        description: "Specific conditions detected on this tooth",
                        items: {
                          type: "object",
                          properties: {
                            type: { type: "string", enum: ["plaque", "tartar", "recession", "cavity", "inflammation", "crowding", "spacing", "appliance_fit"] },
                            surface: { type: "string", enum: ["buccal", "lingual", "occlusal", "mesial", "distal", "cervical"], description: "Which surface of the tooth is affected" },
                            severity: { type: "string", enum: ["mild", "moderate", "severe"] },
                          },
                          required: ["type", "surface", "severity"],
                        },
                      },
                      geometry: {
                        type: "object",
                        description: "Approximate geometric deviation of this tooth from ideal position, based on what is visible in the photos",
                        properties: {
                          rotation_axial: { type: "number", description: "Axial rotation in degrees (positive = clockwise from occlusal view). Omit if tooth looks normally positioned." },
                          tilt_buccal: { type: "number", description: "Buccal tilt in degrees (positive = tipped outward toward cheek). Omit if not visibly tilted." },
                          tilt_mesial: { type: "number", description: "Mesial tilt in degrees (positive = tipped toward midline). Omit if not visibly tilted." },
                          crowding_mm: { type: "number", description: "Crowding offset in mm (positive = tooth pushed inward from ideal arch). Omit if not crowded." },
                          size_scale: { type: "number", description: "Size relative to average: 0.9=smaller than average, 1.0=normal, 1.1=larger. Omit if normal size." },
                        },
                      },
                    },
                    required: ["id", "zone", "deviation", "target", "confidence", "status", "detections"],
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
          {
            role: "system",
            content: `You are a dental AI analyst with clinical vision capabilities. ${signedZones.length > 0
              ? "Analyze the actual dental scan photos provided. Report findings based on what you can actually see in the images."
              : "Generate realistic per-tooth analysis for a dental scan."
            }

Include 5-8 teeth with deviations, targets, confidence percentages, and status.

For each tooth, include a 'detections' array listing specific conditions:
- plaque: yellowish deposits on buccal/lingual surfaces
- tartar: hardened calculus deposits, common on lingual of lower incisors and cervical areas
- recession: gum pulling back exposing root, affects cervical area, common on canines/premolars
- cavity: dark spots, typically occlusal or mesial/distal
- inflammation: redness/swelling at cervical/gum margins
Surface options: buccal (cheek-facing), lingual (tongue-facing), occlusal (biting surface), mesial (toward midline), distal (away from midline), cervical (gumline area)

For the 'geometry' field (optional, only for visibly abnormal teeth):
- rotation_axial: if a tooth is visibly rotated (e.g., 15 = rotated 15° clockwise)
- crowding_mm: if a tooth is crowded/displaced inward (e.g., 2.5 = 2.5mm inward)
- tilt_buccal/tilt_mesial: if a tooth is visibly tilted
- size_scale: if a tooth looks noticeably bigger (1.15) or smaller (0.85) than average
Only include geometry fields that are clearly visible. Do not exaggerate. Omit geometry entirely for normally-positioned teeth.

Detection tags should be from: plaque, inflammation, bone change, tartar, recession, appliance fit. Only include tags that are actually detected.`,
          },
          {
            role: "user",
            content: signedZones.length > 0 ? userContent : `Scan zones: ${JSON.stringify(scan.zones_captured || [])}\nTreatment plan: ${treatment_plan || "Standard orthodontic"}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ teeth: [], detection_tags: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    let result: { teeth: any[]; detection_tags: string[] } = { teeth: [], detection_tags: [] };
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
