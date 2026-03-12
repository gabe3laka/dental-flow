import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { Video } from "lucide-react";
import { logError } from "@/lib/logger";

export default function Consults() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase.from("consult_requests").select("*").eq("doctor_id", user.id).order("submitted_at", { ascending: false });
        setRequests(data || []);
      } catch (e) { logError(e, { operation: "Consults/loadData", userId: user?.id }); }
      finally { setLoading(false); }
    })();
  }, [user]);

  const consultSlug = user?.id?.slice(0, 8);
  const consultLink = `${window.location.origin}/consult/${consultSlug}`;

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>VIRTUAL CONSULTATIONS</span>
        <h1 className="font-display text-3xl font-semibold mt-1 mb-6">Consult Inbox</h1>

        <div className="rounded-card p-6 mb-8" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
          <span className="mono-label mb-2 block" style={{ color: "hsl(38 23% 90% / 0.45)" }}>YOUR CONSULT LINK</span>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono px-3 py-2 rounded-tag flex-1 truncate" style={{ background: "hsl(0 0% 100% / 0.05)" }}>{consultLink}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(consultLink); toast({ title: "Link copied" }); }} className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]">Copy</Button>
          </div>
        </div>

        {loading ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-card mb-3" />) : requests.length === 0 ? (
          <div className="text-center py-16">
            <p style={{ color: "hsl(38 23% 90% / 0.45)" }}>No consultation requests yet. Share your link to get started.</p>
          </div>
        ) : requests.map((r) => (
          <div key={r.id} className="rounded-card p-6 mb-3" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-display text-sm font-semibold">{r.patient_name}</p>
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{r.patient_email}</span>
              </div>
              <span className="mono-label px-2 py-0.5 rounded-pill" style={{
                background: r.status === "replied" ? "hsl(142 71% 45% / 0.1)" : "hsl(43 50% 54% / 0.1)",
                color: r.status === "replied" ? "hsl(142 71% 45%)" : "hsl(43 50% 54%)",
              }}>{r.status?.toUpperCase()}</span>
            </div>
            {r.concern_text && <p className="text-sm mb-3" style={{ color: "hsl(38 23% 90% / 0.6)" }}>{r.concern_text}</p>}
            <div className="flex items-center justify-between">
              <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{new Date(r.submitted_at).toLocaleDateString()}</span>
              {r.status !== "replied" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); navigate(`/doctor/record/${r.id}`); }}
                  className="rounded-pill font-mono text-[9px] uppercase tracking-[0.15em] gap-1.5 h-7"
                  style={{ borderColor: "hsl(228 100% 62% / 0.3)", color: "hsl(228 100% 62%)" }}
                >
                  <Video className="w-3 h-3" /> Record Reply
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
