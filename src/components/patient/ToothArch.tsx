import { useState } from "react";

const STATUS_COLORS: Record<string, string> = {
  on_track: "#22c55e",
  deviation: "#f59e0b",
  attention: "#ef4444",
  no_data: "rgba(255,255,255,0.12)",
};

interface ToothArchProps {
  data?: Record<string, string>;
  className?: string;
}

function defaultTeethData(): Record<string, string> {
  const statuses = ["on_track", "on_track", "on_track", "deviation", "no_data"];
  const teeth: Record<string, string> = {};
  for (let i = 1; i <= 8; i++) {
    teeth[`T1${i}`] = statuses[i % statuses.length];
    teeth[`T2${i}`] = statuses[(i + 1) % statuses.length];
    teeth[`T3${i}`] = statuses[(i + 2) % statuses.length];
    teeth[`T4${i}`] = statuses[(i + 3) % statuses.length];
  }
  return teeth;
}

interface ToothDef {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

// Upper arch: horseshoe opening downward, hand-positioned from HeroPhoneMockup proportions
const UPPER_TEETH: ToothDef[] = [
  { id: "T18", cx: 32, cy: 128, rx: 7, ry: 10 },
  { id: "T17", cx: 34, cy: 110, rx: 7, ry: 9 },
  { id: "T16", cx: 38, cy: 92, rx: 8, ry: 9 },
  { id: "T15", cx: 46, cy: 74, rx: 8, ry: 9 },
  { id: "T14", cx: 56, cy: 58, rx: 8, ry: 8 },
  { id: "T13", cx: 72, cy: 44, rx: 8, ry: 8 },
  { id: "T12", cx: 92, cy: 32, rx: 7, ry: 7 },
  { id: "T11", cx: 112, cy: 24, rx: 7, ry: 7 },
  { id: "T21", cx: 148, cy: 24, rx: 7, ry: 7 },
  { id: "T22", cx: 168, cy: 32, rx: 7, ry: 7 },
  { id: "T23", cx: 188, cy: 44, rx: 8, ry: 8 },
  { id: "T24", cx: 204, cy: 58, rx: 8, ry: 8 },
  { id: "T25", cx: 214, cy: 74, rx: 8, ry: 9 },
  { id: "T26", cx: 222, cy: 92, rx: 8, ry: 9 },
  { id: "T27", cx: 226, cy: 110, rx: 7, ry: 9 },
  { id: "T28", cx: 228, cy: 128, rx: 7, ry: 10 },
];

// Lower arch: horseshoe opening upward, mirrored y around center gap (y = 270 - upper_y)
const LOWER_TEETH: ToothDef[] = [
  { id: "T48", cx: 32, cy: 170, rx: 7, ry: 10 },
  { id: "T47", cx: 34, cy: 188, rx: 7, ry: 9 },
  { id: "T46", cx: 38, cy: 206, rx: 8, ry: 9 },
  { id: "T45", cx: 46, cy: 224, rx: 8, ry: 9 },
  { id: "T44", cx: 56, cy: 240, rx: 8, ry: 8 },
  { id: "T43", cx: 72, cy: 254, rx: 8, ry: 8 },
  { id: "T42", cx: 92, cy: 266, rx: 7, ry: 7 },
  { id: "T41", cx: 112, cy: 274, rx: 7, ry: 7 },
  { id: "T31", cx: 148, cy: 274, rx: 7, ry: 7 },
  { id: "T32", cx: 168, cy: 266, rx: 7, ry: 7 },
  { id: "T33", cx: 188, cy: 254, rx: 8, ry: 8 },
  { id: "T34", cx: 204, cy: 240, rx: 8, ry: 8 },
  { id: "T35", cx: 214, cy: 224, rx: 8, ry: 9 },
  { id: "T36", cx: 222, cy: 206, rx: 8, ry: 9 },
  { id: "T37", cx: 226, cy: 188, rx: 7, ry: 9 },
  { id: "T38", cx: 228, cy: 170, rx: 7, ry: 10 },
];

export function ToothArch({ data, className }: ToothArchProps) {
  const teeth = data || defaultTeethData();
  const [hovered, setHovered] = useState<string | null>(null);

  const renderTooth = (def: ToothDef) => {
    const status = teeth[def.id] || "no_data";
    const isNoData = status === "no_data";
    const color = STATUS_COLORS[status] || STATUS_COLORS.no_data;
    const isHovered = hovered === def.id;

    return (
      <g key={def.id}>
        <ellipse
          cx={def.cx}
          cy={def.cy}
          rx={def.rx}
          ry={def.ry}
          fill={isNoData ? "rgba(255,255,255,0.12)" : color}
          opacity={isHovered ? 0.9 : 0.3}
          stroke={isHovered ? "#4f7cff" : "rgba(255,255,255,0.2)"}
          strokeWidth={isHovered ? 1.5 : 0.5}
          strokeDasharray={isHovered ? "3 2" : "none"}
          onMouseEnter={() => setHovered(def.id)}
          onMouseLeave={() => setHovered(null)}
          className="cursor-pointer transition-opacity"
        />
        {isHovered && (
          <>
            <rect
              x={def.cx - 30}
              y={def.cy - 22}
              width={60}
              height={16}
              rx={4}
              fill="hsl(240 30% 14%)"
            />
            <text
              x={def.cx}
              y={def.cy - 11}
              textAnchor="middle"
              fill="white"
              fontSize="6"
              fontFamily="monospace"
              letterSpacing="0.08em"
            >
              {def.id} · {status.replace("_", " ").toUpperCase()}
            </text>
          </>
        )}
      </g>
    );
  };

  return (
    <div className={className}>
      <svg viewBox="0 0 260 300" className="w-full max-w-xs mx-auto">
        {/* Upper gum path */}
        <path
          d="M 30 130 Q 30 18, 130 10 Q 230 18, 230 130"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="28"
          strokeLinecap="round"
        />
        {/* Upper label */}
        <text
          x="130" y="8"
          textAnchor="middle"
          fill="currentColor"
          fontSize="6"
          fontFamily="monospace"
          letterSpacing="0.15em"
          opacity="0.4"
        >
          UPPER
        </text>
        {UPPER_TEETH.map(renderTooth)}

        {/* Lower gum path */}
        <path
          d="M 30 170 Q 30 282, 130 290 Q 230 282, 230 170"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="28"
          strokeLinecap="round"
        />
        {LOWER_TEETH.map(renderTooth)}
        {/* Lower label */}
        <text
          x="130" y="299"
          textAnchor="middle"
          fill="currentColor"
          fontSize="6"
          fontFamily="monospace"
          letterSpacing="0.15em"
          opacity="0.4"
        >
          LOWER
        </text>
      </svg>
      {/* Legend */}
      <div className="flex justify-center gap-4 mt-4">
        {Object.entries({ on_track: "#22c55e", deviation: "#f59e0b", attention: "#ef4444", no_data: "#e5e7eb" }).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
            <span className="mono-label text-muted-foreground">
              {key.replace("_", " ").toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
