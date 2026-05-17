// Dispatches a World Labs Marble world-generation job for the
// "AI Visual Guide (beta)" feature. Uses the documented Marble API:
//   POST https://api.worldlabs.ai/marble/v1/worlds:generate
//   Header: WLT-Api-Key: <WORLDLABS_API_KEY>
// See: https://docs.worldlabs.ai

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MARBLE_BASE = "https://api.worldlabs.ai/marble/v1";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return jsonResponse({ error: "unauthorized" }, { status: 401 });

    const { scan_id, patient_id, reference_board_url, mode } = await req.json();
    if (!scan_id || !patient_id || !reference_board_url) {
      return jsonResponse({ error: "scan_id, patient_id, reference_board_url required" }, { status: 400 });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const WORLDLABS_API_KEY = Deno.env.get("WORLDLABS_API_KEY");

    if (!ANON_KEY) {
      console.error("SUPABASE_ANON_KEY missing — cannot enforce per-user auth");
      return jsonResponse({ error: "server misconfigured" }, { status: 503 });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: scan, error: fetchErr } = await userClient
      .from("scans")
      .select("id, patient_id, reference_board_url")
      .eq("id", scan_id)
      .maybeSingle();
    if (fetchErr || !scan) return jsonResponse({ error: "forbidden" }, { status: 403 });
    if (scan.patient_id !== patient_id) {
      return jsonResponse({ error: "patient_id mismatch" }, { status: 403 });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (!WORLDLABS_API_KEY) {
      console.warn("WORLDLABS_API_KEY not set — skipping dispatch");
      await adminClient
        .from("scans")
        .update({
          generation_engine: "worldlabs_fal",
          generation_status: "failed",
          generation_error: "WORLDLABS_API_KEY not configured",
          generation_started_at: new Date().toISOString(),
        })
        .eq("id", scan_id);
      return jsonResponse({ scan_id, dispatched: false, reason: "WORLDLABS_API_KEY not configured" });
    }

    // Sign reference board for the external API
    const { data: signed, error: signErr } = await adminClient.storage
      .from("scan-reference-boards")
      .createSignedUrl(reference_board_url, 3600);
    if (signErr || !signed?.signedUrl) {
      console.error("sign error:", signErr);
      return jsonResponse({ error: "could not sign reference board" }, { status: 500 });
    }

    await adminClient
      .from("scans")
      .update({
        generation_engine: "worldlabs_marble",
        generation_status: "generating_scene",
        generation_started_at: new Date().toISOString(),
        generation_error: null,
      })
      .eq("id", scan_id);

    let dispatchOk = false;
    let operationId: string | null = null;
    let dispatchErr: string | null = null;
    try {
      const dispatch = await fetch(`${MARBLE_BASE}/worlds:generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "WLT-Api-Key": WORLDLABS_API_KEY,
        },
        body: JSON.stringify({
          display_name: `Dental Visual Guide ${scan_id}`,
          model: "marble-1.1",
          world_prompt: {
            type: "image",
            image_prompt: { source: "uri", uri: signed.signedUrl },
          },
        }),
      });
      if (!dispatch.ok) {
        const text = await dispatch.text().catch(() => "");
        dispatchErr = `Marble HTTP ${dispatch.status}: ${text.slice(0, 500)}`;
      } else {
        const result = await dispatch.json().catch(() => ({} as Record<string, unknown>));
        operationId = (result?.operation_id ?? null) as string | null;
        dispatchOk = true;
      }
    } catch (e) {
      dispatchErr = e instanceof Error ? e.message : "Network error";
    }

    if (!dispatchOk) {
      await adminClient
        .from("scans")
        .update({
          generation_status: "failed",
          generation_error: dispatchErr ?? "Dispatch failed",
        })
        .eq("id", scan_id);
      return jsonResponse({ error: dispatchErr ?? "Dispatch failed" }, { status: 502 });
    }

    if (operationId) {
      await adminClient
        .from("scans")
        .update({ generation_job_id: operationId })
        .eq("id", scan_id);
    }

    return jsonResponse({ scan_id, dispatched: true, generation_job_id: operationId });
  } catch (e) {
    console.error("generate-visual-guide error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
});
