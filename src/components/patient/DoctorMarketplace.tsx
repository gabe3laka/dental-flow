import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Star, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";

interface Doctor {
  user_id: string;
  full_name: string | null;
  specialty: string | null;
  rating: number | null;
  years_practice: number | null;
  avatar_url: string | null;
  practice_name: string | null;
}

export interface DoctorMarketplaceProps {
  /** "preview" = compact horizontal scroll (Home page), "grid" = full list (Chat/Find tab) */
  mode: "preview" | "grid";
  /** Detection tags from latest scan — used to sort recommended doctors first */
  detectionTags?: string[];
  /** Called after self-assign succeeds */
  onAssign?: (doctorId: string) => void;
  className?: string;
}

function StarRating({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "w-3 h-3",
            i < rounded ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"
          )}
        />
      ))}
      <span className="mono-label text-muted-foreground ml-1 text-[10px]">
        {rating.toFixed(1)}
      </span>
    </div>
  );
}

function DoctorCard({
  doctor,
  isRecommended,
  compact,
  onRequest,
}: {
  doctor: Doctor;
  isRecommended: boolean;
  compact: boolean;
  onRequest: (id: string) => void;
}) {
  const initials = doctor.full_name
    ? doctor.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "DR";

  return (
    <div
      className={cn(
        "flex-shrink-0 bg-card border border-border rounded-card p-4 flex flex-col gap-3",
        compact ? "w-[180px]" : "w-full"
      )}
    >
      {isRecommended && (
        <span className="self-start mono-label bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[9px]">
          ★ RECOMMENDED
        </span>
      )}

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {doctor.avatar_url ? (
            <img
              src={doctor.avatar_url}
              alt={doctor.full_name ?? "Doctor"}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="font-mono text-xs font-semibold text-primary">{initials}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm leading-tight truncate">
            {doctor.full_name ?? "Doctor"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {doctor.specialty ?? "General Dentistry"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <StarRating rating={doctor.rating ?? 4.5} />
        {doctor.years_practice != null && (
          <span className="mono-label text-muted-foreground text-[10px]">
            {doctor.years_practice}y exp
          </span>
        )}
      </div>

      <button
        onClick={() => onRequest(doctor.user_id)}
        className="w-full rounded-pill mono-label py-1.5 text-center transition bg-primary/10 text-primary hover:bg-primary/20 text-[11px]"
      >
        {compact ? "VIEW PROFILE →" : "BOOK CONSULT →"}
      </button>
    </div>
  );
}

export function DoctorMarketplace({
  mode,
  detectionTags = [],
  onAssign,
  className,
}: DoctorMarketplaceProps) {
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "doctor");

        if (!roles?.length) return;

        const { data: profiles } = await supabase
          .from("profiles")
          .select(
            "user_id, full_name, specialty, rating, years_practice, avatar_url, practice_name"
          )
          .in(
            "user_id",
            roles.map((r) => r.user_id)
          );

        setDoctors(profiles ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleRequest = async (doctorId: string) => {
    if (!user) return;
    try {
      const { data: patient } = await supabase
        .from("patients")
        .select("id, assigned_doctor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      // Only self-assign if patient has no doctor yet
      if (patient && !patient.assigned_doctor_id) {
        await supabase
          .from("patients")
          .update({ assigned_doctor_id: doctorId })
          .eq("id", patient.id);
      }
    } finally {
      onAssign?.(doctorId);
    }
  };

  // Recommended = specialty matches any detection tag; secondary sort by rating desc
  const sorted = [...doctors].sort((a, b) => {
    const aRec =
      detectionTags.length > 0 &&
      detectionTags.some((t) =>
        a.specialty?.toLowerCase().includes(t.toLowerCase())
      );
    const bRec =
      detectionTags.length > 0 &&
      detectionTags.some((t) =>
        b.specialty?.toLowerCase().includes(t.toLowerCase())
      );
    if (aRec && !bRec) return -1;
    if (!aRec && bRec) return 1;
    return (b.rating ?? 0) - (a.rating ?? 0);
  });

  const isRecommended = (d: Doctor) =>
    detectionTags.length > 0 &&
    detectionTags.some((t) =>
      d.specialty?.toLowerCase().includes(t.toLowerCase())
    );

  if (loading) {
    return (
      <div className={cn("flex gap-3", mode === "preview" ? "overflow-x-auto" : "flex-col", className)}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "bg-card border border-border rounded-card p-4 animate-pulse",
              mode === "preview" ? "w-[180px] flex-shrink-0" : "w-full"
            )}
          >
            <div className="w-10 h-10 rounded-full bg-muted mb-3" />
            <div className="h-3 bg-muted rounded mb-2 w-3/4" />
            <div className="h-2 bg-muted rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-8 text-center", className)}>
        <Stethoscope className="w-8 h-8 text-muted-foreground mb-3 opacity-40" />
        <p className="text-sm text-muted-foreground">No doctors available yet.</p>
      </div>
    );
  }

  if (mode === "preview") {
    return (
      <div
        className={cn("flex gap-3 overflow-x-auto pb-1", className)}
        style={{
          maskImage: "linear-gradient(to right, black 80%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to right, black 80%, transparent 100%)",
        }}
      >
        {sorted.slice(0, 6).map((doc) => (
          <DoctorCard
            key={doc.user_id}
            doctor={doc}
            isRecommended={isRecommended(doc)}
            compact
            onRequest={handleRequest}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {sorted.map((doc) => (
        <DoctorCard
          key={doc.user_id}
          doctor={doc}
          isRecommended={isRecommended(doc)}
          compact={false}
          onRequest={handleRequest}
        />
      ))}
    </div>
  );
}
