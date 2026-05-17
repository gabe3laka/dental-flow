// Deletes objects in the `scan-videos` storage bucket older than 2 hours,
// and nulls out the corresponding `scans.raw_video_url` references.
// Triggered by pg_cron every 15 minutes. Idempotent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_AGE_HOURS = 2;
const BATCH = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const purgeAll = url.searchParams.get("all") === "1";
    const bucketParam = url.searchParams.get("bucket"); // optional override

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cutoff = purgeAll
      ? new Date().toISOString()
      : new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000).toISOString();

    const buckets = bucketParam ? [bucketParam] : ["scan-videos"];
    const result: Record<string, number> = {};

    for (const bucket of buckets) {
      const { data: stale, error: queryErr } = await supabase.rpc(
        "list_stale_storage_objects",
        { _bucket_id: bucket, _older_than: cutoff, _limit: 1000 },
      );
      if (queryErr) throw queryErr;

      const paths = (stale ?? []).map((o: { name: string }) => o.name).filter(Boolean);
      let deleted = 0;

      for (let i = 0; i < paths.length; i += BATCH) {
        const chunk = paths.slice(i, i + BATCH);
        const { error: rmErr } = await supabase.storage.from(bucket).remove(chunk);
        if (rmErr) {
          console.error(`storage remove error (${bucket}):`, rmErr);
          continue;
        }
        deleted += chunk.length;

        if (bucket === "scan-videos") {
          await supabase.from("scans").update({ raw_video_url: null }).in("raw_video_url", chunk);
        } else if (bucket === "scan-pointclouds") {
          await supabase.from("scans").update({ pointcloud_url: null }).in("pointcloud_url", chunk);
        }
      }
      result[bucket] = deleted;
    }

    return new Response(JSON.stringify({ deleted: result, cutoff, purgeAll }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("purge-old-scan-videos error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});