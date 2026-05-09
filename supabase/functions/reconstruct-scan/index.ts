// Dispatches a scans row to the LingBot-Map GPU server for 3D reconstruction.
//
// Auth model:
//   - `verify_jwt = true` in supabase/config.toml → Supabase rejects un-authed
//     calls at the gateway. Inside the function we additionally use the
//     caller's JWT against an anon-key client so RLS gates `scans.select`
//     to scans the user is allowed to see. This blocks a logged-in user
//     from triggering reconstruction on someone else's scan.
//   - The service-role client is used only for the post-validation update +
//     storage signing. It is never exposed to the caller.
//
// Contract:
//   POST { scan_id: string, scan_type?: 'scope' | 'wand' }
//
// Behavior:
//   1. Verify caller can see the scan (RLS via JWT).
//   2. Sign a 1-hour read URL for raw_video_url (service role).
//   3. POST to the LingBot host's /v1/reconstruct endpoint.
//   4. Mark scans.processing_status = 'processing'.
//
// LingBot calls back to /functions/v1/reconstruct-scan-callback (separate
// function, verify_jwt=false, validates LINGBOT_API_TOKEN).
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//   LINGBOT_API_URL    — e.g. https://lingbot.arcline.app
//   LINGBOT_API_TOKEN  — bearer token shared with the GPU host
//   ARCLINE_BASE_URL   — public base URL where the callback function lives

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
    if (!authHeader) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }

    const { scan_id, scan_type } = await req.json();
    if (!scan_id) {
      return jsonResponse({ error: "scan_id required" }, { status: 400 });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const LINGBOT_URL = Deno.env.get("LINGBOT_API_URL");
    const LINGBOT_TOKEN = Deno.env.get("LINGBOT_API_TOKEN");
    const ARCLINE_BASE = Deno.env.get("ARCLINE_BASE_URL") ?? SUPABASE_URL;

    if (!ANON_KEY) {
      // Refuse rather than silently fall through to service-role: we *must*
      // verify the caller can see the scan before triggering GPU work.
      console.error("SUPABASE_ANON_KEY missing — cannot enforce per-user auth");
      return jsonResponse({ error: "server misconfigured" }, { status: 503 });
    }

    // 1. RLS-checked lookup using the caller's JWT.
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
      // RLS denial typically returns no row, but if a real error surfaces,
      // log and present as forbidden to avoid leaking internals.
      console.error("scans select error:", fetchErr);
      return jsonResponse({ error: "forbidden" }, { status: 403 });
    }
    if (!scan) {
      return jsonResponse({ error: "forbidden" }, { status: 403 });
    }
    if (!scan.raw_video_url) {
      return jsonResponse({ error: "scan has no raw_video_url" }, { status: 400 });
    }

    // 2. Service-role client for trusted ops (sign URL, mark processing).
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

    // 3. If the GPU host isn't configured yet, leave the scan in 'processing'
    //    so a worker can pick it up later. Don't fail the user-facing request.
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

    const dispatch = await fetch(`${LINGBOT_URL.replace(/\/$/, "")}/v1/reconstruct`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${LINGBOT_TOKEN}`,
      },
      body: JSON.stringify({
        scanId: scan_id,
        videoUrl: signed.signedUrl,
        callbackUrl,
        scanType: effectiveType,
        mode: effectiveType === "wand" ? "windowed" : "stream",
        fps: 15,
        keyframeInterval: 2,
        cameraNumIterations: 2,
      }),
    });

    if (!dispatch.ok) {
      const text = await dispatch.text().catch(() => "");
      await adminClient
        .from("scans")
        .update({
          processing_status: "failed",
          processing_error: `LingBot dispatch HTTP ${dispatch.status}: ${text.slice(0, 500)}`,
        })
        .eq("id", scan_id);
      return jsonResponse(
        { error: `LingBot dispatch failed: ${dispatch.status}` },
        { status: 502 },
      );
    }

    return jsonResponse({ scan_id, status: "processing", dispatched: true });
  } catch (e) {
    console.error("reconstruct-scan error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
});
