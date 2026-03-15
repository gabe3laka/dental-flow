import { useNavigate, useLocation } from "react-router-dom";
import { Home, ScanLine, TrendingUp, MessageCircle, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "HOME", path: "/patient", icon: Home },
  { label: "SCANS", path: "/patient/scans", icon: ScanLine },
  { label: "PROGRESS", path: "/patient/progress", icon: TrendingUp },
  { label: "CHAT", path: "/patient/chat", icon: MessageCircle },
  { label: "PROFILE", path: "/patient/profile", icon: UserCircle },
];

export function PatientBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/80 backdrop-blur-lg"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="max-w-[480px] mx-auto flex justify-around h-16">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 transition-colors relative",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
              )}
              <item.icon className="w-5 h-5" strokeWidth={isActive ? 2 : 1.5} />
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] font-medium">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
