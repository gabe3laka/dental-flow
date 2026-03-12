import { useState, useEffect } from "react";
import { PillNav } from "@/components/ui/pill-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  RadialBarChart, RadialBar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { subDays, format } from "date-fns";
import { Info } from "lucide-react";
import { logError } from "@/lib/logger";

const rangeTabs = [
  { id: "7", label: "7D" },
  { id: "30", label: "30D" },
  { id: "90", label: "90D" },
  { id: "365", label: "1Y" },
];

export default function Analytics() {
  const { user } = useAuth();
  const [range, setRange] = useState("30");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    (async () => {
      try {
        const start = format(subDays(new Date(), parseInt(range)), "yyyy-MM-dd");
        const { data: rows } = await supabase
          .from("practice_analytics")
          .select("*")
          .eq("doctor_id", user.id)
          .gte("date", start)
          .order("date", { ascending: true });
        setData(rows || []);
      } catch (e) {
        logError(e, { operation: "Analytics/loadData", userId: user?.id });
      } finally {
        setLoading(false);
      }
    })();
  }, [user, range]);

  const totalVisitsSaved = data.reduce((sum, r) => sum + (r.visits_avoided || 0), 0);
  const latestCompliance = data.length > 0
    ? Math.round(((data[data.length - 1].scans_reviewed || 0) / Math.max(data[data.length - 1].active_patients || 1, 1)) * 100)
    : 0;

  const axisStyle = { fontFamily: "IBM Plex Mono", fontSize: 9, fill: "hsl(38 23% 90% / 0.3)" };

  const chartCardStyle = {
    background: "hsl(218 26% 11%)",
    border: "1px solid hsl(0 0% 100% / 0.07)",
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <Skeleton className="h-8 w-48 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-64 rounded-card" />)}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="p-4 md:p-8">
        <div className="mb-8">
          <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>PRACTICE ANALYTICS</span>
          <h1 className="font-display text-2xl md:text-3xl font-semibold mt-1">Performance</h1>
        </div>

        {/* Info banner */}
        <div
          className="rounded-md p-4 mb-8 flex items-start gap-3"
          style={{ background: "hsl(228 100% 62% / 0.06)", border: "1px solid hsl(228 100% 62% / 0.15)" }}
        >
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "hsl(228 100% 62% / 0.6)" }} />
          <p className="text-[13px]" style={{ color: "hsl(38 23% 90% / 0.6)" }}>
            Charts will populate once you have patient data. In the meantime, here's a preview of what you'll see.
          </p>
        </div>

        {/* Skeleton chart cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[
            { title: "SCANS REVIEWED", heights: [60, 80, 45, 95, 70, 88] },
            { title: "CHAIR TIME SAVED — EST.", heights: [40, 65, 30, 75, 55, 50] },
            { title: "ACTIVE PATIENTS", heights: [50, 55, 60, 58, 70, 75] },
            { title: "PATIENT COMPLIANCE RATE", heights: [] },
          ].map((card, ci) => (
            <div
              key={ci}
              className="rounded-card p-4 md:p-6"
              style={chartCardStyle}
            >
              <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{card.title}</span>
              {card.heights.length > 0 ? (
                <div className="flex items-end gap-2 mt-6 h-24">
                  {card.heights.map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm animate-pulse"
                      style={{
                        height: h,
                        background: "hsl(228 100% 62% / 0.08)",
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center mt-6 h-24">
                  <div
                    className="w-20 h-20 rounded-full animate-pulse"
                    style={{ border: "6px solid hsl(228 100% 62% / 0.1)", borderTopColor: "hsl(228 100% 62% / 0.3)" }}
                  />
                </div>
              )}
              <div className="flex gap-4 mt-4">
                {["M", "T", "W", "T", "F", "S"].slice(0, card.heights.length || 4).map((d, i) => (
                  <span key={i} className="flex-1 text-center mono-label" style={{ color: "hsl(38 23% 90% / 0.2)", fontSize: 8 }}>{d}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const radialData = [{ name: "compliance", value: latestCompliance, fill: "hsl(228 100% 62%)" }];

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>PRACTICE ANALYTICS</span>
          <h1 className="font-display text-2xl md:text-3xl font-semibold mt-1">Performance</h1>
        </div>
        <PillNav tabs={rangeTabs} activeTab={range} onTabChange={setRange} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scans Reviewed */}
        <div className="rounded-card p-4 md:p-6" style={chartCardStyle}>
          <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>SCANS REVIEWED</span>
          <div className="h-48 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(228 100% 62%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(228 100% 62%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => format(new Date(v), "dd")} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="scans_reviewed" stroke="hsl(228 100% 62%)" fill="url(#blueGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chair Time Saved */}
        <div className="rounded-card p-4 md:p-6" style={chartCardStyle}>
          <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>CHAIR TIME SAVED — EST.</span>
          <p className="font-display text-3xl md:text-4xl font-bold mt-2 mb-1">{totalVisitsSaved}</p>
          <span className="mono-label" style={{ color: "hsl(228 100% 62% / 0.6)" }}>~50% REDUCTION</span>
          <div className="h-32 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => format(new Date(v), "dd")} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Bar dataKey="visits_avoided" fill="hsl(228 100% 62%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Active Patients */}
        <div className="rounded-card p-4 md:p-6" style={chartCardStyle}>
          <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>ACTIVE PATIENTS</span>
          <div className="h-48 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => format(new Date(v), "dd")} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Line type="monotone" dataKey="active_patients" stroke="hsl(228 100% 62%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Compliance Rate */}
        <div className="rounded-card p-4 md:p-6 flex flex-col items-center justify-center" style={chartCardStyle}>
          <span className="mono-label mb-4" style={{ color: "hsl(38 23% 90% / 0.45)" }}>PATIENT COMPLIANCE RATE</span>
          <div className="relative w-40 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%" cy="50%" innerRadius="75%" outerRadius="100%"
                startAngle={90} endAngle={-270} data={radialData} barSize={10}
              >
                <RadialBar dataKey="value" cornerRadius={5} background={{ fill: "rgba(255,255,255,0.06)" }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-display text-3xl font-bold text-white">{latestCompliance}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
