// Dispatches a scans row to a RunPod Serverless endpoint running LingBot-Map.
//
// Auth model:
//   - Caller's JWT verified via anon-key client (RLS gates `scans.select`)
//     so a user cannot dispatch reconstruction on someone else's scan.
//   - Service-role client used only for signing the video URL and updating
//     scans.processing_status / scans.runpod_job_id.
//
// Contract:
//   POST { scan_id: string, scan_type?: 'scope' | 'wand' }
//
// RunPod call:
//   POST {LINGBOT_API_URL}/run
//   Authorization: Bearer {LINGBOT_API_TOKEN}
//   Body: { input: { video_url, scan_id, scan_type, callback_url }, webhook }
//
// Required env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//   LINGBOT_API_URL    — full RunPod endpoint, e.g. https://api.runpod.ai/v2/<endpoint_id>
//   LINGBOT_API_TOKEN  — RunPod API key (also acts as callback shared secret)
//   ARCLINE_BASE_URL   — public Supabase functions base (defaults to SUPABASE_URL)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ScanType = "scope" | "wand";

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

    const { scan_id, scan_type } = await req.json();
    if (!scan_id) return jsonResponse({ error: "scan_id required" }, { status: 400 });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const LINGBOT_URL = Deno.env.get("LINGBOT_API_URL");
    const LINGBOT_TOKEN = Deno.env.get("LINGBOT_API_TOKEN");
    const ARCLINE_BASE = Deno.env.get("ARCLINE_BASE_URL") ?? SUPABASE_URL;

    if (!ANON_KEY) {
      console.error("SUPABASE_ANON_KEY missing — cannot enforce per-user auth");
      return jsonResponse({ error: "server misconfigured" }, { status: 503 });
    }

    // RLS-checked lookup
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: scan, error: fetchErr } = await userClient
      .from("scans")
      .select("id, patient_id, raw_video_url, scan_type, processing_status")
      .eq("id", scan_id)
      .maybeSingle();
    if (fetchErr) {
      console.error("scans select error:", fetchErr);
      return jsonResponse({ error: "forbidden" }, { status: 403 });
    }
    if (!scan) return jsonResponse({ error: "forbidden" }, { status: 403 });
    if (!scan.raw_video_url) {
      return jsonResponse({ error: "scan has no raw_video_url" }, { status: 400 });
    }

    // Service-role for trusted ops
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: signed, error: signErr } = await adminClient.storage
      .from("scan-videos")
      .createSignedUrl(scan.raw_video_url, 3600);
    if (signErr || !signed?.signedUrl) {
      console.error("sign error:", signErr);
      return jsonResponse({ error: "could not sign video URL" }, { status: 500 });
    }

    await adminClient
      .from("scans")
      .update({ processing_status: "processing" })
      .eq("id", scan_id);

    const effectiveType: ScanType = (scan.scan_type as ScanType) ?? scan_type ?? "scope";

    if (!LINGBOT_URL || !LINGBOT_TOKEN) {
      console.warn("LINGBOT_API_URL / LINGBOT_API_TOKEN not set — skipping dispatch");
      return jsonResponse({
        scan_id,
        status: "processing",
        dispatched: false,
        reason: "LINGBOT env vars not configured",
      });
    }

    const callbackUrl =
      `${ARCLINE_BASE.replace(/\/$/, "")}/functions/v1/reconstruct-scan-callback` +
      `?scan_id=${encodeURIComponent(scan_id)}`;

    const dispatch = await fetch(`${LINGBOT_URL.replace(/\/$/, "")}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${LINGBOT_TOKEN}`,
      },
      body: JSON.stringify({
        input: {
          video_url: signed.signedUrl,
          scan_id,
          scan_type: effectiveType,
          callback_url: callbackUrl,
        },
        webhook: callbackUrl,
      }),
    });

    if (!dispatch.ok) {
      const text = await dispatch.text().catch(() => "");
      await adminClient
        .from("scans")
        .update({
          processing_status: "failed",
          processing_error: `RunPod dispatch HTTP ${dispatch.status}: ${text.slice(0, 500)}`,
        })
        .eq("id", scan_id);
      return jsonResponse(
        { error: `RunPod dispatch failed: ${dispatch.status}` },
        { status: 502 },
      );
    }

    const result = await dispatch.json().catch(() => ({} as Record<string, unknown>));
    const runpodJobId = typeof result?.id === "string" ? result.id : null;

    if (runpodJobId) {
      await adminClient
        .from("scans")
        .update({ runpod_job_id: runpodJobId })
        .eq("id", scan_id);
    }

    return jsonResponse({
      scan_id,
      status: "processing",
      dispatched: true,
      runpod_job_id: runpodJobId,
    });
  } catch (e) {
    console.error("reconstruct-scan error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
});
