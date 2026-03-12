import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { logError } from "@/lib/logger";

const TIER_PRICES: Record<string, number> = { starter: 149, growth: 349, enterprise: 999 };

export default function AdminOverview() {
  const [metrics, setMetrics] = useState({ doctors: 0, patients: 0, scansToday: 0, flagged: 0, mrr: 0 });
  const [loading, setLoading] = useState(true);
  const [activityFeed, setActivityFeed] = useState<{ time: string; text: string; type: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const today = format(new Date(), "yyyy-MM-dd");
        const [doctorsResult, patientsResult, scansTodayResult, flaggedResult, subsResult, recentProfilesResult, recentScansResult] = await Promise.allSettled([
          supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "doctor"),
          supabase.from("patients").select("id", { count: "exact", head: true }),
          supabase.from("scans").select("id", { count: "exact", head: true }).gte("submitted_at", today),
          supabase.from("scans").select("id", { count: "exact", head: true }).eq("status", "flagged"),
          supabase.from("subscriptions").select("plan_tier, status"),
          supabase.from("profiles").select("full_name, created_at").order("created_at", { ascending: false }).limit(5),
          supabase.from("scans").select("id, status, submitted_at").order("submitted_at", { ascending: false }).limit(5),
        ]);

        if (doctorsResult.status === "rejected") logError(doctorsResult.reason, { operation: "AdminOverview/fetchDoctors" });
        if (patientsResult.status === "rejected") logError(patientsResult.reason, { operation: "AdminOverview/fetchPatients" });
        if (scansTodayResult.status === "rejected") logError(scansTodayResult.reason, { operation: "AdminOverview/fetchScansToday" });
        if (flaggedResult.status === "rejected") logError(flaggedResult.reason, { operation: "AdminOverview/fetchFlagged" });
        if (subsResult.status === "rejected") logError(subsResult.reason, { operation: "AdminOverview/fetchSubscriptions" });
        if (recentProfilesResult.status === "rejected") logError(recentProfilesResult.reason, { operation: "AdminOverview/fetchRecentProfiles" });
        if (recentScansResult.status === "rejected") logError(recentScansResult.reason, { operation: "AdminOverview/fetchRecentScans" });

        const doctorsData = doctorsResult.status === "fulfilled" ? doctorsResult.value : null;
        const patientsData = patientsResult.status === "fulfilled" ? patientsResult.value : null;
        const scansTodayData = scansTodayResult.status === "fulfilled" ? scansTodayResult.value : null;
        const flaggedData = flaggedResult.status === "fulfilled" ? flaggedResult.value : null;
        const subsData = subsResult.status === "fulfilled" ? subsResult.value.data : null;
        const recentProfilesData = recentProfilesResult.status === "fulfilled" ? recentProfilesResult.value.data : null;
        const recentScansData = recentScansResult.status === "fulfilled" ? recentScansResult.value.data : null;

        // Calculate MRR
        let mrr = 0;
        (subsData || []).forEach((s) => {
          if (s.status === "active" || s.status === "trialing") {
            mrr += TIER_PRICES[s.plan_tier] || 0;
          }
        });

        setMetrics({
          doctors: doctorsData?.count || 0,
          patients: patientsData?.count || 0,
          scansToday: scansTodayData?.count || 0,
          flagged: flaggedData?.count || 0,
          mrr,
        });

        // Build activity feed
        const feed: { time: string; text: string; type: string }[] = [];
        (recentProfilesData || []).forEach((p) => {
          feed.push({ time: p.created_at, text: `${p.full_name || "User"} signed up`, type: "signup" });
        });
        (recentScansData || []).forEach((s) => {
          feed.push({
            time: s.submitted_at,
            text: `Scan ${s.id.slice(0, 8)} submitted · ${s.status.toUpperCase()}`,
            type: s.status === "flagged" ? "flagged" : "scan",
          });
        });
        feed.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        setActivityFeed(feed.slice(0, 10));
      } catch (e) { logError(e, { operation: "AdminOverview/loadData" }); }
      finally { setLoading(false); }
    })();
  }, []);

  const cards = [
    { label: "PLATFORM MRR", value: `$${metrics.mrr.toLocaleString()}` },
    { label: "TOTAL PRACTICES", value: metrics.doctors },
    { label: "SCANS TODAY", value: metrics.scansToday },
    { label: "FLAGGED SCANS", value: metrics.flagged },
  ];

  return (
    <div>
      <span className="mono-label" style={{ color: "hsl(0 84% 60%)" }}>PLATFORM OVERVIEW</span>
      <h1 className="font-display text-3xl font-semibold mt-1 mb-8">Admin Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading ? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-card" />) : cards.map((c) => (
          <div key={c.label} className="rounded-card p-5" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>{c.label}</span>
            <p className="font-display text-3xl font-bold mt-2">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Feed */}
        <div className="rounded-card p-6" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
          <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>ACTIVITY FEED</span>
          {loading ? <Skeleton className="h-40" /> : activityFeed.length === 0 ? (
            <p className="text-sm" style={{ color: "hsl(38 23% 90% / 0.3)" }}>No recent activity.</p>
          ) : (
            <div className="space-y-3">
              {activityFeed.map((item, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{
                      background: item.type === "flagged" ? "hsl(0 84% 60%)" : item.type === "signup" ? "hsl(142 71% 45%)" : "hsl(228 100% 62%)",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[10px] tracking-[0.1em]" style={{ color: "hsl(38 23% 90% / 0.7)" }}>
                      {item.text}
                    </p>
                    <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.25)" }}>
                      {new Date(item.time).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* System Health */}
        <div className="rounded-card p-6" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
          <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>SYSTEM HEALTH</span>
          <div className="space-y-3">
            {[
              { label: "API", status: "OPERATIONAL" },
              { label: "DATABASE", status: "OPERATIONAL" },
              { label: "STORAGE", status: "OPERATIONAL" },
              { label: "AUTH", status: "OPERATIONAL" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: "hsl(142 71% 45%)" }} />
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{s.label}: {s.status}</span>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <span className="mono-label mb-3 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>QUICK STATS</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>TOTAL PATIENTS</span>
                <p className="font-display text-xl font-bold mt-1">{metrics.patients}</p>
              </div>
              <div>
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>PRACTICES</span>
                <p className="font-display text-xl font-bold mt-1">{metrics.doctors}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
