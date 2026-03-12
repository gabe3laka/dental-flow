import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Menu, X } from "lucide-react";

interface NavItem {
  label: string;
  path: string;
}

interface MobileTopBarProps {
  brandLabel?: string;
  brandAccent?: string;
  navItems: NavItem[];
}

export default function MobileTopBar({ brandLabel = "ARCLINE", brandAccent, navItems }: MobileTopBarProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{
          background: "hsl(218 26% 11%)",
          borderColor: "hsl(0 0% 100% / 0.07)",
        }}
      >
        <span className="flex items-center gap-2">
          <span className="mono-label" style={{ color: brandAccent || "hsl(228 100% 62%)" }}>
            {brandLabel}
          </span>
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={signOut}
            className="mono-label transition hover:opacity-80"
            style={{ color: "hsl(38 23% 90% / 0.45)" }}
          >
            SIGN OUT
          </button>
          <button
            onClick={() => setOpen(!open)}
            className="p-1"
            style={{ color: "hsl(38 23% 90% / 0.7)" }}
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Dropdown nav */}
      {open && (
        <div
          className="px-4 py-2 border-b flex flex-wrap gap-2"
          style={{
            background: "hsl(218 26% 11%)",
            borderColor: "hsl(0 0% 100% / 0.07)",
          }}
        >
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.path !== navItems[0]?.path && location.pathname.startsWith(item.path));
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setOpen(false);
                }}
                className="rounded-pill px-3 py-1.5 mono-label transition"
                style={{
                  background: isActive ? "hsl(228 100% 62% / 0.15)" : "transparent",
                  color: isActive ? "hsl(228 100% 62%)" : "hsl(38 23% 90% / 0.45)",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
