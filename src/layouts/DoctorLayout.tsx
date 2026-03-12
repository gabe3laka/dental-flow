import { useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { LayoutGrid, BarChart2, Video, Zap, Settings } from "lucide-react";
import MobileTopBar from "@/components/MobileTopBar";

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
    <div className="min-h-screen" style={{ background: "hsl(216 32% 7%)", color: "hsl(38 23% 90%)" }}>
      {/* Mobile top bar */}
      <MobileTopBar navItems={mobileNavItems} brandLabel="ARCLINE" brandAccent="hsl(228 100% 62%)" />

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-64 z-40"
        style={{
          background: "hsl(218 26% 11%)",
          borderRight: "1px solid hsl(0 0% 100% / 0.06)",
        }}
      >
        {/* Brand */}
        <div className="px-5 pt-6 pb-8 flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full animate-nav-dot-pulse"
            style={{ background: "hsl(228 100% 62%)", boxShadow: "0 0 8px hsl(228 100% 62%)" }}
          />
          <span
            className="font-mono text-[11px] uppercase"
            style={{ letterSpacing: "0.2em", color: "hsl(38 23% 90%)" }}
          >
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
                className="w-full flex items-center gap-3 transition-colors"
                style={{
                  padding: active ? "10px 14px 10px 20px" : "10px 14px",
                  borderRadius: 6,
                  borderLeft: active ? "3px solid hsl(228 100% 62%)" : "3px solid transparent",
                  background: active ? "hsl(228 100% 62% / 0.08)" : "transparent",
                  color: active ? "hsl(228 100% 72%)" : "hsl(38 23% 90% / 0.4)",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase" as const,
                }}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="px-5 pb-6 space-y-3">
          <p
            className="font-mono text-[9px] truncate"
            style={{ color: "hsl(38 23% 90% / 0.3)" }}
          >
            {user?.email}
          </p>
          <button
            onClick={signOut}
            className="w-full py-2 rounded-md font-mono text-[10px] uppercase tracking-[0.15em] transition-colors"
            style={{
              border: "1px solid hsl(0 0% 100% / 0.08)",
              color: "hsl(38 23% 90% / 0.5)",
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "hsl(0 0% 100% / 0.04)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
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
