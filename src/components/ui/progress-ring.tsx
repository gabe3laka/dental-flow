import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ProgressStatus = "on_track" | "needs_attention" | "review_pending" | "not_started";

interface ProgressRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  status?: ProgressStatus;
  subtitle?: string;
  className?: string;
}

const statusConfig: Record<ProgressStatus, { label: string; dotClass: string }> = {
  on_track: { label: "On Track", dotClass: "bg-status-success" },
  needs_attention: { label: "Needs Attention", dotClass: "bg-status-warning" },
  review_pending: { label: "Review Pending", dotClass: "bg-status-danger" },
  not_started: { label: "Not Started", dotClass: "bg-muted-foreground" },
};

export function ProgressRing({
  value,
  size = 100,
  strokeWidth = 6,
  status = "on_track",
  subtitle,
  className,
}: ProgressRingProps) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedValue / 100) * circumference;

  useEffect(() => {
    const timeout = setTimeout(() => setAnimatedValue(value), 50);
    return () => clearTimeout(timeout);
  }, [value]);

  const { label, dotClass } = statusConfig[status];

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-[800ms] ease-out"
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-2xl font-semibold text-foreground">
            {Math.round(animatedValue)}%
          </span>
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2 mt-3">
        <div className={cn("w-2 h-2 rounded-full", dotClass)} />
        <span className="font-body text-sm text-muted-foreground">{label}</span>
      </div>

      {/* Subtitle */}
      {subtitle && (
        <span className="mono-label text-muted-foreground mt-1">{subtitle}</span>
      )}
    </div>
  );
}
