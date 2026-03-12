import { useNavigate, useLocation } from "react-router-dom";

const navItems = [
  { label: "HOME", path: "/patient" },
  { label: "SCANS", path: "/patient/scans" },
  { label: "PROGRESS", path: "/patient/progress" },
  { label: "CHAT", path: "/patient/chat" },
  { label: "PROFILE", path: "/patient/profile" },
];

export function PatientBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border px-4 py-3 z-50">
      <div className="max-w-lg mx-auto flex justify-around">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className={`mono-label transition flex flex-col items-center gap-1 ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
