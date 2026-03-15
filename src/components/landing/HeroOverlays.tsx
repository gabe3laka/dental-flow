import { useEffect, useState } from "react";
import ScanMetricsBlock from "./ScanMetricsBlock";

function AnnotationBox({
  label,
  borderColor,
  handleColor,
  className,
  delay,
  glowColor,
}: {
  label: string;
  borderColor: string;
  handleColor: string;
  className: string;
  delay: number;
  glowColor?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = () => setVisible(true);
    const hide = () => setVisible(false);
    const cycle = () => {
      show();
      setTimeout(hide, 2800);
    };
    const initial = setTimeout(() => {
      cycle();
      const interval = setInterval(cycle, 5500);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(initial);
  }, [delay]);

  return (
    <div
      className={`absolute pointer-events-none transition-opacity duration-700 ${className}`}
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className="relative w-32 h-24"
        style={{
          border: `1.5px dashed ${borderColor}`,
          background: "rgba(61,109,255,0.04)",
          boxShadow: glowColor
            ? `0 0 0 1px rgba(255,255,255,0.1), 0 0 30px ${glowColor}`
            : undefined,
        }}
      >
        {["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"].map(
          (pos, i) => (
            <div
              key={i}
              className={`absolute w-[5px] h-[5px] ${pos}`}
              style={{
                background: handleColor,
                transform: `translate(${pos.includes("left") ? "-50%" : "50%"}, ${pos.includes("top") ? "-50%" : "50%"})`,
              }}
            />
          )
        )}
        <span
          className="absolute top-2 left-2 font-mono uppercase tracking-[0.15em] text-[11px] px-1.5 py-0.5 rounded"
          style={{
            color: "#fff",
            background: "rgba(61,109,255,0.45)",
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

export default function HeroOverlays() {
  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* Zone pill */}
      <div className="absolute top-6 left-6">
        <span
          className="font-mono uppercase tracking-[0.15em] text-[11px] text-white/40 px-2 py-1 rounded-full"
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.05)",
          }}
        >
          UPPER ARCH · LEFT QUADRANT
        </span>
      </div>

      {/* Scan Metrics — upper right */}
      <div className="absolute top-20 right-6">
        <ScanMetricsBlock />
      </div>

      {/* T14 UPPER — white on dark gradient area */}
      <AnnotationBox
        label="T14 · UPPER"
        borderColor="rgba(255,255,255,0.6)"
        handleColor="rgba(255,255,255,0.8)"
        className="top-[30%] left-[10%]"
        delay={400}
        glowColor="rgba(61,109,255,0.5)"
      />

      {/* T22 LOWER — in the lighter transition zone */}
      <AnnotationBox
        label="T22 · LOWER"
        borderColor="rgba(61,109,255,0.7)"
        handleColor="rgba(61,109,255,0.8)"
        className="bottom-[28%] left-[18%]"
        delay={1800}
        glowColor="rgba(61,109,255,0.35)"
      />
    </div>
  );
}
