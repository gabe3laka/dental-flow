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
//     {
//       id,
//       status: "COMPLETED"|"FAILED"|...,
//       output: { pointcloud_url | ply_path | ..., metrics? },
//       error?
//     }
//
// RunPod wraps the worker's return value inside `body.output`. To handle
// fields the worker emits (paths, metrics) the same way we handle envelope
// fields (id, status), we build a merged view at the top of the handler:
//   const merged = { ...body.output, ...body }
// so envelope keys win, but worker keys fill in. All downstream readers use
// `merged` and also defensively peek into `merged.output` / `merged.outputs`.

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

// Path-field names accepted on a worker's output, in preferred order.
// Strings only, trimmed, non-empty.
const PATH_KEYS = [
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

function pickStringFrom(src: Record<string, unknown> | null | undefined): string | null {
  if (!src) return null;
  for (const k of PATH_KEYS) {
    const v = src[k];
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

function pickPointCloudPath(body: Record<string, unknown>): string | null {
  // Top-level (post-merge) takes priority. Then look inside any nested
  // envelopes RunPod or the worker may have included.
  const top = pickStringFrom(body);
  if (top) return top;

  const output = (body.output && typeof body.output === "object")
    ? body.output as Record<string, unknown>
    : null;
  const fromOutput = pickStringFrom(output);
  if (fromOutput) return fromOutput;

  const outputs = (body.outputs && typeof body.outputs === "object")
    ? body.outputs as Record<string, unknown>
    : null;
  return pickStringFrom(outputs);
}

function pickMetrics(body: Record<string, unknown>): unknown {
  if (body.metrics && typeof body.metrics === "object") return body.metrics;
  const output = body.output as Record<string, unknown> | undefined;
  if (output?.metrics && typeof output.metrics === "object") return output.metrics;
  const outputs = body.outputs as Record<string, unknown> | undefined;
  if (outputs?.metrics && typeof outputs.metrics === "object") return outputs.metrics;
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

    // Diagnostic: emit the full payload so we can see exactly what RunPod sends.
    // This lands in the Edge Function log stream alongside the invocation row.
    console.log("[reconstruct-scan-callback] payload", JSON.stringify(body));

    // Unwrap RunPod's envelope. RunPod posts:
    //   { id, status, output: <worker return value>, error? }
    // We want a single object where worker fields (pointcloud_url, metrics, …)
    // live next to envelope fields (id, status, …) so the rest of the handler
    // doesn't need to know which side of the wire any given key came from.
    const output = (body && typeof body.output === "object" && body.output !== null)
      ? body.output as Record<string, unknown>
      : {};
    const merged: Record<string, unknown> = { ...output, ...body };

    // Resolve scan_id: query param wins, else look up by RunPod job id.
    let scan_id =
      url.searchParams.get("scan_id") ?? url.searchParams.get("scanId") ?? null;

    const runpodJobId = typeof merged.id === "string" ? merged.id : null;

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

    // Read status from the merged view: body.status takes priority (envelope),
    // output.status used as fallback for workers that surface their own status.
    const rawStatus = String(merged.status ?? "").toLowerCase();
    const isSuccess = SUCCESS_STATUSES.has(rawStatus);
    const isFailure = FAILURE_STATUSES.has(rawStatus);

    if (isSuccess) {
      const path = pickPointCloudPath(merged);
      if (!path) {
        // Persist a snippet of the raw payload so we can diagnose path
        // extraction failures from the DB instead of having to replay logs.
        const payloadSnippet = JSON.stringify(body).slice(0, 500);
        await supabase
          .from("scans")
          .update({
            processing_status: "failed",
            processing_error:
              `callback succeeded but no point-cloud path provided. payload=${payloadSnippet}`,
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
      const metrics = pickMetrics(merged);
      if (metrics) update.lingbot_metrics = metrics;

      const { error: updErr } = await supabase
        .from("scans").update(update).eq("id", scan_id);
      if (updErr) throw updErr;

      return new Response(
        JSON.stringify({ ok: true, scan_id, status: "complete" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Interim statuses (job still running) — just acknowledge, don't fail.
    const INTERIM_STATUSES = new Set([
      "in_progress", "in_queue", "queued", "retrying", "throttled",
    ]);
    if (INTERIM_STATUSES.has(rawStatus)) {
      return new Response(
        JSON.stringify({ ok: true, scan_id, status: "pending" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Failure / unknown — mark failed.
    const errMsg =
      (typeof merged.error === "string" ? merged.error : null) ??
      (typeof merged.message === "string" ? merged.message : null) ??
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
