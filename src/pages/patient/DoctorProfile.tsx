import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";

interface DoctorInfo {
  full_name: string | null;
  specialty: string | null;
  bio: string | null;
  years_practice: number | null;
  rating: number | null;
  total_patients: number | null;
  avatar_url: string | null;
}

interface AvailabilitySlot {
  id: string;
  day_of_week: string;
  start_time: string;
  is_active: boolean;
}

export default function DoctorProfile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState<DoctorInfo | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data: patient } = await supabase
          .from("patients")
          .select("assigned_doctor_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!patient?.assigned_doctor_id) { setLoading(false); return; }

        const [profileResult, slotsResult] = await Promise.allSettled([
          supabase
            .from("profiles")
            .select("full_name, specialty, bio, years_practice, rating, total_patients, avatar_url")
            .eq("user_id", patient.assigned_doctor_id)
            .maybeSingle(),
          supabase
            .from("doctor_availability" as any)
            .select("*")
            .eq("doctor_id", patient.assigned_doctor_id)
            .order("day_of_week", { ascending: true }),
        ]);

        if (profileResult.status === "rejected") {
          logError(profileResult.reason, { operation: "DoctorProfile/fetchProfile", userId: user?.id });
        }
        if (slotsResult.status === "rejected") {
          logError(slotsResult.reason, { operation: "DoctorProfile/fetchSlots", userId: user?.id });
        }

        setDoctor(profileResult.status === "fulfilled" ? profileResult.value.data : null);
        setSlots(slotsResult.status === "fulfilled" ? ((slotsResult.value.data as any[]) || []) : []);
      } catch (e) {
        logError(e, { operation: "DoctorProfile/loadData", userId: user?.id });
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-6 py-8 max-w-lg mx-auto pb-24">
        <Skeleton className="h-64 rounded-card" />
        <PatientBottomNav />
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="min-h-screen bg-background px-6 py-8 max-w-lg mx-auto pb-24">
        <span className="mono-label text-muted-foreground">YOUR DOCTOR</span>
        <h1 className="font-display text-2xl font-semibold mt-1 mb-8">No Doctor Assigned</h1>
        <p className="text-sm text-muted-foreground">You haven't been assigned a doctor yet. Please contact support.</p>
        <PatientBottomNav />
      </div>
    );
  }

  const initials = (doctor.full_name || "?").split(" ").map((n) => n[0]).join("");

  return (
    <div className="min-h-screen bg-background px-6 py-8 max-w-lg mx-auto pb-24">
      <button onClick={() => navigate("/patient/profile")} className="mono-label text-muted-foreground hover:text-foreground transition-colors mb-4">
        ← BACK
      </button>
      <span className="mono-label text-muted-foreground">YOUR DOCTOR</span>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-8">Doctor Profile</h1>

      <div className="flex flex-col items-center text-center mb-8">
        {doctor.avatar_url ? (
          <img src={doctor.avatar_url} alt={doctor.full_name || ""} className="w-24 h-24 rounded-full object-cover mb-4" />
        ) : (
          <div className="w-24 h-24 rounded-full bg-soft-panel flex items-center justify-center mb-4">
            <span className="font-mono text-2xl text-muted-foreground">{initials}</span>
          </div>
        )}
        <h2 className="font-display text-xl font-semibold">{doctor.full_name}</h2>
        {doctor.specialty && (
          <span className="mono-label text-primary mt-2 px-3 py-1 rounded-pill bg-primary/10">
            {doctor.specialty.toUpperCase()}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: "PATIENTS", value: String(doctor.total_patients ?? 0) },
          { label: "RATING", value: doctor.rating ? `${doctor.rating}★` : "—" },
          { label: "YEARS", value: String(doctor.years_practice ?? 0) },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-card border border-border p-4 text-center">
            <span className="mono-label text-muted-foreground">{s.label}</span>
            <p className="font-display text-xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Bio */}
      {doctor.bio && (
        <div className="bg-card rounded-card border border-border p-6 mb-6">
          <span className="mono-label text-muted-foreground mb-2 block">BIO</span>
          <p className="text-sm text-foreground font-body leading-relaxed">{doctor.bio}</p>
        </div>
      )}

      {/* Available Slots — from database */}
      <div className="bg-card rounded-card border border-border p-6 mb-6">
        <span className="mono-label text-muted-foreground mb-3 block">AVAILABLE SLOTS</span>
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No availability slots set by your doctor yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {slots.map((slot) => (
              <button
                key={slot.id}
                onClick={() => toast({ title: "Booking", description: "Contact your practice to book this time." })}
                className="px-3 py-2 rounded-pill mono-label transition-all"
                style={{
                  background: slot.is_active ? "hsl(228 100% 62% / 0.12)" : "hsl(var(--muted))",
                  color: slot.is_active ? "hsl(228 100% 62%)" : "hsl(var(--muted-foreground))",
                  border: `1px solid ${slot.is_active ? "hsl(228 100% 62% / 0.25)" : "hsl(var(--border))"}`,
                  opacity: slot.is_active ? 1 : 0.5,
                }}
              >
                {slot.day_of_week} {slot.start_time}
              </button>
            ))}
          </div>
        )}
      </div>

      <Button
        onClick={() => navigate("/patient/chat")}
        className="w-full rounded-pill bg-primary hover:bg-primary/90 text-primary-foreground font-mono uppercase tracking-[0.15em] text-sm py-6"
      >
        Message Doctor
      </Button>

      <PatientBottomNav />
    </div>
  );
}
