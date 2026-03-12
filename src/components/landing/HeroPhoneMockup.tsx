import { Check, Sparkles, TrendingUp } from "lucide-react";

export default function HeroPhoneMockup() {
  return (
    <div className="relative w-[280px] h-[560px] animate-orb-float">
      {/* Phone frame */}
      <div
        className="absolute inset-0 rounded-[40px] overflow-hidden"
        style={{
          background: "#0f172a",
          boxShadow: "0 25px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
          border: "2px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Status bar */}
        <div className="flex items-center justify-between px-7 pt-4 pb-2">
          <span className="text-white/60 text-[10px] font-mono">9:41</span>
          <div className="w-20 h-5 rounded-full bg-black" />
          <div className="flex gap-1">
            <div className="w-3 h-[3px] rounded-sm bg-white/40" />
            <div className="w-3 h-[3px] rounded-sm bg-white/30" />
            <div className="w-3 h-[3px] rounded-sm bg-white/20" />
          </div>
        </div>

        {/* Screen content */}
        <div className="px-5 pt-2">
          <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-white/30">
            ARCLINE · SCAN REVIEW
          </span>

          {/* SVG Tooth Arch */}
          <div className="mt-4 flex justify-center">
            <svg width="200" height="140" viewBox="0 0 200 140">
              {/* Arch path (guide) */}
              <path
                d="M 30 120 Q 30 20, 100 15 Q 170 20, 170 120"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="30"
                strokeLinecap="round"
              />
              {/* Teeth as ellipses along the arch */}
              {[
                { cx: 38, cy: 105, rx: 8, ry: 11 },
                { cx: 42, cy: 82, rx: 8, ry: 10 },
                { cx: 52, cy: 58, rx: 9, ry: 10 },
                { cx: 68, cy: 38, rx: 9, ry: 9 },
                { cx: 86, cy: 25, rx: 9, ry: 8 },
                { cx: 114, cy: 25, rx: 9, ry: 8 },
                { cx: 132, cy: 38, rx: 9, ry: 9 },
                { cx: 148, cy: 58, rx: 9, ry: 10 },
                { cx: 158, cy: 82, rx: 8, ry: 10 },
                { cx: 162, cy: 105, rx: 8, ry: 11 },
              ].map((t, i) => (
                <ellipse
                  key={i}
                  cx={t.cx}
                  cy={t.cy}
                  rx={t.rx}
                  ry={t.ry}
                  fill={i === 4 ? "rgba(79,124,255,0.3)" : "rgba(255,255,255,0.12)"}
                  stroke={i === 4 ? "#4f7cff" : "rgba(255,255,255,0.2)"}
                  strokeWidth={i === 4 ? 1.5 : 0.5}
                  strokeDasharray={i === 4 ? "3 2" : "none"}
                />
              ))}
              {/* Highlight label */}
              <text x="86" y="22" fill="#4f7cff" fontSize="6" fontFamily="monospace" textAnchor="middle" opacity="0.8">
                T14
              </text>
            </svg>
          </div>

          {/* Scan line */}
          <div className="relative h-1 mt-2 mb-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
            <div
              className="absolute top-0 left-0 h-full w-1/3 rounded-full animate-scan-line"
              style={{ background: "linear-gradient(90deg, transparent, #4f7cff, transparent)" }}
            />
          </div>

          {/* Score bar */}
          <div className="flex items-center gap-2 mt-2">
            <span className="font-mono text-[8px] text-white/30 uppercase tracking-wide">Quality</span>
            <div className="flex-1 h-[3px] rounded-full bg-white/10">
              <div className="h-full rounded-full w-[94%]" style={{ background: "linear-gradient(90deg, #4f7cff, #8b5cf6)" }} />
            </div>
            <span className="font-mono text-[9px] text-white/50">94%</span>
          </div>

          {/* Patient info row */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "hsl(142 71% 45%)" }} />
              <span className="font-mono text-[8px] text-white/50">Patient: A. Smith</span>
            </div>
            <span className="font-mono text-[7px] uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: "rgba(79,124,255,0.2)", color: "#4f7cff" }}>Active</span>
          </div>

          {/* Divider */}
          <div className="h-px mt-3 mb-3" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* Mini stat cards */}
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="font-mono text-[7px] text-white/30 uppercase tracking-wide block">Teeth Analyzed</span>
              <span className="font-mono text-[12px] text-white/80 font-medium mt-0.5 block">28/32</span>
            </div>
            <div className="flex-1 rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="font-mono text-[7px] text-white/30 uppercase tracking-wide block">Issues Found</span>
              <span className="font-mono text-[12px] font-medium mt-0.5 block" style={{ color: "#f59e0b" }}>2</span>
            </div>
          </div>

          {/* Action button */}
          <button className="w-full mt-3 rounded-lg font-mono text-[8px] uppercase tracking-[0.12em] py-2.5 text-white/90" style={{ background: "linear-gradient(135deg, #4f7cff, #3d6dff)", border: "1px solid rgba(255,255,255,0.1)" }}>
            View Full Report
          </button>

          {/* Timestamp */}
          <p className="font-mono text-[7px] text-white/20 text-center mt-2.5 mb-2">Last scan: Today, 2:41 PM</p>
        </div>
      </div>

      {/* Floating card: Scan Complete (top-right) */}
      <div
        className="absolute -top-4 -right-16 animate-float-slow"
        style={{
          background: "rgba(255,255,255,0.95)",
          borderRadius: 12,
          padding: "8px 12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          animationDelay: "0s",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "hsl(142 71% 45%)" }}>
            <Check className="w-3 h-3 text-white" />
          </div>
          <div>
            <p className="font-mono text-[8px] uppercase tracking-wide text-foreground/80">Scan Complete</p>
            <p className="font-mono text-[7px] text-muted-foreground">Just now</p>
          </div>
        </div>
      </div>

      {/* Floating card: AI Analysis (bottom-left) */}
      <div
        className="absolute bottom-16 -left-20 animate-float-slow"
        style={{
          background: "rgba(255,255,255,0.95)",
          borderRadius: 12,
          padding: "8px 12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          animationDelay: "2s",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "hsl(256 67% 80%)" }}>
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <div>
            <p className="font-mono text-[8px] uppercase tracking-wide text-foreground/80">AI Analysis</p>
            <p className="font-mono text-[7px] text-muted-foreground">2 min ago</p>
          </div>
        </div>
      </div>

      {/* Floating card: Alignment (left-mid) */}
      <div
        className="absolute top-1/3 -left-24 animate-float-slow"
        style={{
          background: "rgba(79,124,255,0.95)",
          borderRadius: 12,
          padding: "8px 14px",
          boxShadow: "0 8px 32px rgba(79,124,255,0.25)",
          animationDelay: "4s",
        }}
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-white" />
          <span className="font-mono text-[9px] text-white font-medium">Alignment 94%</span>
        </div>
      </div>
    </div>
  );
}
