import { useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { LayoutGrid, BarChart2, Video, Zap, Settings } from "lucide-react";
import MobileTopBar from "@/components/MobileTopBar";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "OVERVIEW", path: "/doctor", icon: LayoutGrid },
  { label: "ANALYTICS", path: "/doctor/analytics", icon: BarChart2 },
  { label: "CONSULTS", path: "/doctor/consults", icon: Video },
  { label: "AUTOMATIONS", path: "/doctor/automations", icon: Zap },
  { label: "SETTINGS", path: "/doctor/settings", icon: Settings },
];

const mobileNavItems = navItems.map((n) => ({ label: n.label, path: n.path }));

export default function DoctorLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, []);

  const isActive = (path: string) => {
    if (path === "/doctor") return location.pathname === "/doctor";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile top bar */}
      <MobileTopBar navItems={mobileNavItems} brandLabel="ARCLINE" brandAccent="hsl(228 100% 62%)" />

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-64 z-40 bg-card border-r border-border">
        {/* Brand */}
        <div className="px-5 pt-6 pb-8 flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full animate-nav-dot-pulse bg-primary"
            style={{ boxShadow: "0 0 8px hsl(var(--primary))" }}
          />
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground">
            ARCLINE
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "w-full flex items-center gap-3 transition-colors mono-label rounded-tag",
                  active
                    ? "text-primary border-l-[3px] border-primary bg-primary/[0.08] pl-5 pr-3.5 py-2.5"
                    : "text-muted-foreground border-l-[3px] border-transparent px-3.5 py-2.5 hover:text-foreground/60"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="px-5 pb-6 space-y-3">
          <p className="mono-label truncate text-muted-foreground">
            {user?.email}
          </p>
          <button
            onClick={signOut}
            className="w-full py-2 rounded-md font-mono text-[10px] uppercase tracking-[0.15em] transition-colors border border-border text-muted-foreground bg-transparent hover:bg-muted"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <main className="lg:ml-64 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
