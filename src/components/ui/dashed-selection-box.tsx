import { cn } from "@/lib/utils";

interface DashedSelectionBoxProps {
  captured?: boolean;
  label?: string;
  className?: string;
  children?: React.ReactNode;
}

export function DashedSelectionBox({ captured = false, label, className, children }: DashedSelectionBoxProps) {
  return (
    <div
      className={cn(
        "relative transition-all duration-300",
        className
      )}
      style={{
        border: captured
          ? "1.5px solid #22c55e"
          : "1.5px dashed rgba(61,109,255,0.6)",
        background: captured
          ? "rgba(34,197,94,0.04)"
          : "rgba(61,109,255,0.04)",
      }}
    >
      {/* Corner handles */}
      {["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"].map((pos, i) => (
        <div
          key={i}
          className={cn("absolute w-[5px] h-[5px]", pos)}
          style={{
            background: captured ? "#22c55e" : "#3d6dff",
            transform: `translate(${pos.includes("left") ? "-50%" : "50%"}, ${pos.includes("top") ? "-50%" : "50%"})`,
          }}
        />
      ))}
      {label && (
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 mono-label text-muted-foreground whitespace-nowrap">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}
