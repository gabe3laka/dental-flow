// Dispatches a scans row to the LingBot-Map GPU server for 3D reconstruction.
//
// Contract:
//   POST { scan_id: string, scan_type?: 'scope' | 'wand' }
//
// Behavior:
//   1. Looks up the scan + patient.
//   2. Signs a 1-hour read URL for raw_video_url.
//   3. POSTs to the LingBot host's /v1/reconstruct endpoint.
//   4. Updates scans.processing_status to 'processing'.
//
// LingBot calls back to /functions/v1/reconstruct-scan-callback when done.
// (That callback handler is intentionally separate; not part of this file.)
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { scan_id, scan_type } = await req.json();
    if (!scan_id) throw new Error("scan_id required");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LINGBOT_URL = Deno.env.get("LINGBOT_API_URL");
    const LINGBOT_TOKEN = Deno.env.get("LINGBOT_API_TOKEN");
    const ARCLINE_BASE = Deno.env.get("ARCLINE_BASE_URL") ?? SUPABASE_URL;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: scan, error: fetchErr } = await supabase
      .from("scans")
      .select("id, patient_id, raw_video_url, scan_type, processing_status")
      .eq("id", scan_id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!scan) throw new Error("Scan not found");
    if (!scan.raw_video_url) throw new Error("Scan has no raw_video_url");

    const effectiveType: ScanType = (scan.scan_type as ScanType) ?? scan_type ?? "scope";

    // Sign a 1-hour read URL for the raw video so the GPU host can pull it.
    const { data: signed, error: signErr } = await supabase.storage
      .from("scan-videos")
      .createSignedUrl(scan.raw_video_url, 3600);
    if (signErr || !signed?.signedUrl) {
      throw new Error(`Could not sign video URL: ${signErr?.message ?? "no url"}`);
    }

    // Mark the scan as processing immediately so the UI polls correctly.
    await supabase
      .from("scans")
      .update({ processing_status: "processing" })
      .eq("id", scan_id);

    // If the GPU host isn't configured yet, we still leave the scan in
    // 'processing' so a worker can pick it up later. Don't fail the request.
    if (!LINGBOT_URL || !LINGBOT_TOKEN) {
      console.warn("LINGBOT_API_URL / LINGBOT_API_TOKEN not set — skipping dispatch");
      return new Response(
        JSON.stringify({
          scan_id,
          status: "processing",
          dispatched: false,
          reason: "LINGBOT env vars not configured",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const callbackUrl = `${ARCLINE_BASE.replace(/\/$/, "")}/functions/v1/reconstruct-scan-callback?scan_id=${encodeURIComponent(scan_id)}`;

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
      await supabase
        .from("scans")
        .update({
          processing_status: "failed",
          processing_error: `LingBot dispatch HTTP ${dispatch.status}: ${text.slice(0, 500)}`,
        })
        .eq("id", scan_id);
      throw new Error(`LingBot dispatch failed: ${dispatch.status}`);
    }

    return new Response(
      JSON.stringify({ scan_id, status: "processing", dispatched: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("reconstruct-scan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
