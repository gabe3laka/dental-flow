import { cn } from "@/lib/utils";

interface SplitScreenLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
  leftWidth?: string;
  className?: string;
}

export function SplitScreenLayout({ left, right, leftWidth = "60%", className }: SplitScreenLayoutProps) {
  return (
    <div className={cn("flex h-full w-full", className)}>
      <div
        className="relative overflow-hidden"
        style={{ width: leftWidth, background: "linear-gradient(135deg, #2a4de0, #6b9aff)" }}
      >
        {left}
      </div>
      <div className="flex-1 bg-card overflow-auto">
        {right}
      </div>
    </div>
  );
}
