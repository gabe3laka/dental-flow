import { useEffect, useRef, useState } from "react";

function AnimatedCounter({ target, duration = 2000 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setCount(Math.round(progress * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);

  return <>{count}</>;
}

function MiniBar({ filled = true }: { filled?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="h-[3px] rounded-full"
        style={{
          width: 40,
          background: "rgba(255,255,255,0.15)",
        }}
      >
        {filled && (
          <div
            className="h-full rounded-full"
            style={{ width: "100%", background: "rgba(255,255,255,0.9)" }}
          />
        )}
      </div>
    </div>
  );
}

export default function ScanMetricsBlock() {
  return (
    <div
      className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/90 space-y-2.5 select-none"
      style={{
        background: "rgba(0,0,0,0.25)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        padding: "14px 16px",
        minWidth: 160,
      }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <div className="w-1.5 h-1.5 rounded-full bg-white animate-nav-dot-pulse" />
        <span className="text-white/50 text-[8px]">SCAN QUALITY</span>
      </div>
      <div
        className="w-full mb-2"
        style={{ height: 1, background: "rgba(255,255,255,0.12)" }}
      />
      <div className="flex items-center justify-between">
        <span className="text-white/50">FOCUS</span>
        <span className="text-white font-semibold">
          <AnimatedCounter target={94} />%
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-white/50">LIGHTING</span>
        <div className="flex items-center gap-1.5">
          <MiniBar />
          <span className="text-[8px] text-white/70">OPTIMAL</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-white/50">COVERAGE</span>
        <div className="flex items-center gap-1.5">
          <MiniBar />
          <span className="text-[8px] text-white/70">COMPLETE</span>
        </div>
      </div>
    </div>
  );
}
