import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function ImpersonationBanner() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const storedEmail = sessionStorage.getItem("impersonating_email");
    setEmail(storedEmail);
    const handler = () => setEmail(sessionStorage.getItem("impersonating_email"));
    window.addEventListener("storage", handler);
    // Also poll for changes within same tab
    const interval = setInterval(handler, 500);
    return () => { window.removeEventListener("storage", handler); clearInterval(interval); };
  }, []);

  if (!email) return null;

  const handleExit = async () => {
    const logId = sessionStorage.getItem("impersonation_log_id");
    if (logId) {
      await supabase.from("impersonation_log").update({ ended_at: new Date().toISOString() }).eq("id", logId);
    }
    sessionStorage.removeItem("impersonating_user_id");
    sessionStorage.removeItem("impersonating_email");
    sessionStorage.removeItem("impersonation_log_id");
    setEmail(null);
    navigate("/admin");
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-4 py-2 px-4"
      style={{ background: "hsl(0 84% 60%)", color: "white" }}>
      <span className="font-mono text-[10px] uppercase tracking-[0.15em]">
        ADMIN MODE — Viewing as {email}
      </span>
      <button onClick={handleExit}
        className="px-4 py-1 rounded-pill font-mono text-[10px] uppercase tracking-[0.15em] bg-white text-black hover:bg-white/90 transition">
        Exit
      </button>
    </div>
  );
}
