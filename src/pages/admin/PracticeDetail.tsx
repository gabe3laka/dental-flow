import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";

const TIER_PRICES: Record<string, number> = { starter: 149, growth: 349, enterprise: 999 };
const TIER_LIMITS: Record<string, number> = { starter: 50, growth: 200, enterprise: 999 };

export default function AdminPracticeDetail() {
  const { practiceId } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [patientCount, setPatientCount] = useState(0);
  const [patients, setPatients] = useState<any[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [noteContent, setNoteContent] = useState("");

  useEffect(() => {
    if (!practiceId) return;
    (async () => {
      try {
        const [profileResult, subResult, patientsResult, patientsListResult, msgsResult] = await Promise.allSettled([
          supabase.from("profiles").select("*").eq("user_id", practiceId).single(),
          supabase.from("subscriptions").select("*").eq("doctor_id", practiceId).single(),
          supabase.from("patients").select("id", { count: "exact", head: true }).eq("assigned_doctor_id", practiceId),
          supabase.from("patients").select("id, user_id").eq("assigned_doctor_id", practiceId).limit(20),
          supabase.from("messages").select("id", { count: "exact", head: true }).eq("sender_id", practiceId),
        ]);

        if (profileResult.status === "rejected") logError(profileResult.reason, { operation: "AdminPracticeDetail/fetchProfile" });
        if (subResult.status === "rejected") logError(subResult.reason, { operation: "AdminPracticeDetail/fetchSubscription" });
        if (patientsResult.status === "rejected") logError(patientsResult.reason, { operation: "AdminPracticeDetail/fetchPatientCount" });
        if (patientsListResult.status === "rejected") logError(patientsListResult.reason, { operation: "AdminPracticeDetail/fetchPatientsList" });
        if (msgsResult.status === "rejected") logError(msgsResult.reason, { operation: "AdminPracticeDetail/fetchMessages" });

        const profileData = profileResult.status === "fulfilled" ? profileResult.value.data : null;
        const subData = subResult.status === "fulfilled" ? subResult.value.data : null;
        const patientsData = patientsResult.status === "fulfilled" ? patientsResult.value : null;
        const patientsListData = patientsListResult.status === "fulfilled" ? patientsListResult.value.data : null;
        const msgsData = msgsResult.status === "fulfilled" ? msgsResult.value : null;

        setProfile(profileData);
        setSubscription(subData);
        setPatientCount(patientsData?.count || 0);
        setMessageCount(msgsData?.count || 0);

        // Get patient names
        if (patientsListData?.length) {
          const userIds = patientsListData.map((p) => p.user_id);
          const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
          const nameMap: Record<string, string> = {};
          (profiles || []).forEach((p) => { nameMap[p.user_id] = p.full_name || "Unknown"; });
          setPatients(patientsListData.map((p) => ({ ...p, name: nameMap[p.user_id] || "Unknown" })));
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [practiceId]);

  const toggleSuspend = async () => {
    if (!practiceId || !profile) return;
    const newVal = !profile.suspended;
    await supabase.from("profiles").update({ suspended: newVal, suspension_reason: newVal ? "Suspended by admin" : null }).eq("user_id", practiceId);
    setProfile({ ...profile, suspended: newVal });
    toast({ title: newVal ? "Practice suspended" : "Practice reactivated" });
  };

  const addNote = async () => {
    if (!noteContent.trim() || !user || !practiceId) return;
    try {
      await supabase.from("admin_notes").insert({
        admin_id: user.id,
        content: noteContent.trim(),
        target_id: practiceId,
        target_type: "practice",
      });
      setNoteContent("");
      toast({ title: "Note added" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (loading) return <Skeleton className="h-96 rounded-card" />;
  if (!profile) return <p style={{ color: "hsl(38 23% 90% / 0.3)" }}>Practice not found.</p>;

  const tier = subscription?.plan_tier || "starter";
  const limit = TIER_LIMITS[tier] || 50;
  const mrrValue = TIER_PRICES[tier] || 0;

  return (
    <div>
      <span className="mono-label" style={{ color: "hsl(0 84% 60%)" }}>PRACTICE DETAIL</span>
      <h1 className="font-display text-3xl font-semibold mt-1 mb-8">{profile.full_name || "Unknown"}</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {[
          { label: "SPECIALTY", value: profile.specialty || "—" },
          { label: "PRACTICE NAME", value: profile.practice_name || "—" },
          { label: "STATUS", value: profile.suspended ? "SUSPENDED" : "ACTIVE" },
          { label: "YEARS", value: String(profile.years_practice || 0) },
        ].map((item) => (
          <div key={item.label} className="rounded-card p-5" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>{item.label}</span>
            <p className="text-sm mt-2">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Subscription Block */}
      <div className="rounded-card p-6 mb-6" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
        <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>SUBSCRIPTION</span>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>PLAN</span>
            <p className="font-display text-lg font-semibold mt-1 capitalize">{tier}</p>
          </div>
          <div>
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>MRR</span>
            <p className="font-display text-lg font-semibold mt-1">${mrrValue}</p>
          </div>
          <div>
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>NEXT PAYMENT</span>
            <p className="text-sm mt-1">{subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—"}</p>
          </div>
          <div>
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>STRIPE ID</span>
            <p className="font-mono text-xs mt-1 truncate" style={{ color: "hsl(38 23% 90% / 0.45)" }}>
              {subscription?.stripe_subscription_id || "Not connected"}
            </p>
          </div>
        </div>
      </div>

      {/* Usage Meters */}
      <div className="rounded-card p-6 mb-6" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
        <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>USAGE</span>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1">
              <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>PATIENTS ENROLLED</span>
              <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{patientCount} / {limit}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (patientCount / limit) * 100)}%`, background: "hsl(228 100% 62%)" }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>MESSAGES SENT</span>
              <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{messageCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Patient Roster */}
      <div className="rounded-card p-6 mb-6" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
        <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>PATIENT ROSTER ({patientCount})</span>
        {patients.length === 0 ? (
          <p className="text-sm" style={{ color: "hsl(38 23% 90% / 0.3)" }}>No patients enrolled.</p>
        ) : (
          <div className="space-y-2">
            {patients.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2 border-b" style={{ borderColor: "hsl(0 0% 100% / 0.04)" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "hsl(228 100% 62% / 0.15)" }}>
                  <span className="mono-label" style={{ color: "hsl(228 100% 62%)" }}>{(p.name || "?")[0]}</span>
                </div>
                <span className="text-sm">{p.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="rounded-card p-6 mb-6" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
        <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>ACTIONS</span>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={toggleSuspend}
              className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]"
              style={{ background: profile.suspended ? "hsl(142 71% 45%)" : "hsl(0 84% 60%)", color: "white" }}
            >
              {profile.suspended ? "Reactivate" : "Suspend Practice"}
            </Button>
            <Button
              variant="outline"
              onClick={() => toast({ title: "Impersonation", description: "Impersonation not yet implemented." })}
              className="rounded-pill font-mono text-xs uppercase tracking-[0.15em] border-border text-foreground"
            >
              View as Doctor
            </Button>
          </div>

          <div>
            <span className="mono-label mb-2 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>ADD ADMIN NOTE</span>
            <Textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Write a note about this practice..."
              className="bg-card border-border text-foreground mb-2"
            />
            <Button onClick={addNote} disabled={!noteContent.trim()} className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]" style={{ background: "hsl(0 84% 60%)", color: "white" }}>
              Save Note
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
