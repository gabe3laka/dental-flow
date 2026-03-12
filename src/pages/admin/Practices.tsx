import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { logError } from "@/lib/logger";

interface PracticeRow {
  userId: string;
  name: string;
  practiceName: string;
  specialty: string;
  totalPatients: number;
  suspended: boolean;
  planTier: string | null;
  trialEndsAt: string | null;
}

const STATUS_FILTERS = ["ALL", "ACTIVE", "SUSPENDED", "TRIAL"];

export default function AdminPractices() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [practices, setPractices] = useState<PracticeRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: doctors } = await supabase.from("user_roles").select("user_id").eq("role", "doctor");
        if (!doctors?.length) { setLoading(false); return; }
        const ids = doctors.map((d) => d.user_id);
        const [profilesResult, subsResult] = await Promise.allSettled([
          supabase.from("profiles").select("user_id, full_name, practice_name, specialty, total_patients, suspended, trial_ends_at").in("user_id", ids),
          supabase.from("subscriptions").select("doctor_id, plan_tier, status").in("doctor_id", ids),
        ]);

        if (profilesResult.status === "rejected") {
          logError(profilesResult.reason, { operation: "AdminPractices/fetchProfiles" });
        }
        if (subsResult.status === "rejected") {
          logError(subsResult.reason, { operation: "AdminPractices/fetchSubscriptions" });
        }

        const profilesData = profilesResult.status === "fulfilled" ? profilesResult.value.data : null;
        const subsData = subsResult.status === "fulfilled" ? subsResult.value.data : null;

        const subMap: Record<string, { plan_tier: string; status: string }> = {};
        (subsData || []).forEach((s) => { subMap[s.doctor_id] = s; });

        setPractices((profilesData || []).map((p) => ({
          userId: p.user_id,
          name: p.full_name || "Unknown",
          practiceName: p.practice_name || "—",
          specialty: p.specialty || "—",
          totalPatients: p.total_patients || 0,
          suspended: p.suspended || false,
          planTier: subMap[p.user_id]?.plan_tier || null,
          trialEndsAt: p.trial_ends_at,
        })));
      } catch (e) { logError(e, { operation: "AdminPractices/loadData" }); }
      finally { setLoading(false); }
    })();
  }, []);

  const getStatus = (p: PracticeRow) => {
    if (p.suspended) return "SUSPENDED";
    if (p.trialEndsAt && new Date(p.trialEndsAt) > new Date()) return "TRIAL";
    return "ACTIVE";
  };

  const filtered = practices
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.practiceName.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => statusFilter === "ALL" || getStatus(p) === statusFilter);

  const handleSuspend = async (userId: string, suspend: boolean) => {
    await supabase.from("profiles").update({ suspended: suspend, suspension_reason: suspend ? "Suspended by admin" : null }).eq("user_id", userId);
    setPractices(practices.map((p) => p.userId === userId ? { ...p, suspended: suspend } : p));
    toast({ title: suspend ? "Practice suspended" : "Practice reactivated" });
  };

  return (
    <div>
      <span className="mono-label" style={{ color: "hsl(0 84% 60%)" }}>PRACTICES</span>
      <h1 className="font-display text-3xl font-semibold mt-1 mb-6">All Practices</h1>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Input
          placeholder="Search practices..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm bg-card border-border text-foreground"
        />
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className="px-3 py-1.5 rounded-pill mono-label transition"
              style={{
                background: statusFilter === f ? "hsl(0 84% 60% / 0.15)" : "transparent",
                color: statusFilter === f ? "hsl(0 84% 60%)" : "hsl(38 23% 90% / 0.3)",
                border: `1px solid ${statusFilter === f ? "hsl(0 84% 60% / 0.3)" : "hsl(0 0% 100% / 0.07)"}`,
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-card overflow-hidden" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
        <div className="hidden md:grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr] gap-4 p-4 border-b" style={{ borderColor: "hsl(0 0% 100% / 0.06)" }}>
          {["DOCTOR", "PRACTICE", "SPECIALTY", "PATIENTS", "PLAN", "STATUS"].map((h) => (
            <span key={h} className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>{h}</span>
          ))}
        </div>
        {loading ? [1, 2, 3].map((i) => (
          <div key={i} className="p-4"><Skeleton className="h-8" /></div>
        )) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm" style={{ color: "hsl(38 23% 90% / 0.3)" }}>No practices found.</p>
          </div>
        ) : filtered.map((p) => {
          const status = getStatus(p);
          return (
            <div key={p.userId} className="border-b" style={{ borderColor: "hsl(0 0% 100% / 0.04)" }}>
              {/* Desktop row */}
              <div
                onClick={() => navigate(`/admin/practices/${p.userId}`)}
                className="hidden md:grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr] gap-4 p-4 cursor-pointer hover:opacity-80 transition items-center"
              >
                <span className="text-sm font-medium">{p.name}</span>
                <span className="text-sm" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{p.practiceName}</span>
                <span className="text-sm" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{p.specialty}</span>
                <span className="text-sm" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{p.totalPatients}</span>
                <span className="mono-label" style={{ color: "hsl(228 100% 62%)" }}>{p.planTier?.toUpperCase() || "—"}</span>
                <span className="mono-label" style={{
                  color: status === "SUSPENDED" ? "hsl(0 84% 60%)" : status === "TRIAL" ? "hsl(38 92% 50%)" : "hsl(142 71% 45%)",
                }}>
                  {status}
                </span>
              </div>
              {/* Mobile card */}
              <div className="md:hidden p-4 space-y-2" onClick={() => navigate(`/admin/practices/${p.userId}`)}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="mono-label" style={{
                    color: status === "SUSPENDED" ? "hsl(0 84% 60%)" : status === "TRIAL" ? "hsl(38 92% 50%)" : "hsl(142 71% 45%)",
                  }}>{status}</span>
                </div>
                <div className="flex gap-4">
                  <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>{p.specialty}</span>
                  <span className="mono-label" style={{ color: "hsl(228 100% 62%)" }}>{p.planTier?.toUpperCase() || "—"}</span>
                  <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>{p.totalPatients} pts</span>
                </div>
              </div>
              {/* Row actions */}
              <div className="px-4 pb-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); handleSuspend(p.userId, !p.suspended); }}
                  className="rounded-pill font-mono text-[9px] uppercase tracking-[0.15em] h-7"
                  style={{
                    borderColor: p.suspended ? "hsl(142 71% 45% / 0.3)" : "hsl(0 84% 60% / 0.3)",
                    color: p.suspended ? "hsl(142 71% 45%)" : "hsl(0 84% 60%)",
                  }}
                >
                  {p.suspended ? "Reactivate" : "Suspend"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); navigate(`/admin/billing`); }}
                  className="rounded-pill font-mono text-[9px] uppercase tracking-[0.15em] h-7 border-border text-muted-foreground"
                >
                  View Billing
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!user) return;
                    const { data: logEntry } = await supabase.from("impersonation_log").insert({
                      admin_id: user.id,
                      target_user_id: p.userId,
                      reason: "View as Doctor from Practices page",
                    }).select("id").single();
                    sessionStorage.setItem("impersonating_user_id", p.userId);
                    sessionStorage.setItem("impersonating_email", p.name);
                    if (logEntry) sessionStorage.setItem("impersonation_log_id", logEntry.id);
                    navigate("/doctor");
                  }}
                  className="rounded-pill font-mono text-[9px] uppercase tracking-[0.15em] h-7"
                  style={{ borderColor: "hsl(228 100% 62% / 0.3)", color: "hsl(228 100% 62%)" }}
                >
                  View as Doctor
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
