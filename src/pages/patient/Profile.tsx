import { useAuth } from "@/hooks/use-auth";
import { usePatientData } from "@/hooks/use-patient-data";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { differenceInDays, format } from "date-fns";
import { logError } from "@/lib/logger";

const TREATMENT_CATEGORIES = [
  { value: "alignment", label: "Alignment" },
  { value: "whitening", label: "Whitening" },
  { value: "post_surgery", label: "Post-Surgery" },
  { value: "retainer", label: "Retainer" },
  { value: "periodontal", label: "Periodontal" },
  { value: "general", label: "General Monitoring" },
];

const NOTIFICATION_PREFS = [
  { key: "checkin_reminders", label: "Check-in reminders", defaultValue: true },
  { key: "doctor_messages", label: "Doctor messages", defaultValue: true },
  { key: "scan_results", label: "Scan results", defaultValue: true },
  { key: "treatment_updates", label: "Treatment updates", defaultValue: false },
];

function formatStreak(streak: number) {
  if (streak === 0) return "0 scans submitted";
  if (streak < 5) return `${streak} 🔥`;
  return `${streak} 🔥🔥`;
}

function generatePairingCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  const code = Array.from(arr).map((b) => chars[b % chars.length]).join("");
  return `ARC-${code.slice(0, 4)}-${code.slice(4, 6)}`;
}

export default function PatientProfile() {
  const { user, signOut } = useAuth();
  const { data, loading } = usePatientData();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState<{ name: string; specialty: string } | null>(null);
  const [treatmentCategory, setTreatmentCategory] = useState<string | null>(null);
  const [patientExtra, setPatientExtra] = useState<{
    device_linked: boolean;
    start_date: string | null;
    estimated_end_date: string | null;
    pairing_code: string | null;
  } | null>(null);
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [pairingCode, setPairingCode] = useState<string>("");
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: patient } = await supabase.from("patients").select("assigned_doctor_id, treatment_category, device_linked, start_date, estimated_end_date, pairing_code").eq("user_id", user.id).maybeSingle();
      if (!patient) {
        logError("Patient record not found", { operation: "Profile/loadData", userId: user?.id });
        return;
      }
      if (patient?.treatment_category) setTreatmentCategory(patient.treatment_category);
      setPatientExtra({
        device_linked: (patient as any)?.device_linked || false,
        start_date: patient?.start_date || null,
        estimated_end_date: patient?.estimated_end_date || null,
        pairing_code: (patient as any)?.pairing_code || null,
      });
      if ((patient as any)?.pairing_code) setPairingCode((patient as any).pairing_code);
      if (patient?.assigned_doctor_id) {
        const { data: profile } = await supabase.from("profiles").select("full_name, specialty").eq("user_id", patient.assigned_doctor_id).maybeSingle();
        if (profile) setDoctor({ name: profile.full_name || "Doctor", specialty: profile.specialty || "—" });
      }

      const { data: prefs } = await supabase.from("user_preferences" as any).select("pref_key, pref_value").eq("user_id", user.id);
      const prefsMap: Record<string, boolean> = {};
      NOTIFICATION_PREFS.forEach((p) => { prefsMap[p.key] = p.defaultValue; });
      if (prefs) {
        (prefs as any[]).forEach((p: any) => { prefsMap[p.pref_key] = p.pref_value; });
      }
      setNotifPrefs(prefsMap);
      setPrefsLoaded(true);
    })();
  }, [user]);

  const handleTogglePref = useCallback(async (key: string, value: boolean) => {
    if (!user) return;
    setNotifPrefs((prev) => ({ ...prev, [key]: value }));
    await supabase.from("user_preferences" as any).upsert(
      { user_id: user.id, pref_key: key, pref_value: value, updated_at: new Date().toISOString() } as any,
      { onConflict: "user_id,pref_key" }
    );
  }, [user]);

  const handleCategoryUpdate = async (value: string) => {
    if (!user) return;
    await supabase.from("patients").update({ treatment_category: value }).eq("user_id", user.id);
    setTreatmentCategory(value);
    setShowCategoryModal(false);
    toast({ title: "Treatment category updated" });
  };

  const handleOpenPairing = () => {
    if (patientExtra?.pairing_code) {
      setPairingCode(patientExtra.pairing_code);
    } else {
      setPairingCode(generatePairingCode());
    }
    setShowPairingModal(true);
  };

  const handlePairingDone = async () => {
    if (!user) return;
    await supabase.from("patients").update({ pairing_code: pairingCode, device_linked: true, device_paired_at: new Date().toISOString() } as any).eq("user_id", user.id);
    setPatientExtra((prev) => prev ? { ...prev, device_linked: true, pairing_code: pairingCode } : prev);
    setShowPairingModal(false);
    toast({ title: "Device paired", description: `Code: ${pairingCode}` });
  };

  const handleUnlink = async () => {
    if (!user) return;
    await supabase.from("patients").update({ pairing_code: null, device_linked: false, device_paired_at: null } as any).eq("user_id", user.id);
    setPatientExtra((prev) => prev ? { ...prev, device_linked: false, pairing_code: null } : prev);
    setPairingCode("");
    toast({ title: "Device unlinked" });
  };

  const startDate = patientExtra?.start_date ? new Date(patientExtra.start_date) : null;
  const endDate = patientExtra?.estimated_end_date ? new Date(patientExtra.estimated_end_date) : null;
  const daysElapsed = startDate ? differenceInDays(new Date(), startDate) : 0;
  const daysRemaining = endDate ? Math.max(0, differenceInDays(endDate, new Date())) : 0;
  const totalDays = startDate && endDate ? differenceInDays(endDate, startDate) : 1;
  const timelinePercent = totalDays > 0 ? Math.min(100, Math.round((daysElapsed / totalDays) * 100)) : 0;

  const hasStarted = data?.hasStarted;

  return (
    <div className="min-h-screen bg-background px-5 py-8 max-w-[480px] mx-auto pb-24">
      <span className="mono-label text-muted-foreground">PROFILE</span>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-8">Your Account</h1>

      <div className="space-y-4">
        {/* Personal Info — consolidated */}
        <div className="bg-card rounded-card border border-border p-5 space-y-3">
          <div>
            <span className="mono-label text-muted-foreground">NAME</span>
            <p className="text-sm mt-1">{user?.user_metadata?.full_name || "—"}</p>
          </div>
          <div className="border-t border-border pt-3">
            <span className="mono-label text-muted-foreground">EMAIL</span>
            <p className="text-sm mt-1">{user?.email}</p>
          </div>
        </div>

        {/* Doctor card */}
        {doctor && (
          <div className="bg-card rounded-card border border-border p-5">
            <span className="mono-label text-muted-foreground mb-2 block">YOUR DOCTOR</span>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{doctor.name}</p>
                <span className="mono-label text-primary">{doctor.specialty.toUpperCase()}</span>
              </div>
              <button onClick={() => navigate("/patient/doctor")} className="mono-label text-primary hover:underline">
                VIEW PROFILE
              </button>
            </div>
          </div>
        )}

        {/* Device Management */}
        <div className="bg-card rounded-card border border-border p-5">
          <span className="mono-label text-muted-foreground mb-3 block">LINKED DEVICE</span>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-card bg-muted flex items-center justify-center">
                <span className="text-lg">📱</span>
              </div>
              <div>
                <p className="text-sm font-medium">Arcline Scope</p>
                <span className={`mono-label ${patientExtra?.device_linked ? "text-status-success" : "text-muted-foreground"}`}>
                  {patientExtra?.device_linked ? "LINKED" : "NOT LINKED"}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              {patientExtra?.device_linked && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleUnlink}
                  className="rounded-pill mono-label text-destructive"
                >
                  Unlink
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenPairing}
                className="rounded-pill mono-label"
              >
                {patientExtra?.device_linked ? "View Code" : "Link Device"}
              </Button>
            </div>
          </div>
        </div>

        {/* Pairing Modal — Dialog */}
        <Dialog open={showPairingModal} onOpenChange={setShowPairingModal}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="mono-label text-primary">PAIRING CODE</DialogTitle>
            </DialogHeader>
            <p className="font-mono text-2xl font-bold text-center py-4 tracking-widest">{pairingCode}</p>
            <p className="text-xs text-muted-foreground text-center mb-4">Enter this code on your Arcline Scope device to pair.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePairingDone}
              className="w-full rounded-pill mono-label"
            >
              {patientExtra?.device_linked ? "Close" : "Done"}
            </Button>
          </DialogContent>
        </Dialog>

        {/* Treatment Timeline */}
        {startDate && (
          <div className="bg-card rounded-card border border-border p-5">
            <span className="mono-label text-muted-foreground mb-3 block">TREATMENT TIMELINE</span>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <span className="mono-label text-muted-foreground">START DATE</span>
                <p className="text-sm mt-0.5">{format(startDate, "dd MMM yyyy")}</p>
              </div>
              {endDate && (
                <div>
                  <span className="mono-label text-muted-foreground">EST. COMPLETION</span>
                  <p className="text-sm mt-0.5">{format(endDate, "dd MMM yyyy")}</p>
                </div>
              )}
              <div>
                <span className="mono-label text-muted-foreground">DAYS ELAPSED</span>
                <p className="text-sm mt-0.5 font-mono">{daysElapsed}</p>
              </div>
              {endDate && (
                <div>
                  <span className="mono-label text-muted-foreground">DAYS REMAINING</span>
                  <p className="text-sm mt-0.5 font-mono">{daysRemaining}</p>
                </div>
              )}
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${timelinePercent}%` }} />
            </div>
          </div>
        )}

        {loading ? (
          <Skeleton className="h-24 rounded-card" />
        ) : (
          <div className="bg-card rounded-card border border-border p-5 space-y-4">
            <div>
              <span className="mono-label text-muted-foreground">TREATMENT TYPE</span>
              <p className="text-sm mt-1">{data?.treatmentType || "—"}</p>
            </div>
            <div>
              <span className="mono-label text-muted-foreground">TREATMENT CATEGORY</span>
              {treatmentCategory ? (
                <p className="text-sm mt-1">{treatmentCategory}</p>
              ) : (
                <button
                  onClick={() => setShowCategoryModal(true)}
                  className="text-sm mt-1 block text-primary"
                >
                  Not set — tap to update
                </button>
              )}
            </div>
            <div>
              <span className="mono-label text-muted-foreground">PROGRESS</span>
              {hasStarted ? (
                <p className="text-sm mt-1">{data?.progressPercent ?? 0}%</p>
              ) : (
                <p className="text-sm mt-1 italic text-muted-foreground">Progress will update as your treatment begins</p>
              )}
            </div>
            <div>
              <span className="mono-label text-muted-foreground">SCAN STREAK</span>
              <p className="text-sm mt-1">{formatStreak(data?.complianceStreak ?? 0)}</p>
            </div>
          </div>
        )}

        {/* Treatment Category Modal — Dialog */}
        <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="mono-label text-primary">SELECT TREATMENT CATEGORY</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {TREATMENT_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => handleCategoryUpdate(cat.value)}
                  className="w-full text-left px-4 py-3 rounded-tag text-sm font-body transition hover:bg-primary/10 border border-border"
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Notification toggles */}
        <div className="bg-card rounded-card border border-border p-5 space-y-4">
          <span className="mono-label text-muted-foreground">NOTIFICATIONS</span>
          {NOTIFICATION_PREFS.map((n) => (
            <div key={n.key} className="flex items-center justify-between">
              <span className="text-sm font-body">{n.label}</span>
              <Switch
                checked={prefsLoaded ? (notifPrefs[n.key] ?? n.defaultValue) : n.defaultValue}
                onCheckedChange={(checked) => handleTogglePref(n.key, checked)}
                disabled={!prefsLoaded}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <Button variant="outline" onClick={signOut} className="w-full rounded-pill mono-label">
          Sign Out
        </Button>
      </div>

      <PatientBottomNav />
    </div>
  );
}
