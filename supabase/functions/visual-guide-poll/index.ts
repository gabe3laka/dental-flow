// Cron-driven poller for AI Visual Guide generation jobs.
// Selects scans with generation_status='generating_scene' AND a job id,
// asks World Labs for status, downloads outputs on completion, and ONLY
// writes the new generative_* columns. Never touches splat_*, processing_*,
// pointcloud_url, or any reconstruct path.
//
// Required env (server-side only):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   WORLDLABS_API_KEY, WORLDLABS_API_URL

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

const MAX_BATCH = 10;
const TIMEOUT_MIN = 30;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const WORLDLABS_API_KEY = Deno.env.get("WORLDLABS_API_KEY");
    const WORLDLABS_API_URL = Deno.env.get("WORLDLABS_API_URL");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (!WORLDLABS_API_KEY || !WORLDLABS_API_URL) {
      return new Response(JSON.stringify({ processed: 0, reason: "WORLDLABS not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: jobs, error } = await admin
      .from("scans")
      .select("id, patient_id, generation_job_id, generation_started_at")
      .eq("generation_status", "generating_scene")
      .not("generation_job_id", "is", null)
      .limit(MAX_BATCH);
    if (error) throw error;

    const results: Array<{ scan_id: string; status: string }> = [];
    for (const job of jobs ?? []) {
      try {
        // Timeout guard
        if (job.generation_started_at) {
          const ageMin = (Date.now() - new Date(job.generation_started_at).getTime()) / 60000;
          if (ageMin > TIMEOUT_MIN) {
            await admin.from("scans").update({
              generation_status: "failed",
              generation_error: `Timed out after ${TIMEOUT_MIN} min`,
            }).eq("id", job.id);
            results.push({ scan_id: job.id, status: "timeout" });
            continue;
          }
        }

        // ============================================================
        // TODO: confirm against World Labs API docs (user-provided)
        // Replace this with the actual status endpoint + response shape.
        // ============================================================
        const statusUrl = `${WORLDLABS_API_URL.replace(/\/$/, "")}/status/${encodeURIComponent(job.generation_job_id!)}`;
        const res = await fetch(statusUrl, {
          headers: { authorization: `Bearer ${WORLDLABS_API_KEY}` },
        });
        if (!res.ok) {
          results.push({ scan_id: job.id, status: `http_${res.status}` });
          continue;
        }
        const payload = await res.json().catch(() => ({} as Record<string, unknown>));
        // TODO: confirm field names against World Labs response
        const state = String(payload?.status ?? payload?.state ?? "").toLowerCase();

        if (state === "completed" || state === "succeeded" || state === "ready") {
          // TODO: confirm URL fields against World Labs response
          const sceneUrl = (payload?.scene_url ?? payload?.spz_url ?? payload?.output_url) as string | undefined;
          const glbUrl = (payload?.glb_url ?? payload?.mesh_url) as string | undefined;

          const update: Record<string, unknown> = {
            generation_status: "render_ready",
            generative_assets: payload as Record<string, unknown>,
          };

          if (sceneUrl) {
            const blob = await (await fetch(sceneUrl)).blob();
            const path = `${job.patient_id}/${job.id}/scene.spz`;
            const { error: upErr } = await admin.storage
              .from("generated-scenes")
              .upload(path, blob, { upsert: true, contentType: "application/octet-stream" });
            if (!upErr) update.generative_scene_url = path;
          }
          if (glbUrl) {
            const blob = await (await fetch(glbUrl)).blob();
            const path = `${job.patient_id}/${job.id}/model.glb`;
            const { error: upErr } = await admin.storage
              .from("generated-assets")
              .upload(path, blob, { upsert: true, contentType: "model/gltf-binary" });
            if (!upErr) update.generative_glb_url = path;
          }

          await admin.from("scans").update(update).eq("id", job.id);
          results.push({ scan_id: job.id, status: "ready" });
        } else if (state === "failed" || state === "error") {
          await admin.from("scans").update({
            generation_status: "failed",
            generation_error: String(payload?.error ?? payload?.message ?? "World Labs reported failure"),
          }).eq("id", job.id);
          results.push({ scan_id: job.id, status: "failed" });
        } else {
          results.push({ scan_id: job.id, status: state || "pending" });
        }
      } catch (e) {
        console.error("poll error", job.id, e);
        results.push({ scan_id: job.id, status: "error" });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("visual-guide-poll error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
