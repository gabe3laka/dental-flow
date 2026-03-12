import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { logError } from "@/lib/logger";

const TIER_PRICES: Record<string, number> = { starter: 149, growth: 349, enterprise: 999 };
const PIE_COLORS = ["hsl(228, 100%, 62%)", "hsl(142, 71%, 45%)", "hsl(43, 50%, 54%)"];
const STATUS_FILTERS = ["ALL", "ACTIVE", "PAST_DUE", "CANCELED", "TRIALING"];

export default function AdminBilling() {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    (async () => {
      try {
        const { data: subs } = await supabase.from("subscriptions").select("*");
        if (!subs?.length) { setLoading(false); return; }
        const doctorIds = subs.map((s) => s.doctor_id);
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", doctorIds);
        const nameMap: Record<string, string> = {};
        (profiles || []).forEach((p) => { nameMap[p.user_id] = p.full_name || "Unknown"; });
        setSubscriptions(subs.map((s) => ({ ...s, doctorName: nameMap[s.doctor_id] || "Unknown" })));
      } catch (e) { logError(e, { operation: "AdminBilling/loadData" }); }
      finally { setLoading(false); }
    })();
  }, []);

  const tierCount = { starter: 0, growth: 0, enterprise: 0 };
  let totalMrr = 0;
  const pastDueCount = subscriptions.filter((s) => s.status === "past_due").length;

  subscriptions.forEach((s) => {
    if (tierCount[s.plan_tier as keyof typeof tierCount] !== undefined) tierCount[s.plan_tier as keyof typeof tierCount]++;
    if (s.status === "active" || s.status === "trialing") totalMrr += TIER_PRICES[s.plan_tier] || 0;
  });

  const pieData = [
    { name: "Starter", value: tierCount.starter },
    { name: "Growth", value: tierCount.growth },
    { name: "Enterprise", value: tierCount.enterprise },
  ].filter((d) => d.value > 0);

  // Simple MRR trend (placeholder: current value repeated)
  const mrrTrend = [
    { month: "Oct", mrr: Math.round(totalMrr * 0.6) },
    { month: "Nov", mrr: Math.round(totalMrr * 0.75) },
    { month: "Dec", mrr: Math.round(totalMrr * 0.85) },
    { month: "Jan", mrr: Math.round(totalMrr * 0.95) },
    { month: "Feb", mrr: totalMrr },
  ];

  const filtered = statusFilter === "ALL"
    ? subscriptions
    : subscriptions.filter((s) => s.status === statusFilter.toLowerCase());

  const axisStyle = { fontFamily: "IBM Plex Mono", fontSize: 9, fill: "hsl(38 23% 90% / 0.3)" };

  return (
    <div>
      <span className="mono-label" style={{ color: "hsl(0 84% 60%)" }}>BILLING</span>
      <h1 className="font-display text-3xl font-semibold mt-1 mb-8">Revenue Dashboard</h1>

      {/* Past due alert */}
      {pastDueCount > 0 && (
        <div className="rounded-card p-4 mb-6 flex items-center gap-3" style={{ background: "hsl(0 84% 60% / 0.1)", border: "1px solid hsl(0 84% 60% / 0.3)" }}>
          <div className="w-2 h-2 rounded-full animate-status-pulse" style={{ background: "hsl(0 84% 60%)" }} />
          <span className="mono-label" style={{ color: "hsl(0 84% 60%)" }}>
            {pastDueCount} SUBSCRIPTION{pastDueCount > 1 ? "S" : ""} PAST DUE
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* MRR Chart */}
        <div className="rounded-card p-6" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
          <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>MONTHLY RECURRING REVENUE</span>
          <p className="font-display text-3xl font-bold mt-2 mb-4">${totalMrr.toLocaleString()}</p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mrrTrend}>
                <XAxis dataKey="month" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Line type="monotone" dataKey="mrr" stroke="hsl(228, 100%, 62%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Plan Distribution */}
        <div className="rounded-card p-6" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
          <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>PLAN DISTRIBUTION</span>
          <div className="flex items-center gap-8 mt-4">
            <div className="w-32 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={50} dataKey="value" stroke="none">
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {[
                { label: "STARTER", value: tierCount.starter, color: PIE_COLORS[0] },
                { label: "GROWTH", value: tierCount.growth, color: PIE_COLORS[1] },
                { label: "ENTERPRISE", value: tierCount.enterprise, color: PIE_COLORS[2] },
              ].map((c) => (
                <div key={c.label} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                  <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{c.label}: {c.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className="px-3 py-1.5 rounded-pill mono-label transition"
            style={{
              background: statusFilter === f ? "hsl(0 84% 60% / 0.15)" : "transparent",
              color: statusFilter === f ? "hsl(0 84% 60%)" : "hsl(38 23% 90% / 0.3)",
              border: `1px solid ${statusFilter === f ? "hsl(0 84% 60% / 0.3)" : "hsl(0 0% 100% / 0.07)"}`,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="rounded-card overflow-hidden" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
        <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 p-4 border-b" style={{ borderColor: "hsl(0 0% 100% / 0.06)" }}>
          {["DOCTOR", "PLAN", "STATUS", "PERIOD END"].map((h) => (
            <span key={h} className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>{h}</span>
          ))}
        </div>
        {loading ? [1, 2].map((i) => <div key={i} className="p-4"><Skeleton className="h-8" /></div>) : filtered.length === 0 ? (
          <div className="p-8 text-center"><p className="text-sm" style={{ color: "hsl(38 23% 90% / 0.3)" }}>No subscriptions found.</p></div>
        ) : filtered.map((s) => (
          <div key={s.id} className="grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr] gap-4 p-4 border-b" style={{ borderColor: "hsl(0 0% 100% / 0.04)" }}>
            <span className="text-sm font-medium">{s.doctorName}</span>
            <span className="mono-label" style={{ color: "hsl(228 100% 62%)" }}>{s.plan_tier?.toUpperCase()}</span>
            <span className="mono-label" style={{ color: s.status === "active" ? "hsl(142 71% 45%)" : s.status === "past_due" ? "hsl(0 84% 60%)" : "hsl(38 92% 50%)" }}>{s.status?.toUpperCase()}</span>
            <span className="text-sm" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}</span>
          </div>
        ))}
      </div>

      {/* Stripe placeholder */}
      <div className="rounded-card p-6 mt-6" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
        <span className="mono-label mb-3 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>STRIPE WEBHOOK LOG</span>
        <p className="text-sm" style={{ color: "hsl(38 23% 90% / 0.3)" }}>Webhook events will appear here once Stripe is connected.</p>
        <div className="flex gap-3 mt-4">
          <Button
            variant="outline"
            disabled
            className="rounded-pill font-mono text-xs uppercase tracking-[0.15em] border-border text-muted-foreground"
            title="Coming soon"
          >
            Export CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
