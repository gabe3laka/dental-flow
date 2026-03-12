import { useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import MobileTopBar from "@/components/MobileTopBar";

const navItems = [
  { label: "Overview", path: "/admin" },
  { label: "Practices", path: "/admin/practices" },
  { label: "Patients", path: "/admin/patients" },
  { label: "Billing", path: "/admin/billing" },
  { label: "Support", path: "/admin/support" },
  { label: "System", path: "/admin/system" },
  { label: "Settings", path: "/admin/settings" },
];

export default function AdminLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => { document.documentElement.classList.remove("dark"); };
  }, []);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: "hsl(216 32% 7%)", color: "hsl(38 23% 90%)" }}>
      {/* Mobile top bar */}
      <MobileTopBar brandLabel="ADMIN" brandAccent="hsl(0 84% 60%)" navItems={navItems} />

      {/* Desktop sidebar */}
      <aside className="w-64 min-h-screen flex-col p-6 border-r hidden lg:flex" style={{ background: "hsl(218 26% 11%)", borderColor: "hsl(0 0% 100% / 0.07)" }}>
        <div className="mb-8">
          <span className="mono-label" style={{ color: "hsl(0 84% 60%)" }}>ADMIN</span>
          <span className="mono-label ml-2" style={{ color: "hsl(38 23% 90% / 0.3)" }}>· ELEVATED ACCESS</span>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path !== "/admin" && location.pathname.startsWith(item.path));
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="w-full text-left px-4 py-2.5 rounded-tag text-sm font-body transition"
                style={{
                  background: isActive ? "hsl(0 84% 60% / 0.1)" : "transparent",
                  color: isActive ? "hsl(0 84% 60%)" : "hsl(38 23% 90% / 0.45)",
                  borderLeft: isActive ? "2px solid hsl(0 84% 60%)" : "2px solid transparent",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <button onClick={signOut} className="mono-label hover:opacity-80 transition mt-auto" style={{ color: "hsl(38 23% 90% / 0.45)" }}>
          SIGN OUT
        </button>
      </aside>

      {/* Content */}
      <main className="flex-1 p-4 md:p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
