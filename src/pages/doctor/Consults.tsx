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
        <span className="mono-label text-muted-foreground">VIRTUAL CONSULTATIONS</span>
        <h1 className="font-display text-3xl font-semibold mt-1 mb-6">Consult Inbox</h1>

        <div className="rounded-card p-6 mb-8 bg-card border border-border">
          <span className="mono-label mb-2 block text-muted-foreground">YOUR CONSULT LINK</span>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono px-3 py-2 rounded-tag flex-1 truncate bg-muted">{consultLink}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(consultLink); toast({ title: "Link copied" }); }} className="rounded-pill mono-label">Copy</Button>
          </div>
        </div>

        {loading ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-card mb-3" />) : requests.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No consultation requests yet. Share your link to get started.</p>
          </div>
        ) : requests.map((r) => (
          <div key={r.id} className="rounded-card p-6 mb-3 bg-card border border-border">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-display text-sm font-semibold">{r.patient_name}</p>
                <span className="mono-label text-muted-foreground">{r.patient_email}</span>
              </div>
              <span className={`mono-label px-2 py-0.5 rounded-pill ${
                r.status === "replied"
                  ? "bg-status-success/10 text-status-success"
                  : "bg-gold/10 text-gold"
              }`}>{r.status?.toUpperCase()}</span>
            </div>
            {r.concern_text && <p className="text-sm mb-3 text-foreground/60">{r.concern_text}</p>}
            <div className="flex items-center justify-between">
              <span className="mono-label text-muted-foreground">{new Date(r.submitted_at).toLocaleDateString()}</span>
              {r.status !== "replied" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); navigate(`/doctor/record/${r.id}`); }}
                  className="rounded-pill mono-label gap-1.5 h-7 border-primary/30 text-primary"
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
