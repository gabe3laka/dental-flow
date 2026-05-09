// LingBot-Map completion callback.
//
// The GPU host calls this when reconstruction finishes (success or failure).
// Auth is shared-secret style — `LINGBOT_API_TOKEN` in the Authorization
// header — because the caller is a backend, not a logged-in user.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINGBOT_API_TOKEN
//
// Contract (POST):
//   ?scan_id=<uuid>
//   Authorization: Bearer <LINGBOT_API_TOKEN>
//   Body (success):
//     {
//       "status": "complete" | "completed",
//       "outputs": { "pointCloudPath": "patient_id/scan_id/pointcloud.ply", … },
//       "metrics": { confidenceMean, poseStability, framesProcessed, wallClockSec, … },
//       "modelVersion": "lingbot-map-long@..."
//     }
//   Body (failure):
//     { "status": "failed" | "error", "error": "..." }
//
// Tolerates several output-key shapes so the GPU host can ship before/after
// the dispatch contract is finalized.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUCCESS_STATUSES = new Set(["complete", "completed", "success", "done"]);

function pickPointCloudPath(body: Record<string, unknown>): string | null {
  const outputs = (body.outputs ?? {}) as Record<string, unknown>;
  const candidates: Array<unknown> = [
    outputs.pointCloudPath,
    outputs.pointcloudPath,
    outputs.point_cloud_path,
    outputs.pointcloud_url,
    outputs.point_cloud_url,
    outputs.path,
    body.pointcloud_url,
    body.pointcloud_path,
    body.point_cloud_url,
    body.pointCloudPath,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const scan_id =
      url.searchParams.get("scan_id") ?? url.searchParams.get("scanId");
    if (!scan_id) {
      return new Response(JSON.stringify({ error: "scan_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expectedToken = Deno.env.get("LINGBOT_API_TOKEN");
    if (!expectedToken) {
      console.error("LINGBOT_API_TOKEN not configured — refusing all callbacks");
      return new Response(JSON.stringify({ error: "callback auth not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const presented = req.headers.get("authorization")?.replace(/^Bearer /i, "").trim();
    if (presented !== expectedToken) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const rawStatus = String(body.status ?? "").toLowerCase();
    const isSuccess = SUCCESS_STATUSES.has(rawStatus);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (isSuccess) {
      const path = pickPointCloudPath(body);
      if (!path) {
        await supabase
          .from("scans")
          .update({
            processing_status: "failed",
            processing_error: "callback succeeded but no point-cloud path provided",
          })
          .eq("id", scan_id);
        return new Response(
          JSON.stringify({ ok: false, error: "missing pointcloud path" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const update: Record<string, unknown> = {
        pointcloud_url: path,
        processing_status: "complete",
        reconstructed_at: new Date().toISOString(),
        processing_error: null,
      };
      if (body.metrics && typeof body.metrics === "object") {
        update.lingbot_metrics = body.metrics;
      }

      const { error: updErr } = await supabase
        .from("scans")
        .update(update)
        .eq("id", scan_id);
      if (updErr) throw updErr;

      return new Response(
        JSON.stringify({ ok: true, scan_id, status: "complete" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Failure path — covers 'failed', 'error', and any unknown status.
    const errMsg = (typeof body.error === "string" ? body.error : null) ??
      (typeof body.message === "string" ? body.message : null) ??
      `LingBot reported status="${rawStatus || "unknown"}"`;

    const { error: failErr } = await supabase
      .from("scans")
      .update({
        processing_status: "failed",
        processing_error: errMsg.slice(0, 1000),
      })
      .eq("id", scan_id);
    if (failErr) throw failErr;

    return new Response(
      JSON.stringify({ ok: true, scan_id, status: "failed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("reconstruct-scan-callback error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
