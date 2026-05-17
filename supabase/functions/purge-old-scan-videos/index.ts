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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000).toISOString();

    // Pull stale objects directly from storage.objects via PostgREST
    // (service role bypasses RLS).
    const { data: stale, error: queryErr } = await supabase
      .schema("storage")
      .from("objects")
      .select("name")
      .eq("bucket_id", "scan-videos")
      .lt("created_at", cutoff)
      .limit(1000);

    if (queryErr) throw queryErr;

    const paths = (stale ?? []).map((o: { name: string }) => o.name).filter(Boolean);
    if (paths.length === 0) {
      return new Response(JSON.stringify({ deleted: 0, cutoff }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let deleted = 0;
    for (let i = 0; i < paths.length; i += BATCH) {
      const chunk = paths.slice(i, i + BATCH);
      const { error: rmErr } = await supabase.storage.from("scan-videos").remove(chunk);
      if (rmErr) {
        console.error("storage remove error:", rmErr);
        continue;
      }
      deleted += chunk.length;

      // Null out DB refs so signed-URL calls don't 404 silently
      await supabase
        .from("scans")
        .update({ raw_video_url: null })
        .in("raw_video_url", chunk);
    }

    return new Response(JSON.stringify({ deleted, cutoff }), {
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