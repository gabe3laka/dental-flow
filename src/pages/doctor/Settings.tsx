import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, X, Plus } from "lucide-react";
import { logError } from "@/lib/logger";

const SPECIALTY_OPTIONS = [
  "Orthodontist",
  "General Dentist",
  "Pediatric Dentist",
  "Prosthodontist",
  "Periodontist",
  "Other",
];

const DAYS_OF_WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export default function DoctorSettings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [patientCount, setPatientCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingSpecialty, setEditingSpecialty] = useState(false);
  const [specialtyValue, setSpecialtyValue] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [teamInvites, setTeamInvites] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [addingSlot, setAddingSlot] = useState(false);
  const [savingSpecialty, setSavingSpecialty] = useState(false);

  // Availability slots
  const [slots, setSlots] = useState<any[]>([]);
  const [newSlotDay, setNewSlotDay] = useState("MON");
  const [newSlotTime, setNewSlotTime] = useState("09:00");
  const [showAddSlot, setShowAddSlot] = useState(false);

  // Deactivation
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState("");
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [profileRes, subRes, patientsRes, invitesRes, slotsRes] = await Promise.all([
          supabase.from("profiles").select("*").eq("user_id", user.id).single(),
          supabase.from("subscriptions").select("*").eq("doctor_id", user.id).single(),
          supabase.from("patients").select("id", { count: "exact", head: true }).eq("assigned_doctor_id", user.id),
          supabase.from("team_invites").select("*").eq("practice_id", user.id).order("invited_at", { ascending: false }),
          supabase.from("doctor_availability" as any).select("*").eq("doctor_id", user.id).order("created_at", { ascending: true }),
        ]);
        setProfile(profileRes.data);
        setSubscription(subRes.data);
        setPatientCount(patientsRes.count || 0);
        setSpecialtyValue(profileRes.data?.specialty || "");
        setTeamInvites(invitesRes.data || []);
        setSlots((slotsRes.data as any[]) || []);
      } catch (e) { logError(e, { operation: "Settings.loadData", userId: user?.id }); }
      finally { setLoading(false); }
    })();
  }, [user]);

  const planLimits: Record<string, number> = { starter: 50, growth: 200, enterprise: 999 };
  const currentTier = subscription?.plan_tier || "starter";
  const limit = planLimits[currentTier] || 50;

  const saveSpecialty = async (value: string) => {
    if (!user || savingSpecialty) return;
    setSavingSpecialty(true);
    try {
      await supabase.from("profiles").update({ specialty: value }).eq("user_id", user.id);
      setProfile({ ...profile, specialty: value });
      setSpecialtyValue(value);
      setEditingSpecialty(false);
      toast({ title: "Specialty updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSavingSpecialty(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `logos/${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("profile-photos").upload(path, file, { upsert: true });
      if (error) throw error;
      toast({ title: "Logo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !user || inviting) return;
    setInviting(true);
    try {
      const { error } = await supabase.from("team_invites").insert({
        practice_id: user.id,
        invited_email: inviteEmail.trim(),
        role: inviteRole,
      });
      if (error) throw error;
      setTeamInvites([{ id: crypto.randomUUID(), practice_id: user.id, invited_email: inviteEmail.trim(), role: inviteRole, invited_at: new Date().toISOString(), accepted_at: null }, ...teamInvites]);
      setInviteEmail("");
      setShowInviteModal(false);
      toast({ title: "Invite sent" });
    } catch (e: any) {
      logError(e, { operation: "Settings.handleInvite", userId: user?.id });
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleAddSlot = async () => {
    if (!user || addingSlot) return;
    setAddingSlot(true);
    try {
      const { data, error } = await supabase.from("doctor_availability" as any).insert({
        doctor_id: user.id,
        day_of_week: newSlotDay,
        start_time: newSlotTime,
        is_active: true,
      } as any).select().single();
      if (error) throw error;
      setSlots([...slots, data]);
      setShowAddSlot(false);
      toast({ title: "Slot added" });
    } catch (e: any) {
      logError(e, { operation: "Settings.handleAddSlot", userId: user?.id });
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAddingSlot(false);
    }
  };

  const handleToggleSlot = async (id: string, isActive: boolean) => {
    await supabase.from("doctor_availability" as any).update({ is_active: !isActive } as any).eq("id", id);
    setSlots(slots.map((s) => s.id === id ? { ...s, is_active: !isActive } : s));
  };

  const handleDeleteSlot = async (id: string) => {
    await supabase.from("doctor_availability" as any).delete().eq("id", id);
    setSlots(slots.filter((s) => s.id !== id));
  };

  const handleDeactivate = async () => {
    if (!user || deactivateConfirm !== "DEACTIVATE") return;
    setDeactivating(true);
    try {
      await supabase.from("profiles").update({ suspended: true, suspension_reason: "self_deactivated" }).eq("user_id", user.id);
      toast({ title: "Practice deactivated", description: "Contact support to reactivate." });
      await signOut();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setDeactivating(false);
    }
  };

  const handleManageBilling = async () => {
    if (!subscription?.stripe_customer_id) {
      toast({ title: "Connect Stripe", description: "No Stripe account connected. Contact support to set up billing." });
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke("create-billing-portal", {
        body: { customer_id: subscription.stripe_customer_id },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      } else {
        toast({ title: "Stripe billing portal", description: "Unable to create session. Contact support." });
      }
    } catch {
      toast({ title: "Stripe billing portal", description: "Stripe integration not configured yet. Contact support." });
    }
  };

  const consultSlug = profile?.doctor_slug || user?.id?.slice(0, 8);

  const suiteFeatures: Record<string, string[]> = {
    starter: ["ArclineCare: Remote monitoring, scan submission, messaging"],
    growth: ["ArclineCare + ArclineGrowth: AI analysis, video responses, analytics, virtual consults"],
    enterprise: ["ArclineCare + ArclineGrowth + ArclineThrive: Smart automations, referral network, full team management"],
  };

  function getStatusBadge() {
    if (!subscription) return { label: "FREE TIER", color: "hsl(38 23% 90% / 0.45)", bg: "hsl(0 0% 100% / 0.05)" };
    switch (subscription.status) {
      case "active": return { label: "ACTIVE", color: "hsl(142 71% 45%)", bg: "hsl(142 71% 45% / 0.1)" };
      case "trialing": return { label: "TRIAL", color: "hsl(43 50% 54%)", bg: "hsl(43 50% 54% / 0.1)" };
      case "past_due": return { label: "PAST DUE", color: "hsl(0 84% 60%)", bg: "hsl(0 84% 60% / 0.1)" };
      case "canceled": return { label: "CANCELED", color: "hsl(38 23% 90% / 0.45)", bg: "hsl(0 0% 100% / 0.05)" };
      default: return { label: "FREE TIER", color: "hsl(38 23% 90% / 0.45)", bg: "hsl(0 0% 100% / 0.05)" };
    }
  }

  const statusBadge = getStatusBadge();

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>SETTINGS</span>
        <h1 className="font-display text-3xl font-semibold mt-1 mb-8">Practice Profile</h1>

        {!loading && profile && !profile.practice_setup_completed && (
          <div
            className="rounded-md p-4 mb-6 flex items-start gap-3"
            style={{ background: "hsl(43 50% 54% / 0.1)", border: "1px solid hsl(43 50% 54% / 0.2)" }}
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "hsl(43 50% 54%)" }} />
            <div>
              <p className="text-[13px]" style={{ color: "hsl(43 50% 54%)" }}>
                Your practice profile is incomplete. Complete setup to unlock all features.
              </p>
              <button
                onClick={() => navigate("/doctor/setup")}
                className="mono-label mt-2 hover:underline"
                style={{ color: "hsl(43 50% 54%)" }}
              >
                COMPLETE SETUP →
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Account Info */}
            <div className="rounded-card p-6 space-y-4" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
              <div>
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>ACCOUNT EMAIL</span>
                <p className="text-sm mt-1">{user?.email}</p>
              </div>
              <div>
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>DISPLAY NAME</span>
                <p className="text-sm mt-1">{user?.user_metadata?.full_name || "—"}</p>
              </div>
              <div>
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>SPECIALTY</span>
                {editingSpecialty ? (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {SPECIALTY_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => saveSpecialty(opt)}
                        disabled={savingSpecialty}
                        className="px-3 py-1.5 rounded-pill mono-label transition"
                        style={{
                          background: specialtyValue === opt ? "hsl(228 100% 62%)" : "transparent",
                          color: specialtyValue === opt ? "white" : "hsl(38 23% 90% / 0.6)",
                          border: `1px solid ${specialtyValue === opt ? "hsl(228 100% 62%)" : "hsl(0 0% 100% / 0.1)"}`,
                        }}
                      >
                        {opt.toUpperCase()}
                      </button>
                    ))}
                    <button onClick={() => setEditingSpecialty(false)} className="mono-label px-3 py-1.5" style={{ color: "hsl(38 23% 90% / 0.4)" }}>CANCEL</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm" style={{ color: profile?.specialty ? undefined : "hsl(38 23% 90% / 0.3)" }}>
                      {profile?.specialty || "Not set"}
                    </p>
                    <button onClick={() => setEditingSpecialty(true)} className="mono-label" style={{ color: "hsl(228 100% 62%)" }}>EDIT</button>
                  </div>
                )}
              </div>
              <div>
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>PRACTICE NAME</span>
                <p className="text-sm mt-1">{profile?.practice_name || "—"}</p>
              </div>
            </div>

            {/* Practice Logo */}
            <div className="rounded-card p-6" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
              <span className="mono-label mb-3 block" style={{ color: "hsl(38 23% 90% / 0.45)" }}>PRACTICE LOGO</span>
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              <Button
                variant="outline"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]"
              >
                {uploadingLogo ? "Uploading..." : "Upload Logo"}
              </Button>
            </div>

            {/* Availability */}
            <div className="rounded-card p-6" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
              <div className="flex items-center justify-between mb-4">
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>AVAILABILITY</span>
                <Button
                  size="sm"
                  onClick={() => setShowAddSlot(!showAddSlot)}
                  className="rounded-pill font-mono text-[9px] uppercase tracking-[0.15em] gap-1"
                  style={{ background: "hsl(228 100% 62%)", color: "white" }}
                >
                  <Plus className="w-3 h-3" /> Add Slot
                </Button>
              </div>
              {showAddSlot && (
                <div className="mb-4 p-4 rounded-tag space-y-3" style={{ background: "hsl(0 0% 100% / 0.03)" }}>
                  <div className="flex gap-2">
                    {DAYS_OF_WEEK.map((d) => (
                      <button
                        key={d}
                        onClick={() => setNewSlotDay(d)}
                        className="px-2 py-1 rounded-pill mono-label transition"
                        style={{
                          background: newSlotDay === d ? "hsl(228 100% 62%)" : "transparent",
                          color: newSlotDay === d ? "white" : "hsl(38 23% 90% / 0.45)",
                          border: `1px solid ${newSlotDay === d ? "hsl(228 100% 62%)" : "hsl(0 0% 100% / 0.1)"}`,
                          fontSize: "9px",
                        }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="time"
                    value={newSlotTime}
                    onChange={(e) => setNewSlotTime(e.target.value)}
                    className="text-sm w-32"
                    style={{ background: "hsl(216 32% 7%)", borderColor: "hsl(0 0% 100% / 0.07)" }}
                  />
                  <Button onClick={handleAddSlot} disabled={addingSlot} className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]" style={{ background: "hsl(228 100% 62%)", color: "white" }}>
                    {addingSlot ? "Saving..." : "Save Slot"}
                  </Button>
                </div>
              )}
              {slots.length === 0 ? (
                <p className="text-sm" style={{ color: "hsl(38 23% 90% / 0.45)" }}>No availability slots set. Add slots so patients know when you're available.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.map((slot) => (
                    <div key={slot.id} className="flex items-center gap-1 px-3 py-2 rounded-pill mono-label" style={{
                      background: slot.is_active ? "hsl(228 100% 62% / 0.12)" : "hsl(0 0% 100% / 0.03)",
                      color: slot.is_active ? "hsl(228 100% 62%)" : "hsl(38 23% 90% / 0.3)",
                      border: `1px solid ${slot.is_active ? "hsl(228 100% 62% / 0.25)" : "hsl(0 0% 100% / 0.07)"}`,
                    }}>
                      <button onClick={() => handleToggleSlot(slot.id, slot.is_active)}>{slot.day_of_week} {slot.start_time}</button>
                      <button onClick={() => handleDeleteSlot(slot.id)} className="ml-1 opacity-50 hover:opacity-100"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Virtual Consult Link */}
            <div className="rounded-card p-6" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
              <span className="mono-label mb-3 block" style={{ color: "hsl(38 23% 90% / 0.45)" }}>VIRTUAL CONSULT LINK</span>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono px-3 py-2 rounded-tag flex-1 truncate" style={{ background: "hsl(0 0% 100% / 0.05)" }}>
                  {window.location.origin}/consult/{consultSlug}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/consult/${consultSlug}`);
                    toast({ title: "Link copied" });
                  }}
                  className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]"
                >
                  Copy
                </Button>
              </div>
            </div>

            {/* Practice Team */}
            <div className="rounded-card p-6" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
              <div className="flex items-center justify-between mb-4">
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>PRACTICE TEAM</span>
                <Button
                  size="sm"
                  onClick={() => setShowInviteModal(!showInviteModal)}
                  className="rounded-pill font-mono text-[9px] uppercase tracking-[0.15em]"
                  style={{ background: "hsl(228 100% 62%)", color: "white" }}
                >
                  Invite Member
                </Button>
              </div>
              {showInviteModal && (
                <div className="mb-4 p-4 rounded-tag space-y-3" style={{ background: "hsl(0 0% 100% / 0.03)" }}>
                  <Input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="team@example.com"
                    className="text-sm"
                    style={{ background: "hsl(216 32% 7%)", borderColor: "hsl(0 0% 100% / 0.07)" }}
                  />
                  <div className="flex gap-2">
                    {["staff", "hygienist", "admin"].map((r) => (
                      <button
                        key={r}
                        onClick={() => setInviteRole(r)}
                        className="px-3 py-1 rounded-pill mono-label transition"
                        style={{
                          background: inviteRole === r ? "hsl(228 100% 62%)" : "transparent",
                          color: inviteRole === r ? "white" : "hsl(38 23% 90% / 0.45)",
                          border: `1px solid ${inviteRole === r ? "hsl(228 100% 62%)" : "hsl(0 0% 100% / 0.1)"}`,
                        }}
                      >
                        {r.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <Button onClick={handleInvite} disabled={!inviteEmail.trim() || inviting} className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]" style={{ background: "hsl(228 100% 62%)", color: "white" }}>
                    {inviting ? "Sending..." : "Send Invite"}
                  </Button>
                </div>
              )}
              {teamInvites.length === 0 ? (
                <p className="text-sm" style={{ color: "hsl(38 23% 90% / 0.45)" }}>No team members invited yet.</p>
              ) : (
                <div className="space-y-2">
                  {teamInvites.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid hsl(0 0% 100% / 0.05)" }}>
                      <div>
                        <p className="text-sm">{inv.invited_email}</p>
                        <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{inv.role.toUpperCase()}</span>
                      </div>
                      <span
                        className="mono-label px-2 py-0.5 rounded-pill"
                        style={{
                          background: inv.accepted_at ? "hsl(142 71% 45% / 0.1)" : "hsl(43 50% 54% / 0.1)",
                          color: inv.accepted_at ? "hsl(142 71% 45%)" : "hsl(43 50% 54%)",
                        }}
                      >
                        {inv.accepted_at ? "ACCEPTED" : "PENDING"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subscription */}
            <div className="rounded-card p-6" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
              <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.45)" }}>SUBSCRIPTION</span>
              <div className="flex items-baseline justify-between mb-4">
                <h3 className="font-display text-xl font-semibold capitalize">{currentTier}</h3>
                <span className="mono-label px-2 py-0.5 rounded-pill" style={{ background: statusBadge.bg, color: statusBadge.color }}>
                  {statusBadge.label}
                </span>
              </div>
              {subscription?.current_period_end && (
                <p className="text-xs mb-3" style={{ color: "hsl(38 23% 90% / 0.45)" }}>
                  Next billing: {new Date(subscription.current_period_end).toLocaleDateString()}
                </p>
              )}
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>PATIENTS ENROLLED</span>
                  <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{patientCount} / {limit}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "hsl(0 0% 100% / 0.06)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (patientCount / limit) * 100)}%`, background: "hsl(228 100% 62%)" }} />
                </div>
              </div>

              <div className="mb-4 p-3 rounded-tag" style={{ background: "hsl(0 0% 100% / 0.03)" }}>
                <span className="mono-label mb-1 block" style={{ color: "hsl(38 23% 90% / 0.45)" }}>INCLUDED FEATURES</span>
                <p className="text-xs" style={{ color: "hsl(38 23% 90% / 0.6)" }}>{suiteFeatures[currentTier]?.[0] || suiteFeatures.starter[0]}</p>
              </div>

              <Button
                variant="outline"
                className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]"
                onClick={handleManageBilling}
              >
                Manage Billing
              </Button>
            </div>

            <div className="rounded-card p-6" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
              <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>NOTIFICATIONS</span>
              <p className="text-sm mt-1" style={{ color: "hsl(38 23% 90% / 0.45)" }}>Email notifications for new scans and flagged patients are enabled by default.</p>
            </div>

            {/* Danger zone */}
            <div className="rounded-card p-6" style={{ border: "1px solid hsl(0 84% 60% / 0.3)", background: "hsl(218 26% 11%)" }}>
              <span className="mono-label mb-2 block" style={{ color: "hsl(0 84% 60%)" }}>DANGER ZONE</span>
              <p className="text-sm mb-4" style={{ color: "hsl(38 23% 90% / 0.45)" }}>Deactivating your practice will suspend all patient access. This action can be reversed by contacting support.</p>
              <Button
                variant="outline"
                className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]"
                style={{ borderColor: "hsl(0 84% 60% / 0.3)", color: "hsl(0 84% 60%)" }}
                onClick={() => setShowDeactivateModal(true)}
              >
                Deactivate Practice
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Deactivation Confirmation Modal */}
      {showDeactivateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-card p-6 max-w-md w-full mx-4" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 84% 60% / 0.3)" }}>
            <div className="flex items-center justify-between mb-4">
              <span className="mono-label" style={{ color: "hsl(0 84% 60%)" }}>CONFIRM DEACTIVATION</span>
              <button onClick={() => { setShowDeactivateModal(false); setDeactivateConfirm(""); }}>
                <X className="w-4 h-4" style={{ color: "hsl(38 23% 90% / 0.5)" }} />
              </button>
            </div>
            <p className="text-sm mb-4" style={{ color: "hsl(38 23% 90% / 0.7)" }}>
              This will suspend your practice and sign you out. Type <strong>DEACTIVATE</strong> to confirm.
            </p>
            <Input
              value={deactivateConfirm}
              onChange={(e) => setDeactivateConfirm(e.target.value)}
              placeholder="Type DEACTIVATE"
              className="mb-4 text-sm"
              style={{ background: "hsl(216 32% 7%)", borderColor: "hsl(0 84% 60% / 0.3)" }}
            />
            <Button
              onClick={handleDeactivate}
              disabled={deactivateConfirm !== "DEACTIVATE" || deactivating}
              className="w-full rounded-pill font-mono text-xs uppercase tracking-[0.15em]"
              style={{ background: "hsl(0 84% 60%)", color: "white" }}
            >
              {deactivating ? "Deactivating..." : "Confirm Deactivation"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
