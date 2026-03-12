import { cn } from "@/lib/utils";

type BadgeVariant = "reviewed" | "pending" | "flagged" | "action_required";

const variantStyles: Record<BadgeVariant, string> = {
  reviewed: "bg-status-success/15 text-status-success border-status-success/30",
  pending: "bg-status-warning/15 text-status-warning border-status-warning/30",
  flagged: "bg-status-danger/15 text-status-danger border-status-danger/30",
  action_required: "bg-status-danger/15 text-status-danger border-status-danger/30 animate-status-pulse",
};

const variantLabels: Record<BadgeVariant, string> = {
  reviewed: "REVIEWED",
  pending: "PENDING",
  flagged: "FLAGGED",
  action_required: "ACTION REQUIRED",
};

interface StatusBadgeProps {
  variant: BadgeVariant;
  className?: string;
}

export function StatusBadge({ variant, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-tag border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em]",
        variantStyles[variant],
        className
      )}
    >
      {variantLabels[variant]}
    </span>
  );
}
