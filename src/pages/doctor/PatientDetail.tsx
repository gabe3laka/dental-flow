import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PillNav } from "@/components/ui/pill-nav";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToothArch } from "@/components/patient/ToothArch";
import { DoctorChat } from "@/components/doctor/DoctorChat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp, Send, Camera, X } from "lucide-react";
import { logError } from "@/lib/logger";

function BillingTab({ patient, doctorId }: { patient: any; doctorId?: string }) {
  const [subscription, setSubscription] = useState<any>(null);
  const [practiceName, setPracticeName] = useState<string>("—");
  const [estimatedCost, setEstimatedCost] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!patient?.assigned_doctor_id) { setLoaded(true); return; }
    (async () => {
      const [subRes, profileRes] = await Promise.all([
        supabase.from("subscriptions").select("plan_tier, status").eq("doctor_id", patient.assigned_doctor_id).maybeSingle(),
        supabase.from("profiles").select("practice_name").eq("user_id", patient.assigned_doctor_id).maybeSingle(),
      ]);
      setSubscription(subRes.data);
      setPracticeName(profileRes.data?.practice_name || "—");
      setEstimatedCost(patient.estimated_cost?.toString() || "");
      setLoaded(true);
    })();
  }, [patient]);

  const handleSaveCost = async () => {
    setSaving(true);
    await supabase.from("patients").update({ estimated_cost: estimatedCost ? parseFloat(estimatedCost) : null } as any).eq("id", patient.id);
    setSaving(false);
    toast({ title: "Cost estimate saved" });
  };

  if (!loaded) return <Skeleton className="h-48 rounded-card" />;

  return (
    <div className="space-y-4">
      <div className="rounded-card p-5" style={{ background: "hsl(220 24% 16%)" }}>
        <span className="mono-label mb-3 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>PRACTICE BILLING</span>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>PRACTICE</span>
            <span className="text-sm" style={{ color: "hsl(38 23% 90%)" }}>{practiceName}</span>
          </div>
          <div className="flex justify-between">
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>PLAN TIER</span>
            <span className="mono-label px-2 py-0.5 rounded-pill" style={{ background: "hsl(228 100% 62% / 0.1)", color: "hsl(228 100% 62%)" }}>
              {subscription?.plan_tier?.toUpperCase() || "FREE"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>STATUS</span>
            <span className="text-sm" style={{ color: "hsl(142 71% 45%)" }}>{subscription?.status?.toUpperCase() || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>PAYMENT</span>
            <span className="text-sm" style={{ color: "hsl(38 23% 90% / 0.7)" }}>Managed by your practice</span>
          </div>
        </div>
      </div>

      <div className="rounded-card p-5" style={{ background: "hsl(220 24% 16%)" }}>
        <span className="mono-label mb-3 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>TREATMENT COST ESTIMATE</span>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: "hsl(38 23% 90% / 0.5)" }}>$</span>
          <Input
            type="number"
            value={estimatedCost}
            onChange={(e) => setEstimatedCost(e.target.value)}
            placeholder="0.00"
            className="flex-1 text-sm"
            style={{ background: "hsl(216 32% 7%)", borderColor: "hsl(0 0% 100% / 0.07)", color: "hsl(38 23% 90%)" }}
          />
          <Button onClick={handleSaveCost} disabled={saving} size="sm" className="rounded-pill font-mono text-[9px] uppercase tracking-[0.15em]" style={{ background: "hsl(228 100% 62%)", color: "white" }}>
            {saving ? "..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="rounded-card p-5 text-center" style={{ background: "hsl(220 24% 16%)", border: "1px dashed hsl(0 0% 100% / 0.07)" }}>
        <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.2)" }}>STRIPE CHECKOUT</span>
        <p className="text-xs mt-2" style={{ color: "hsl(38 23% 90% / 0.35)" }}>Full patient billing & checkout coming soon.</p>
      </div>
    </div>
  );
}

const detailTabs = [
  { id: "overview", label: "OVERVIEW" },
  { id: "scans", label: "SCANS" },
  { id: "progress", label: "PROGRESS" },
  { id: "chat", label: "CHAT" },
  { id: "notes", label: "NOTES" },
  { id: "billing", label: "BILLING" },
];

export default function PatientDetail() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [patient, setPatient] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [scans, setScans] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [referOpen, setReferOpen] = useState(false);
  const [referReason, setReferReason] = useState("");
  const [referUrgency, setReferUrgency] = useState("routine");
  const [referring, setReferring] = useState(false);
  const [chairsideOpen, setChairsideOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [selectedScans, setSelectedScans] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!patientId) return;
    (async () => {
      try {
        const { data: p } = await supabase
          .from("patients")
          .select("*")
          .eq("id", patientId)
          .maybeSingle();
        if (!p) {
          logError("Patient record not found", { operation: "PatientDetail/loadData", userId: user?.id });
          setLoading(false);
          return;
        }
        setPatient(p);

        if (p) {
          const [profileRes, scansRes] = await Promise.all([
            supabase.from("profiles").select("*").eq("user_id", p.user_id).maybeSingle(),
            supabase.from("scans").select("*").eq("patient_id", p.id).order("submitted_at", { ascending: false }).limit(9),
          ]);
          setProfile(profileRes.data);
          setScans(scansRes.data || []);
          setNotes(p.notes || "");
        }
      } catch (e) {
        logError(e, { operation: "PatientDetail.loadData", userId: user?.id });
      } finally {
        setLoading(false);
      }
    })();
  }, [patientId]);

  if (loading) {
    return (
      <div className="min-h-screen p-6" style={{ background: "hsl(216 32% 7%)" }}>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(216 32% 7%)", color: "hsl(38 23% 90%)" }}>
        <p>Patient not found.</p>
      </div>
    );
  }

  const progress = patient.total_stages ? Math.round((patient.current_stage / patient.total_stages) * 100) : 0;
  const initials = (profile?.full_name || "?").split(" ").map((n: string) => n[0]).join("");

  const sidebarContent = (
    <>
      <div className="flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center font-mono text-sm" style={{ background: "hsl(220 24% 16%)" }}>
          {initials}
        </div>
        <h2 className="font-display text-lg font-medium" style={{ color: "hsl(38 23% 90%)" }}>{profile?.full_name || "Unknown"}</h2>
        {patient.treatment_type && (
          <span className="mono-label px-3 py-1 rounded-pill" style={{ background: "hsl(228 100% 62% / 0.15)", color: "hsl(228 100% 62%)" }}>
            {patient.treatment_type?.toUpperCase()}
          </span>
        )}
        {patient.treatment_category && (
          <span className="mono-label px-3 py-1 rounded-pill mt-1" style={{ background: "hsl(43 50% 54% / 0.15)", color: "hsl(43 50% 54%)" }}>
            {patient.treatment_category?.toUpperCase()}
          </span>
        )}
      </div>
      <div className="space-y-3 mt-4">
        {patient.start_date && (
          <div>
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>STARTED</span>
            <p className="font-mono text-xs mt-0.5" style={{ color: "hsl(38 23% 90%)" }}>{format(new Date(patient.start_date), "dd MMM yyyy").toUpperCase()}</p>
          </div>
        )}
        {patient.estimated_end_date && (
          <div>
            <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>EST. COMPLETION</span>
            <p className="font-mono text-xs mt-0.5" style={{ color: "hsl(38 23% 90%)" }}>{format(new Date(patient.estimated_end_date), "MMM yyyy").toUpperCase()}</p>
          </div>
        )}
        <div>
          <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>STAGE</span>
          <p className="font-mono text-xs mt-0.5" style={{ color: "hsl(38 23% 90%)" }}>{patient.current_stage} OF {patient.total_stages}</p>
        </div>
        <div>
          <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>STREAK</span>
          <p className="font-mono text-xs mt-0.5" style={{ color: "hsl(38 23% 90%)" }}>🔥 {patient.compliance_streak || 0} DAYS</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 mt-6">
        <Button
          onClick={() => setReferOpen(true)}
          variant="outline"
          className="w-full rounded-pill font-mono text-[9px] uppercase tracking-[0.15em] h-8 gap-1.5"
          style={{ borderColor: "hsl(43 50% 54% / 0.3)", color: "hsl(43 50% 54%)" }}
        >
          <Send className="w-3 h-3" /> Refer Patient
        </Button>
        <Button
          onClick={() => setChairsideOpen(true)}
          variant="outline"
          className="w-full rounded-pill font-mono text-[9px] uppercase tracking-[0.15em] h-8 gap-1.5"
          style={{ borderColor: "hsl(228 100% 62% / 0.3)", color: "hsl(228 100% 62%)" }}
        >
          <Camera className="w-3 h-3" /> Chairside Scan
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: "hsl(216 32% 7%)", color: "hsl(38 23% 90%)" }}>
      {/* Mobile patient header */}
      <div className="lg:hidden border-b" style={{ background: "hsl(218 26% 11%)", borderColor: "hsl(0 0% 100% / 0.07)" }}>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/doctor")} className="mono-label text-muted-foreground hover:text-foreground transition-colors">
              ← BACK
            </button>
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs" style={{ background: "hsl(220 24% 16%)" }}>
              {initials}
            </div>
            <span className="font-display text-sm font-medium">{profile?.full_name || "Unknown"}</span>
          </div>
          <button onClick={() => setInfoOpen(!infoOpen)} style={{ color: "hsl(38 23% 90% / 0.5)" }}>
            {infoOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
        {infoOpen && (
          <div className="px-4 pb-4">
            {sidebarContent}
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <aside className="w-60 p-6 flex-col gap-4 border-r hidden lg:flex" style={{ background: "hsl(218 26% 11%)", borderColor: "hsl(0 0% 100% / 0.07)" }}>
        <button onClick={() => navigate("/doctor")} className="mono-label text-muted-foreground hover:text-foreground transition-colors text-left mb-2">
          ← BACK
        </button>
        {sidebarContent}
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col">
        <div className="p-4 md:p-6 border-b overflow-x-auto" style={{ borderColor: "hsl(0 0% 100% / 0.06)" }}>
          <PillNav tabs={detailTabs} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-6">
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div>
                <span className="mono-label mb-3 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>RECENT SCANS</span>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {scans.slice(0, 9).map((s) => (
                    <div
                      key={s.id}
                      className="aspect-square rounded-card flex items-center justify-center relative cursor-pointer hover:opacity-80 transition"
                      style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}
                      onClick={() => navigate(`/doctor/scans/${s.id}`)}
                    >
                      <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.2)" }}>SCAN</span>
                      <div className="absolute bottom-2 left-2">
                        <StatusBadge variant={s.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-card p-5" style={{ background: "hsl(220 24% 16%)" }}>
                <span className="mono-label mb-2 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>AI SUMMARY</span>
                <p className="text-sm font-body" style={{ color: "hsl(38 23% 90% / 0.7)" }}>
                  Patient is {progress}% through treatment. {patient.compliance_streak > 7 ? "Excellent compliance." : "Encourage more consistent scanning."}
                </p>
              </div>
            </div>
          )}

          {activeTab === "scans" && (
            <div className="space-y-3">
              {selectedScans.length >= 2 && (
                <Button
                  onClick={() => navigate(`/doctor/scans/compare?ids=${selectedScans.join(",")}`)}
                  className="rounded-pill font-mono text-[9px] uppercase tracking-[0.15em] h-8 mb-2"
                  style={{ background: "hsl(228 100% 62%)", color: "white" }}
                >
                  Compare Selected ({selectedScans.length})
                </Button>
              )}
              {scans.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-4 rounded-card p-4 hover:opacity-80 transition"
                  style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}
                >
                  <Checkbox
                    checked={selectedScans.includes(s.id)}
                    onCheckedChange={(checked) => {
                      setSelectedScans((prev) =>
                        checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                      );
                    }}
                    className="border-muted-foreground data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <div
                    className="flex items-center gap-4 flex-1 cursor-pointer"
                    onClick={() => navigate(`/doctor/scans/${s.id}`)}
                  >
                    <div className="w-14 h-14 rounded-card flex items-center justify-center" style={{ background: "hsl(216 32% 7%)" }}>
                      <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.2)" }}>SCAN</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-mono text-xs" style={{ color: "hsl(38 23% 90% / 0.45)" }}>
                        {format(new Date(s.submitted_at), "dd MMM yyyy · HH:mm").toUpperCase()}
                      </p>
                    </div>
                    <StatusBadge variant={s.status} />
                  </div>
                </div>
              ))}
              {scans.length === 0 && (
                <p className="text-sm" style={{ color: "hsl(38 23% 90% / 0.3)" }}>No scans submitted yet.</p>
              )}
            </div>
          )}

          {activeTab === "progress" && (
            <div>
              <ToothArch className="text-foreground" />
            </div>
          )}

          {activeTab === "chat" && (
            <div className="h-[60vh] rounded-card overflow-hidden" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
              <DoctorChat patientUserId={patient.user_id} patientName={profile?.full_name} />
            </div>
          )}

          {activeTab === "notes" && (
            <div>
              <span className="mono-label mb-3 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>DOCTOR NOTES</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={async () => {
                  try {
                    await supabase.from("patients").update({ notes } as any).eq("id", patientId);
                  } catch (e) { logError(e, { operation: "PatientDetail.saveNotes", userId: user?.id }); }
                }}
                placeholder="Add private notes about this patient..."
                className="w-full h-64 rounded-card p-5 font-mono text-xs resize-none outline-none"
                style={{
                  background: "hsl(220 24% 16%)",
                  border: "1px solid hsl(0 0% 100% / 0.07)",
                  color: "hsl(38 23% 90%)",
                }}
              />
            </div>
          )}

          {activeTab === "billing" && (
            <BillingTab patient={patient} doctorId={user?.id} />
          )}
        </div>
      </main>

      {/* Refer Patient Modal */}
      {referOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-card p-6 max-w-md w-full mx-4" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
            <div className="flex items-center justify-between mb-4">
              <span className="mono-label" style={{ color: "hsl(38 23% 90%)" }}>REFER PATIENT</span>
              <button onClick={() => setReferOpen(false)}><X className="w-4 h-4" style={{ color: "hsl(38 23% 90% / 0.5)" }} /></button>
            </div>
            <Textarea value={referReason} onChange={(e) => setReferReason(e.target.value)} placeholder="Reason for referral..." className="mb-3 bg-card border-border text-foreground" />
            <div className="flex gap-2 mb-4">
              {["routine", "urgent", "emergency"].map((u) => (
                <button key={u} onClick={() => setReferUrgency(u)}
                  className="px-3 py-1.5 rounded-pill mono-label transition"
                  style={{
                    background: referUrgency === u ? "hsl(228 100% 62% / 0.15)" : "transparent",
                    color: referUrgency === u ? "hsl(228 100% 62%)" : "hsl(38 23% 90% / 0.3)",
                    border: `1px solid ${referUrgency === u ? "hsl(228 100% 62% / 0.3)" : "hsl(0 0% 100% / 0.07)"}`,
                  }}>{u.toUpperCase()}</button>
              ))}
            </div>
            <Button onClick={async () => {
              if (!user || !patientId) return;
              setReferring(true);
              try {
                await supabase.from("referrals").insert({
                  from_doctor_id: user.id,
                  patient_id: patientId,
                  reason: referReason || null,
                  urgency: referUrgency,
                });
                toast({ title: "Referral submitted" });
                setReferOpen(false);
                setReferReason("");
              } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
              finally { setReferring(false); }
            }} disabled={referring} className="w-full rounded-pill" style={{ background: "hsl(228 100% 62%)", color: "white" }}>
              {referring ? "Submitting..." : "Submit Referral"}
            </Button>
          </div>
        </div>
      )}

      {/* Chairside Scan Modal */}
      {chairsideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-card p-6 max-w-lg w-full mx-4" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
            <div className="flex items-center justify-between mb-4">
              <span className="mono-label" style={{ color: "hsl(38 23% 90%)" }}>CHAIRSIDE SCAN</span>
              <button onClick={() => {
                streamRef.current?.getTracks().forEach((t) => t.stop());
                setChairsideOpen(false);
                setCameraReady(false);
              }}><X className="w-4 h-4" style={{ color: "hsl(38 23% 90% / 0.5)" }} /></button>
            </div>
            <div className="aspect-[4/3] rounded-card bg-card mb-4 flex items-center justify-center overflow-hidden relative">
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted style={{ display: cameraReady ? "block" : "none" }} />
              {!cameraReady && <span className="mono-label text-muted-foreground">STARTING CAMERA...</span>}
            </div>
            <div className="flex gap-2">
              {!cameraReady ? (
                <Button onClick={async () => {
                  try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
                    streamRef.current = stream;
                    if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); setCameraReady(true); }
                  } catch { toast({ title: "Camera not available", variant: "destructive" }); }
                }} className="flex-1 rounded-pill" style={{ background: "hsl(228 100% 62%)", color: "white" }}>Start Camera</Button>
              ) : (
                <Button onClick={async () => {
                  if (!videoRef.current || !user || !patientId) return;
                  const canvas = document.createElement("canvas");
                  canvas.width = videoRef.current.videoWidth || 640;
                  canvas.height = videoRef.current.videoHeight || 480;
                  const ctx = canvas.getContext("2d");
                  if (ctx) ctx.drawImage(videoRef.current, 0, 0);
                  canvas.toBlob(async (blob) => {
                    if (!blob) return;
                    const path = `${patientId}/${Date.now()}/chairside.jpg`;
                    await supabase.storage.from("scan-videos").upload(path, blob, { contentType: "image/jpeg" });
                    await supabase.from("scans").insert({ patient_id: patientId, status: "pending", video_url: path, source: "chairside", quality_score: 90 });
                    streamRef.current?.getTracks().forEach((t) => t.stop());
                    setChairsideOpen(false);
                    setCameraReady(false);
                    toast({ title: "Chairside scan captured" });
                  }, "image/jpeg", 0.85);
                }} className="flex-1 rounded-pill" style={{ background: "hsl(142 71% 45%)", color: "white" }}>Capture & Save</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
