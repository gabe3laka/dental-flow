import { cn } from "@/lib/utils";

interface PillNavTab {
  id: string;
  label: string;
}

interface PillNavProps {
  tabs: PillNavTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
}

export function PillNav({ tabs, activeTab, onTabChange, className }: PillNavProps) {
  return (
    <div className={cn("flex items-center gap-0", className)}>
      {tabs.map((tab, i) => (
        <div key={tab.id} className="flex items-center">
          {i > 0 && (
            <span className="mx-2 text-muted-foreground font-mono text-xs select-none">—</span>
          )}
          <button
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "font-mono text-[10px] uppercase tracking-[0.15em] px-4 py-1.5 rounded-pill transition-all duration-150 ease-in-out",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        </div>
      ))}
    </div>
  );
}
