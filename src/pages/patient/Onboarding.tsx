import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { GradientOrb } from "@/components/ui/gradient-orb";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const onboardingSchema = z.object({
  treatmentCategory: z.string().optional(),
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

const ZONE_LABELS = ["UPPER", "LOWER", "LEFT", "RIGHT", "FRONT"];

const TREATMENT_CATEGORIES = [
  { value: "alignment", label: "Alignment" },
  { value: "whitening", label: "Whitening" },
  { value: "post_surgery", label: "Post-Surgery" },
  { value: "retainer", label: "Retainer" },
  { value: "periodontal", label: "Periodontal" },
  { value: "general", label: "General" },
];

function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full transition-all duration-300"
          style={{
            background: i + 1 === step ? "white" : "rgba(255,255,255,0.3)",
          }}
        />
      ))}
    </div>
  );
}

function ScanZoneDemo() {
  const [activeIdx, setActiveIdx] = useState(-1);

  useEffect(() => {
    let idx = 0;
    const interval = setInterval(() => {
      setActiveIdx(idx % ZONE_LABELS.length);
      idx++;
    }, 600);
    return () => clearInterval(interval);
  }, []);

  const positions = [
    { cx: 50, cy: 18 },
    { cx: 50, cy: 82 },
    { cx: 12, cy: 50 },
    { cx: 88, cy: 50 },
    { cx: 50, cy: 50 },
  ];

  return (
    <div className="relative w-72 h-72 mx-auto mb-8">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <ellipse cx="50" cy="50" rx="42" ry="38" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="0.5" strokeDasharray="3 2" opacity="0.3" />
      </svg>
      {ZONE_LABELS.map((label, i) => {
        const active = i === activeIdx;
        return (
          <div
            key={label}
            className="absolute flex flex-col items-center transition-all duration-400"
            style={{
              left: `${positions[i].cx}%`,
              top: `${positions[i].cy}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div
              className="w-16 h-12 rounded transition-all duration-400"
              style={{
                border: active ? "1.5px solid hsl(142 71% 45%)" : "1.5px dashed hsl(228 100% 62% / 0.4)",
                background: active ? "hsl(142 71% 45% / 0.1)" : "transparent",
              }}
            />
            <span
              className="font-mono text-[9px] uppercase tracking-[0.15em] mt-1 transition-colors duration-300"
              style={{ color: active ? "hsl(142 71% 45%)" : "hsl(var(--muted-foreground))" }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { treatmentCategory: "" },
  });

  const treatmentCategory = form.watch("treatmentCategory") || "";

  const completeOnboarding = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("user_id", user.id);
      if (profileError) throw profileError;

      // Update patient treatment_category if selected
      if (treatmentCategory) {
        await supabase
          .from("patients")
          .update({ treatment_category: treatmentCategory })
          .eq("user_id", user.id);
      }

      navigate("/patient", { replace: true });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [user, navigate, treatmentCategory]);

  if (step === 1) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 relative"
        style={{ background: "linear-gradient(135deg, #2a4de0, #6b9aff)" }}
      >
        <span className="absolute top-8 left-8 font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">
          ARCLINE
        </span>
        <h1 className="font-display text-4xl md:text-5xl font-light italic text-white text-center leading-tight mb-4">
          Your smile,<br />from anywhere.
        </h1>
        <p className="font-body text-white/70 text-base font-light text-center max-w-sm mb-10">
          Professional dental care that meets you wherever you are.
        </p>
        <button
          onClick={() => setStep(2)}
          className="rounded-pill bg-white text-primary font-mono text-[10px] uppercase tracking-[0.15em] px-10 py-3.5 hover:bg-white/90 transition-colors mb-16"
        >
          Get Started →
        </button>
        <div className="absolute bottom-10">
          <ProgressDots step={1} total={5} />
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <div className="w-40 h-64 rounded-card border-2 border-border relative mb-8 flex items-center justify-center">
          <div className="w-8 h-14 rounded-tag bg-primary/20 absolute -top-3 left-1/2 -translate-x-1/2 border border-primary/30" />
          <div className="w-20 h-28 rounded-tag bg-soft-panel flex items-center justify-center">
            <span className="mono-label text-muted-foreground">SCOPE</span>
          </div>
        </div>
        <h2 className="font-display text-3xl font-bold text-foreground text-center mb-3">
          Meet your Arcline Scope.
        </h2>
        <p className="font-body text-muted-foreground text-sm font-light text-center max-w-sm mb-10 leading-relaxed">
          A small attachment clips to your phone and gives your doctor clinical-grade visibility into your treatment progress.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setStep(1)}
            className="rounded-pill border border-border text-foreground font-mono text-[10px] uppercase tracking-[0.15em] px-8 py-3 hover:border-foreground/30 transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => setStep(3)}
            className="rounded-pill bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-[0.15em] px-8 py-3 hover:bg-primary/90 transition-colors"
          >
            Next
          </button>
        </div>
        <div className="absolute bottom-10">
          <ProgressDots step={2} total={5} />
        </div>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <h2 className="font-display text-3xl font-bold text-foreground text-center mb-2">
          How scanning works.
        </h2>
        <p className="font-body text-muted-foreground text-sm font-light text-center max-w-sm mb-6">
          We'll guide you through each zone.
        </p>
        <ScanZoneDemo />
        <p className="font-body text-muted-foreground text-xs font-light text-center max-w-xs mb-10">
          A 60-second full mouth scan — we'll guide you through each zone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setStep(2)}
            className="rounded-pill border border-border text-foreground font-mono text-[10px] uppercase tracking-[0.15em] px-8 py-3 hover:border-foreground/30 transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => setStep(4)}
            className="rounded-pill bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-[0.15em] px-8 py-3 hover:bg-primary/90 transition-colors"
          >
            Next
          </button>
        </div>
        <div className="absolute bottom-10">
          <ProgressDots step={3} total={5} />
        </div>
      </div>
    );
  }

  // Step 4 — Treatment Category
  if (step === 4) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <h2 className="font-display text-3xl font-bold text-foreground text-center mb-3">
          What are you treating?
        </h2>
        <p className="font-body text-muted-foreground text-sm font-light text-center max-w-sm mb-8">
          This helps us tailor your experience.
        </p>
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm mb-10">
          {TREATMENT_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => form.setValue("treatmentCategory", cat.value)}
              className="px-4 py-3.5 rounded-card text-sm font-body text-center transition"
              style={{
                background: treatmentCategory === cat.value ? "hsl(228 100% 62% / 0.15)" : "hsl(var(--muted))",
                border: `1.5px solid ${treatmentCategory === cat.value ? "hsl(228 100% 62%)" : "hsl(var(--border))"}`,
                color: treatmentCategory === cat.value ? "hsl(228 100% 62%)" : "hsl(var(--foreground))",
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setStep(3)}
            className="rounded-pill border border-border text-foreground font-mono text-[10px] uppercase tracking-[0.15em] px-8 py-3 hover:border-foreground/30 transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => setStep(5)}
            className="rounded-pill bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-[0.15em] px-8 py-3 hover:bg-primary/90 transition-colors"
          >
            Next
          </button>
        </div>
        <div className="absolute bottom-10">
          <ProgressDots step={4} total={5} />
        </div>
      </div>
    );
  }

  // Step 5
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      <GradientOrb size={200} className="mb-8" />
      <h2 className="font-display text-3xl font-bold text-foreground text-center mb-3">
        You're all set.
      </h2>
      <p className="font-body text-muted-foreground text-sm font-light text-center max-w-sm mb-10">
        Your doctor is ready for your first scan.
      </p>
      <button
        onClick={completeOnboarding}
        disabled={saving}
        className="rounded-pill bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-[0.15em] px-10 py-3.5 hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {saving ? "Saving..." : "Go to My Dashboard"}
      </button>
      <div className="absolute bottom-10">
        <ProgressDots step={5} total={5} />
      </div>
    </div>
  );
}
