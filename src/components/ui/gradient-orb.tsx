import { cn } from "@/lib/utils";

interface GradientOrbProps {
  size?: number;
  percentage?: number;
  status?: string;
  notStarted?: boolean;
  className?: string;
}

export function GradientOrb({ size = 240, percentage, status, notStarted, className }: GradientOrbProps) {
  const gradientBase = notStarted
    ? "radial-gradient(circle, rgba(180,180,200,0.4), rgba(160,160,180,0.3), rgba(140,140,160,0.2))"
    : "radial-gradient(circle, #b8a8f0, #e8b4c8, #6b9aff)";

  const glowBase = notStarted
    ? "radial-gradient(circle, rgba(180,180,200,0.15), rgba(160,160,180,0.1), transparent)"
    : "radial-gradient(circle, hsla(256,67%,80%,0.3), hsla(330,50%,81%,0.2), transparent)";

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      {/* Outer glow layer */}
      <div
        className="absolute animate-orb-float"
        style={{
          width: size * 1.1,
          height: size * 1.1,
          borderRadius: "50%",
          background: glowBase,
          filter: "blur(20px)",
          top: -size * 0.05,
          left: -size * 0.05,
        }}
      />
      {/* Main orb */}
      <div
        className="relative animate-orb-float flex items-center justify-center"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: gradientBase,
          filter: "blur(1px)",
          animationDelay: "0.5s",
        }}
      >
        {percentage !== undefined && (
          <span
            className="font-display font-black text-white relative"
            style={{
              fontSize: size * 0.28,
              filter: "blur(0px)",
              textShadow: "0 2px 10px rgba(0,0,0,0.15)",
            }}
          >
            {percentage}%
          </span>
        )}
      </div>
      {status && (
        <span className="mono-label mt-4 text-muted-foreground">{status}</span>
      )}
    </div>
  );
}
