// RunPod / LingBot-Map + Splat completion callback.
//
// RunPod webhook posts the result here when a GPU job finishes. The
// function now routes between two parallel pipelines that share this
// endpoint: LingBot (writes pointcloud_url / processing_status / etc.)
// and Splat (writes splat_url / splat_processing_status / etc.).
//
// Routing:
//   1. Primary discriminator — `?pipeline=splat` on the query string
//      (set by the reconstruct-splat dispatcher). `?pipeline=lingbot` or
//      no `pipeline` param falls back to the LingBot branch.
//   2. Fallback when `pipeline` is absent — match the inbound
//      `envelope.id` (RunPod job id) against `scans.runpod_splat_job_id`
//      first, then `scans.runpod_job_id`. The first match picks the
//      pipeline and the scan_id at the same time.
//
// Auth: shared-secret bearer token (LINGBOT_API_TOKEN). If RunPod's
// native webhook does not include the bearer (it does not by default),
// the function falls back to matching the incoming RunPod job `id`
// against scans.runpod_*_job_id (same as before).
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINGBOT_API_TOKEN
//
// Contract (POST):
//   ?scan_id=<uuid>          (preferred — set by both dispatchers)
//   ?pipeline=splat          (set by reconstruct-splat dispatcher; absent for LingBot)
//   Authorization: Bearer <LINGBOT_API_TOKEN>   (optional — fallback to job id match)
//
//   RunPod body shape:
//     {
//       id,
//       status: "COMPLETED"|"FAILED"|"IN_PROGRESS"|...,
//       output: { pointcloud_url | ply_path | splat_url | ..., metrics? },
//       error?
//     }

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
const INTERIM_STATUSES = new Set([
  "in_progress", "in_queue", "queued", "retrying", "throttled",
]);

// LingBot pointcloud field names (preserved exactly as today).
const PLY_KEYS = [
  "pointcloud_url",
  "ply_path",
  "plyPath",
  "pointCloudUrl",
  "point_cloud_url",
  "pointcloud_path",
  "pointcloudUrl",
  "pointCloudPath",
  "path",
] as const;

// Splat field names (new).
const SPLAT_KEYS = [
  "splat_url",
  "splat_path",
  "splatPath",
] as const;

function pickStringFrom(
  src: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): string | null {
  if (!src) return null;
  for (const k of keys) {
    const v = src[k];
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

function pickPath(body: Record<string, unknown>, keys: readonly string[]): string | null {
  const top = pickStringFrom(body, keys);
  if (top) return top;

  const output = (body.output && typeof body.output === "object")
    ? body.output as Record<string, unknown>
    : null;
  const fromOutput = pickStringFrom(output, keys);
  if (fromOutput) return fromOutput;

  const outputs = (body.outputs && typeof body.outputs === "object")
    ? body.outputs as Record<string, unknown>
    : null;
  return pickStringFrom(outputs, keys);
}

function pickMetrics(body: Record<string, unknown>): unknown {
  if (body.metrics && typeof body.metrics === "object") return body.metrics;
  const output = body.output as Record<string, unknown> | undefined;
  if (output?.metrics && typeof output.metrics === "object") return output.metrics;
  const outputs = body.outputs as Record<string, unknown> | undefined;
  if (outputs?.metrics && typeof outputs.metrics === "object") return outputs.metrics;
  return null;
}

type Pipeline = "lingbot" | "splat";

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

    // Diagnostic: emit the full payload so we can see exactly what RunPod sends.
    console.log("[reconstruct-scan-callback] payload", JSON.stringify(body));

    // Unwrap RunPod's envelope: body.output is the worker's return value.
    const output = (body && typeof body.output === "object" && body.output !== null)
      ? body.output as Record<string, unknown>
      : {};
    const merged: Record<string, unknown> = { ...output, ...body };

    // ── Pipeline discriminator: query param wins, else inferred by job-id match.
    const pipelineParam = (url.searchParams.get("pipeline") ?? "").toLowerCase();
    let pipeline: Pipeline | null =
      pipelineParam === "splat" ? "splat"
      : pipelineParam === "lingbot" ? "lingbot"
      : null;

    // ── Resolve scan_id: query param wins, else look up by RunPod job id.
    let scan_id =
      url.searchParams.get("scan_id") ?? url.searchParams.get("scanId") ?? null;

    const runpodJobId = typeof merged.id === "string" ? merged.id : null;

    if (!scan_id && runpodJobId) {
      // Splat side first (per spec), then LingBot fallback.
      if (pipeline !== "lingbot") {
        const { data: splatRow } = await supabase
          .from("scans")
          .select("id")
          .eq("runpod_splat_job_id", runpodJobId)
          .maybeSingle();
        if (splatRow?.id) {
          scan_id = splatRow.id;
          if (!pipeline) pipeline = "splat";
        }
      }
      if (!scan_id && pipeline !== "splat") {
        const { data: lingbotRow } = await supabase
          .from("scans")
          .select("id")
          .eq("runpod_job_id", runpodJobId)
          .maybeSingle();
        if (lingbotRow?.id) {
          scan_id = lingbotRow.id;
          if (!pipeline) pipeline = "lingbot";
        }
      }
    }

    if (!scan_id) {
      return new Response(JSON.stringify({ error: "scan_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default to lingbot when still undetermined (matches pre-splat behaviour).
    const effectivePipeline: Pipeline = pipeline ?? "lingbot";

    // Auth: matching bearer OR a callback whose RunPod job id was present.
    const presented = req.headers.get("authorization")?.replace(/^Bearer /i, "").trim();
    const tokenOk = expectedToken && presented === expectedToken;
    const jobMatchOk = !!runpodJobId;
    if (!tokenOk && !jobMatchOk) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawStatus = String(merged.status ?? "").toLowerCase();
    const isSuccess = SUCCESS_STATUSES.has(rawStatus);
    const isFailure = FAILURE_STATUSES.has(rawStatus);

    // ── Column names per pipeline. Splat branch writes ONLY splat columns;
    // ── LingBot branch writes ONLY LingBot columns. Never both.
    const cols = effectivePipeline === "splat"
      ? {
          url:               "splat_url",
          status:            "splat_processing_status",
          error:             "splat_processing_error",
          reconstructed_at:  "splat_reconstructed_at",
          metrics:           "splat_metrics",
          missing_path_msg:  "callback succeeded but no splat path provided",
          path_keys:         SPLAT_KEYS,
        }
      : {
          url:               "pointcloud_url",
          status:            "processing_status",
          error:             "processing_error",
          reconstructed_at:  "reconstructed_at",
          metrics:           "lingbot_metrics",
          missing_path_msg:  "callback succeeded but no point-cloud path provided",
          path_keys:         PLY_KEYS,
        };

    if (isSuccess) {
      const path = pickPath(merged, cols.path_keys);
      if (!path) {
        const payloadSnippet = JSON.stringify(body).slice(0, 500);
        await supabase
          .from("scans")
          .update({
            [cols.status]: "failed",
            [cols.error]: `${cols.missing_path_msg}. payload=${payloadSnippet}`,
          })
          .eq("id", scan_id);
        return new Response(
          JSON.stringify({ ok: false, pipeline: effectivePipeline, error: "missing path" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const update: Record<string, unknown> = {
        [cols.url]: path,
        [cols.status]: "complete",
        [cols.reconstructed_at]: new Date().toISOString(),
        [cols.error]: null,
      };
      const metrics = pickMetrics(merged);
      if (metrics) update[cols.metrics] = metrics;

      const { error: updErr } = await supabase
        .from("scans").update(update).eq("id", scan_id);
      if (updErr) throw updErr;

      return new Response(
        JSON.stringify({ ok: true, scan_id, pipeline: effectivePipeline, status: "complete" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Interim statuses (job still running) — just acknowledge, don't fail.
    if (INTERIM_STATUSES.has(rawStatus)) {
      return new Response(
        JSON.stringify({ ok: true, scan_id, pipeline: effectivePipeline, status: "pending" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Failure / unknown — mark failed on the appropriate pipeline column.
    const errMsg =
      (typeof merged.error === "string" ? merged.error : null) ??
      (typeof merged.message === "string" ? merged.message : null) ??
      `RunPod reported status="${rawStatus || "unknown"}"`;

    const { error: failErr } = await supabase
      .from("scans")
      .update({
        [cols.status]: "failed",
        [cols.error]: errMsg.slice(0, 1000),
      })
      .eq("id", scan_id);
    if (failErr) throw failErr;

    return new Response(
      JSON.stringify({
        ok: true,
        scan_id,
        pipeline: effectivePipeline,
        status: isFailure ? "failed" : "unknown",
      }),
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
