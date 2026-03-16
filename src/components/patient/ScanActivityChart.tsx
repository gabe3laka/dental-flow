import { Flame } from "lucide-react";

interface ScanActivityChartProps {
  weeklyData: { week: number; count: number; label: string }[];
  currentStreak: number;
  averagePerWeek: number;
  totalScans: number;
}

export function ScanActivityChart({ weeklyData, currentStreak, averagePerWeek, totalScans }: ScanActivityChartProps) {
  const maxCount = Math.max(...weeklyData.map((w) => w.count), 1);

  return (
    <div className="rounded-card bg-card border border-border p-4">
      <span className="mono-label text-primary mb-3 block">SCAN ACTIVITY</span>

      {/* Bar chart */}
      <div className="flex items-end gap-1.5 h-16 mb-3">
        {weeklyData.map((w, i) => {
          const height = w.count > 0 ? Math.max(12, (w.count / maxCount) * 100) : 4;
          const isLatest = i === weeklyData.length - 1;
          return (
            <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`w-full rounded-sm transition-all ${
                  w.count > 0
                    ? isLatest ? "bg-primary" : "bg-primary/40"
                    : "bg-muted"
                }`}
                style={{ height: `${height}%` }}
              />
              <span className="mono-label text-muted-foreground text-[8px]">{w.label}</span>
            </div>
          );
        })}
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          <span className="font-semibold text-foreground">{totalScans}</span> scans · {averagePerWeek.toFixed(1)}/wk avg
        </span>
        {currentStreak > 0 && (
          <span className="flex items-center gap-1 text-status-warning font-medium">
            <Flame className="w-3.5 h-3.5" />
            {currentStreak}wk streak
          </span>
        )}
      </div>
    </div>
  );
}
