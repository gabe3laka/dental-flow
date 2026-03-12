import { cn } from "@/lib/utils";

interface VerticalLabelProps {
  text: string;
  className?: string;
}

export function VerticalLabel({ text, className }: VerticalLabelProps) {
  return (
    <div
      className={cn(
        "absolute right-0 top-1/2 font-mono uppercase tracking-[0.15em] select-none pointer-events-none",
        className
      )}
      style={{
        transform: "rotate(-90deg) translateX(50%)",
        transformOrigin: "right center",
        fontSize: "9px",
        color: "rgba(255,255,255,0.15)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
}
