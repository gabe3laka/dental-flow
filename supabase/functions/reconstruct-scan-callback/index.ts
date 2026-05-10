// RunPod / LingBot-Map completion callback.
//
// RunPod webhook posts the result here when the GPU job finishes.
// Auth: shared-secret bearer token (LINGBOT_API_TOKEN). If RunPod's native
// webhook does not include the bearer (it does not), the function falls back
// to matching the incoming RunPod job `id` against `scans.runpod_job_id`.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINGBOT_API_TOKEN
//
// Contract (POST):
//   ?scan_id=<uuid>          (preferred — set by reconstruct-scan)
//   Authorization: Bearer <LINGBOT_API_TOKEN>   (optional — fallback to job id match)
//
//   RunPod body shape:
//     { id, status: "COMPLETED"|"FAILED"|..., output: { pointcloud_url, metrics? }, error? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUCCESS_STATUSES = new Set([
  "complete", "completed", "success", "done",
]);
const FAILURE_STATUSES = new Set([
  "failed", "error", "cancelled", "canceled", "timed_out", "timeout",
]);

function pickPointCloudPath(body: Record<string, unknown>): string | null {
  const output = (body.output ?? {}) as Record<string, unknown>;
  const outputs = (body.outputs ?? {}) as Record<string, unknown>;
  const candidates: Array<unknown> = [
    output.pointcloud_url, output.pointcloudUrl, output.point_cloud_url,
    output.pointCloudPath, output.pointcloud_path, output.path,
    outputs.pointCloudPath, outputs.pointcloudPath, outputs.point_cloud_path,
    outputs.pointcloud_url, outputs.point_cloud_url, outputs.path,
    body.pointcloud_url, body.pointcloud_path, body.point_cloud_url, body.pointCloudPath,
  ];
  for (const c of candidates) if (typeof c === "string" && c.length > 0) return c;
  return null;
}

function pickMetrics(body: Record<string, unknown>): unknown {
  const output = (body.output ?? {}) as Record<string, unknown>;
  if (output.metrics && typeof output.metrics === "object") return output.metrics;
  if (body.metrics && typeof body.metrics === "object") return body.metrics;
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const expectedToken = Deno.env.get("LINGBOT_API_TOKEN");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const url = new URL(req.url);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Resolve scan_id: query param wins, else look up by RunPod job id.
    let scan_id =
      url.searchParams.get("scan_id") ?? url.searchParams.get("scanId") ?? null;

    const runpodJobId = typeof body.id === "string" ? body.id : null;

    if (!scan_id && runpodJobId) {
      const { data: row } = await supabase
        .from("scans")
        .select("id")
        .eq("runpod_job_id", runpodJobId)
        .maybeSingle();
      scan_id = row?.id ?? null;
    }

    if (!scan_id) {
      return new Response(JSON.stringify({ error: "scan_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth: accept matching bearer OR a callback whose RunPod job id matches
    // the scan we just looked up. RunPod's native webhook doesn't send our token.
    const presented = req.headers.get("authorization")?.replace(/^Bearer /i, "").trim();
    const tokenOk = expectedToken && presented === expectedToken;
    const jobMatchOk = !!runpodJobId; // already used to resolve scan_id when present
    if (!tokenOk && !jobMatchOk) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawStatus = String(body.status ?? "").toLowerCase();
    const isSuccess = SUCCESS_STATUSES.has(rawStatus);
    const isFailure = FAILURE_STATUSES.has(rawStatus);

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
      const metrics = pickMetrics(body);
      if (metrics) update.lingbot_metrics = metrics;

      const { error: updErr } = await supabase
        .from("scans").update(update).eq("id", scan_id);
      if (updErr) throw updErr;

      return new Response(
        JSON.stringify({ ok: true, scan_id, status: "complete" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Failure / unknown — mark failed.
    const errMsg =
      (typeof body.error === "string" ? body.error : null) ??
      (typeof body.message === "string" ? body.message : null) ??
      `RunPod reported status="${rawStatus || "unknown"}"`;

    const { error: failErr } = await supabase
      .from("scans")
      .update({
        processing_status: "failed",
        processing_error: errMsg.slice(0, 1000),
      })
      .eq("id", scan_id);
    if (failErr) throw failErr;

    return new Response(
      JSON.stringify({ ok: true, scan_id, status: isFailure ? "failed" : "unknown" }),
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
