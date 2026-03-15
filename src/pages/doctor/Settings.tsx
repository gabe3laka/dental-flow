import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Plus } from "lucide-react";
import { logError } from "@/lib/logger";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const inviteSchema = z.object({
  inviteEmail: z.string().email("Enter a valid email"),
});

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
  const [inviteRole, setInviteRole] = useState("staff");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviting, setInviting] = useState(false);

  const inviteForm = useForm<{ inviteEmail: string }>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { inviteEmail: "" },
  });
  const [addingSlot, setAddingSlot] = useState(false);
  const [savingSpecialty, setSavingSpecialty] = useState(false);

  const [slots, setSlots] = useState<any[]>([]);
  const [newSlotDay, setNewSlotDay] = useState("MON");
  const [newSlotTime, setNewSlotTime] = useState("09:00");
  const [showAddSlot, setShowAddSlot] = useState(false);

  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState("");
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [profileResult, subResult, patientsResult, invitesResult, slotsResult] = await Promise.allSettled([
          supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
          supabase.from("subscriptions").select("*").eq("doctor_id", user.id).maybeSingle(),
          supabase.from("patients").select("id", { count: "exact", head: true }).eq("assigned_doctor_id", user.id),
          supabase.from("team_invites").select("*").eq("practice_id", user.id).order("invited_at", { ascending: false }),
          supabase.from("doctor_availability" as any).select("*").eq("doctor_id", user.id).order("created_at", { ascending: true }),
        ]);
        if (profileResult.status === "rejected") logError(profileResult.reason, { operation: "Settings/fetchProfile", userId: user?.id });
        if (subResult.status === "rejected") logError(subResult.reason, { operation: "Settings/fetchSubscription", userId: user?.id });
        if (patientsResult.status === "rejected") logError(patientsResult.reason, { operation: "Settings/fetchPatientCount", userId: user?.id });
        if (invitesResult.status === "rejected") logError(invitesResult.reason, { operation: "Settings/fetchInvites", userId: user?.id });
        if (slotsResult.status === "rejected") logError(slotsResult.reason, { operation: "Settings/fetchSlots", userId: user?.id });
        const profileData = profileResult.status === "fulfilled" ? profileResult.value.data : null;
        const subData = subResult.status === "fulfilled" ? subResult.value.data : null;
        const patientsData = patientsResult.status === "fulfilled" ? patientsResult.value : null;
        const invitesData = invitesResult.status === "fulfilled" ? invitesResult.value.data : null;
        const slotsData = slotsResult.status === "fulfilled" ? slotsResult.value.data : null;
        setProfile(profileData);
        setSubscription(subData);
        setPatientCount(patientsData?.count || 0);
        setSpecialtyValue(profileData?.specialty || "");
        setTeamInvites(invitesData || []);
        setSlots((slotsData as any[]) || []);
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

  const handleInvite = inviteForm.handleSubmit(async (values) => {
    if (!user || inviting) return;
    setInviting(true);
    try {
      const { error } = await supabase.from("team_invites").insert({
        practice_id: user.id,
        invited_email: values.inviteEmail.trim(),
        role: inviteRole,
      });
      if (error) throw error;
      setTeamInvites([{ id: crypto.randomUUID(), practice_id: user.id, invited_email: values.inviteEmail.trim(), role: inviteRole, invited_at: new Date().toISOString(), accepted_at: null }, ...teamInvites]);
      inviteForm.reset();
      setShowInviteModal(false);
      toast({ title: "Invite sent" });
    } catch (e: any) {
      logError(e, { operation: "Settings.handleInvite", userId: user?.id });
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  });

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
    if (!subscription) return { label: "FREE TIER", classes: "text-muted-foreground bg-muted" };
    switch (subscription.status) {
      case "active": return { label: "ACTIVE", classes: "text-status-success bg-status-success/10" };
      case "trialing": return { label: "TRIAL", classes: "text-gold bg-gold/10" };
      case "past_due": return { label: "PAST DUE", classes: "text-destructive bg-destructive/10" };
      case "canceled": return { label: "CANCELED", classes: "text-muted-foreground bg-muted" };
      default: return { label: "FREE TIER", classes: "text-muted-foreground bg-muted" };
    }
  }

  const statusBadge = getStatusBadge();

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <span className="mono-label text-muted-foreground">SETTINGS</span>
        <h1 className="font-display text-3xl font-semibold mt-1 mb-8">Practice Profile</h1>

        {!loading && profile && !profile.practice_setup_completed && (
          <div className="rounded-md p-4 mb-6 flex items-start gap-3 bg-gold/10 border border-gold/20">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-gold" />
            <div>
              <p className="text-[13px] text-gold">
                Your practice profile is incomplete. Complete setup to unlock all features.
              </p>
              <button
                onClick={() => navigate("/doctor/setup")}
                className="mono-label mt-2 hover:underline text-gold"
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
            <div className="rounded-card p-6 space-y-4 bg-card border border-border">
              <div>
                <span className="mono-label text-muted-foreground">ACCOUNT EMAIL</span>
                <p className="text-sm mt-1">{user?.email}</p>
              </div>
              <div>
                <span className="mono-label text-muted-foreground">DISPLAY NAME</span>
                <p className="text-sm mt-1">{user?.user_metadata?.full_name || "—"}</p>
              </div>
              <div>
                <span className="mono-label text-muted-foreground">SPECIALTY</span>
                {editingSpecialty ? (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {SPECIALTY_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => saveSpecialty(opt)}
                        disabled={savingSpecialty}
                        className={cn(
                          "px-3 py-1.5 rounded-pill mono-label transition border",
                          specialtyValue === opt
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-transparent text-foreground/60 border-border hover:border-primary/30"
                        )}
                      >
                        {opt.toUpperCase()}
                      </button>
                    ))}
                    <button onClick={() => setEditingSpecialty(false)} className="mono-label px-3 py-1.5 text-muted-foreground">CANCEL</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <p className={cn("text-sm", !profile?.specialty && "text-foreground/30")}>
                      {profile?.specialty || "Not set"}
                    </p>
                    <button onClick={() => setEditingSpecialty(true)} className="mono-label text-primary">EDIT</button>
                  </div>
                )}
              </div>
              <div>
                <span className="mono-label text-muted-foreground">PRACTICE NAME</span>
                <p className="text-sm mt-1">{profile?.practice_name || "—"}</p>
              </div>
            </div>

            {/* Practice Logo */}
            <div className="rounded-card p-6 bg-card border border-border">
              <span className="mono-label mb-3 block text-muted-foreground">PRACTICE LOGO</span>
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              <Button
                variant="outline"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                className="rounded-pill mono-label"
              >
                {uploadingLogo ? "Uploading..." : "Upload Logo"}
              </Button>
            </div>

            {/* Availability */}
            <div className="rounded-card p-6 bg-card border border-border">
              <div className="flex items-center justify-between mb-4">
                <span className="mono-label text-muted-foreground">AVAILABILITY</span>
                <Button
                  size="sm"
                  onClick={() => setShowAddSlot(!showAddSlot)}
                  className="rounded-pill mono-label gap-1 bg-primary text-primary-foreground"
                >
                  <Plus className="w-3 h-3" /> Add Slot
                </Button>
              </div>
              {showAddSlot && (
                <div className="mb-4 p-4 rounded-tag space-y-3 bg-white/[0.03]">
                  <div className="flex gap-2">
                    {DAYS_OF_WEEK.map((d) => (
                      <button
                        key={d}
                        onClick={() => setNewSlotDay(d)}
                        className={cn(
                          "px-2 py-1 rounded-pill mono-label transition border",
                          newSlotDay === d
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-transparent text-muted-foreground border-border"
                        )}
                        style={{ fontSize: "9px" }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="time"
                    value={newSlotTime}
                    onChange={(e) => setNewSlotTime(e.target.value)}
                    className="text-sm w-32 bg-background border-border"
                  />
                  <Button onClick={handleAddSlot} disabled={addingSlot} className="rounded-pill mono-label bg-primary text-primary-foreground">
                    {addingSlot ? "Saving..." : "Save Slot"}
                  </Button>
                </div>
              )}
              {slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">No availability slots set. Add slots so patients know when you're available.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.map((slot) => (
                    <div key={slot.id} className={cn(
                      "flex items-center gap-1 px-3 py-2 rounded-pill mono-label border",
                      slot.is_active
                        ? "bg-primary/[0.12] text-primary border-primary/25"
                        : "bg-white/[0.03] text-foreground/30 border-border"
                    )}>
                      <button onClick={() => handleToggleSlot(slot.id, slot.is_active)}>{slot.day_of_week} {slot.start_time}</button>
                      <button onClick={() => handleDeleteSlot(slot.id)} className="ml-1 opacity-50 hover:opacity-100">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Virtual Consult Link */}
            <div className="rounded-card p-6 bg-card border border-border">
              <span className="mono-label mb-3 block text-muted-foreground">VIRTUAL CONSULT LINK</span>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono px-3 py-2 rounded-tag flex-1 truncate bg-muted">
                  {window.location.origin}/consult/{consultSlug}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/consult/${consultSlug}`);
                    toast({ title: "Link copied" });
                  }}
                  className="rounded-pill mono-label"
                >
                  Copy
                </Button>
              </div>
            </div>

            {/* Practice Team */}
            <div className="rounded-card p-6 bg-card border border-border">
              <div className="flex items-center justify-between mb-4">
                <span className="mono-label text-muted-foreground">PRACTICE TEAM</span>
                <Button
                  size="sm"
                  onClick={() => setShowInviteModal(!showInviteModal)}
                  className="rounded-pill mono-label bg-primary text-primary-foreground"
                >
                  Invite Member
                </Button>
              </div>
              {showInviteModal && (
                <div className="mb-4 p-4 rounded-tag space-y-3 bg-white/[0.03]">
                  <Form {...inviteForm}>
                    <form onSubmit={handleInvite} className="space-y-3">
                      <FormField
                        control={inviteForm.control}
                        name="inviteEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                placeholder="team@example.com"
                                className="text-sm bg-background border-border"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex gap-2">
                        {["staff", "hygienist", "admin"].map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setInviteRole(r)}
                            className={cn(
                              "px-3 py-1 rounded-pill mono-label transition border",
                              inviteRole === r
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-transparent text-muted-foreground border-border"
                            )}
                          >
                            {r.toUpperCase()}
                          </button>
                        ))}
                      </div>
                      <Button type="submit" disabled={inviting} className="rounded-pill mono-label bg-primary text-primary-foreground">
                        {inviting ? "Sending..." : "Send Invite"}
                      </Button>
                    </form>
                  </Form>
                </div>
              )}
              {teamInvites.length === 0 ? (
                <p className="text-sm text-muted-foreground">No team members invited yet.</p>
              ) : (
                <div className="space-y-2">
                  {teamInvites.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between py-2 border-b border-white/5">
                      <div>
                        <p className="text-sm">{inv.invited_email}</p>
                        <span className="mono-label text-muted-foreground">{inv.role.toUpperCase()}</span>
                      </div>
                      <span className={cn(
                        "mono-label px-2 py-0.5 rounded-pill",
                        inv.accepted_at
                          ? "bg-status-success/10 text-status-success"
                          : "bg-gold/10 text-gold"
                      )}>
                        {inv.accepted_at ? "ACCEPTED" : "PENDING"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subscription */}
            <div className="rounded-card p-6 bg-card border border-border">
              <span className="mono-label mb-4 block text-muted-foreground">SUBSCRIPTION</span>
              <div className="flex items-baseline justify-between mb-4">
                <h3 className="font-display text-xl font-semibold capitalize">{currentTier}</h3>
                <span className={cn("mono-label px-2 py-0.5 rounded-pill", statusBadge.classes)}>
                  {statusBadge.label}
                </span>
              </div>
              {subscription?.current_period_end && (
                <p className="text-xs mb-3 text-muted-foreground">
                  Next billing: {new Date(subscription.current_period_end).toLocaleDateString()}
                </p>
              )}
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="mono-label text-muted-foreground">PATIENTS ENROLLED</span>
                  <span className="mono-label text-muted-foreground">{patientCount} / {limit}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-muted">
                  <div className="h-full rounded-full transition-all bg-primary" style={{ width: `${Math.min(100, (patientCount / limit) * 100)}%` }} />
                </div>
              </div>

              <div className="mb-4 p-3 rounded-tag bg-white/[0.03]">
                <span className="mono-label mb-1 block text-muted-foreground">INCLUDED FEATURES</span>
                <p className="text-xs text-foreground/60">{suiteFeatures[currentTier]?.[0] || suiteFeatures.starter[0]}</p>
              </div>

              <Button
                variant="outline"
                className="rounded-pill mono-label"
                onClick={handleManageBilling}
              >
                Manage Billing
              </Button>
            </div>

            <div className="rounded-card p-6 bg-card border border-border">
              <span className="mono-label text-muted-foreground">NOTIFICATIONS</span>
              <p className="text-sm mt-1 text-muted-foreground">Email notifications for new scans and flagged patients are enabled by default.</p>
            </div>

            {/* Danger zone */}
            <div className="rounded-card p-6 border border-destructive/30 bg-card">
              <span className="mono-label mb-2 block text-destructive">DANGER ZONE</span>
              <p className="text-sm mb-4 text-muted-foreground">Deactivating your practice will suspend all patient access. This action can be reversed by contacting support.</p>
              <Button
                variant="outline"
                className="rounded-pill mono-label border-destructive/30 text-destructive"
                onClick={() => setShowDeactivateModal(true)}
              >
                Deactivate Practice
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Deactivation Confirmation Dialog */}
      <Dialog open={showDeactivateModal} onOpenChange={(open) => { setShowDeactivateModal(open); if (!open) setDeactivateConfirm(""); }}>
        <DialogContent className="bg-card border-destructive/30">
          <DialogHeader>
            <DialogTitle className="mono-label text-destructive">CONFIRM DEACTIVATION</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground/70">
            This will suspend your practice and sign you out. Type <strong>DEACTIVATE</strong> to confirm.
          </p>
          <Input
            value={deactivateConfirm}
            onChange={(e) => setDeactivateConfirm(e.target.value)}
            placeholder="Type DEACTIVATE"
            className="text-sm bg-background border-destructive/30"
          />
          <Button
            onClick={handleDeactivate}
            disabled={deactivateConfirm !== "DEACTIVATE" || deactivating}
            className="w-full rounded-pill mono-label bg-destructive text-destructive-foreground"
          >
            {deactivating ? "Deactivating..." : "Confirm Deactivation"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
