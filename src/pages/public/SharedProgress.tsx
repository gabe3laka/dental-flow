import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ToothArch } from "@/components/patient/ToothArch";
import { GradientOrb } from "@/components/ui/gradient-orb";
import { format } from "date-fns";
import { logError } from "@/lib/logger";

export default function SharedProgress() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [patient, setPatient] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [latestScan, setLatestScan] = useState<any>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { data: share } = await supabase
          .from("progress_shares" as any)
          .select("*")
          .eq("share_token", token)
          .maybeSingle();
        if (!share) { setExpired(true); setLoading(false); return; }
        if (new Date((share as any).expires_at) < new Date()) { setExpired(true); setLoading(false); return; }

        const patientId = (share as any).patient_id;
        const { data: p } = await supabase.from("patients").select("*").eq("id", patientId).maybeSingle();
        if (!p) {
          logError("Patient not found for shared progress token", { operation: "SharedProgress/loadData" });
          setExpired(true);
          setLoading(false);
          return;
        }
        setPatient(p);

        if (p) {
          const [profileResult, milestonesResult, scanResult] = await Promise.allSettled([
            supabase.from("profiles").select("full_name").eq("user_id", p.user_id).maybeSingle(),
            supabase.from("treatment_milestones").select("*").eq("patient_id", p.id).order("target_date", { ascending: true }),
            supabase.from("scans").select("quality_score, detection_tags").eq("patient_id", p.id).order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
          ]);
          if (profileResult.status === "rejected") {
            logError(profileResult.reason, { operation: "SharedProgress/fetchProfile" });
          }
          if (milestonesResult.status === "rejected") {
            logError(milestonesResult.reason, { operation: "SharedProgress/fetchMilestones" });
          }
          if (scanResult.status === "rejected") {
            logError(scanResult.reason, { operation: "SharedProgress/fetchLatestScan" });
          }
          setProfile(profileResult.status === "fulfilled" ? profileResult.value.data : null);
          setMilestones(milestonesResult.status === "fulfilled" ? (milestonesResult.value.data || []) : []);
          setLatestScan(scanResult.status === "fulfilled" ? scanResult.value.data : null);
        }
      } catch (e) { logError(e, { operation: "SharedProgress/loadData" }); }
      finally { setLoading(false); }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse font-mono text-muted-foreground mono-label">LOADING</div>
      </div>
    );
  }

  if (expired || !patient) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
        <span className="mono-label text-muted-foreground mb-2">SHARED PROGRESS</span>
        <h1 className="font-display text-2xl font-semibold mb-4">Link Expired</h1>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          This progress sharing link has expired or is invalid. Ask the patient to generate a new one.
        </p>
      </div>
    );
  }

  const progress = patient.total_stages ? Math.round((patient.current_stage / patient.total_stages) * 100) : 0;

  return (
    <div className="min-h-screen bg-background px-6 py-8 max-w-lg mx-auto">
      <span className="mono-label text-muted-foreground">SHARED PROGRESS</span>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-2">
        {profile?.full_name || "Patient"}'s Progress
      </h1>
      <p className="text-xs text-muted-foreground mb-8">Read-only view · Link expires automatically</p>

      <div className="flex flex-col items-center mb-8">
        <GradientOrb percentage={progress} status={progress >= 50 ? "ON TRACK" : "IN PROGRESS"} />
      </div>

      {/* Tooth Map */}
      <div className="rounded-card overflow-hidden mb-8" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
        <div className="px-4 pt-5 pb-2">
          <ToothArch className="[&_text]:!fill-[hsl(38_23%_90%_/_0.4)]" />
        </div>
        {latestScan?.quality_score != null && (
          <div className="px-5 pb-4">
            <div className="flex justify-between mb-1.5">
              <span className="font-mono text-[9px] tracking-[0.15em] uppercase" style={{ color: "hsl(38 23% 90% / 0.4)" }}>QUALITY</span>
              <span className="font-mono text-[11px] font-semibold" style={{ color: "hsl(38 23% 90%)" }}>{Math.round(latestScan.quality_score)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(220 24% 16%)" }}>
              <div className="h-full rounded-full" style={{ width: `${latestScan.quality_score}%`, background: latestScan.quality_score >= 80 ? "hsl(142 71% 45%)" : "hsl(45 93% 47%)" }} />
            </div>
          </div>
        )}
      </div>

      {/* Milestones */}
      {milestones.length > 0 && (
        <div className="mb-8">
          <span className="mono-label text-muted-foreground mb-3 block">MILESTONES</span>
          <div className="space-y-2">
            {milestones.map((m) => (
              <div key={m.id} className="bg-card rounded-card border border-border p-4 flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full border-2 flex-shrink-0"
                  style={{
                    borderColor: m.completed_at ? "hsl(142 71% 45%)" : "hsl(var(--border))",
                    background: m.completed_at ? "hsl(142 71% 45%)" : "transparent",
                  }}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">{m.title}</p>
                  {m.target_date && (
                    <span className="mono-label text-muted-foreground">{format(new Date(m.target_date), "dd MMM yyyy").toUpperCase()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center">
        <span className="mono-label text-muted-foreground">POWERED BY ARCLINE</span>
      </div>
    </div>
  );
}
