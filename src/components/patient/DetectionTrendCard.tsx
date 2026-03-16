import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface DetectionTrend {
  detection: string;
  firstValue: number;
  latestValue: number;
  trend: "improving" | "stable" | "worsening";
}

interface DetectionTrendCardProps {
  trends: DetectionTrend[];
}

export function DetectionTrendCard({ trends }: DetectionTrendCardProps) {
  if (trends.length === 0) return null;

  return (
    <div className="rounded-card bg-card border border-border p-4">
      <span className="mono-label text-primary mb-3 block">DETECTION TRENDS</span>

      <div className="space-y-3">
        {trends.map((t) => {
          const Icon = t.trend === "improving" ? TrendingDown : t.trend === "worsening" ? TrendingUp : Minus;
          const color = t.trend === "improving" ? "text-status-success" : t.trend === "worsening" ? "text-destructive" : "text-status-warning";
          const label = t.trend === "improving" ? "Improving" : t.trend === "worsening" ? "Worsening" : "Stable";

          return (
            <div key={t.detection} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">{t.detection.replace(/_/g, " ")}</span>
                <span className={`flex items-center gap-1 mono-label ${color}`}>
                  <Icon className="w-3 h-3" />
                  {label}
                </span>
              </div>
              {/* Visual bar comparison */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-muted-foreground/30" style={{ width: `${t.firstValue}%` }} />
                </div>
                <span className="mono-label text-muted-foreground text-[9px]">→</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${
                    t.trend === "improving" ? "bg-status-success" : t.trend === "worsening" ? "bg-destructive" : "bg-status-warning"
                  }`} style={{ width: `${t.latestValue}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
