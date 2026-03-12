import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form";

const specialties = [
  "Orthodontist",
  "General Dentist",
  "Pediatric Dentist",
  "Prosthodontist",
  "Periodontist",
  "Other",
];

const plans = [
  {
    tier: "Starter",
    price: "$149/mo",
    patients: "Up to 50 patients",
    features: ["Basic scan review", "Patient messaging", "Email support"],
  },
  {
    tier: "Growth",
    price: "$349/mo",
    patients: "Up to 200 patients",
    features: ["AI scan analysis", "Video responses", "Analytics dashboard", "Priority support"],
  },
  {
    tier: "Enterprise",
    price: "Custom",
    patients: "Unlimited patients",
    features: ["All Growth features", "API access", "Dedicated account manager", "HIPAA BAA", "White-labeling"],
  },
];

const practiceSetupSchema = z.object({
  practiceName: z.string().min(2, "Practice name must be at least 2 characters"),
  specialty: z.string().min(1, "Please select a specialty"),
  address: z.string().min(5, "Address must be at least 5 characters"),
  bio: z.string().min(10, "Bio must be at least 10 characters"),
  yearsPractice: z.coerce.number().min(0, "Years in practice cannot be negative").max(60, "Please enter a valid number of years"),
});

type PracticeSetupFormValues = z.infer<typeof practiceSetupSchema>;

export default function PracticeSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<PracticeSetupFormValues>({
    resolver: zodResolver(practiceSetupSchema),
    defaultValues: {
      practiceName: "",
      specialty: "",
      address: "",
      bio: "",
      yearsPractice: 0,
    },
  });

  const uploadFile = async (file: File, folder: string) => {
    if (!user) return null;
    const ext = file.name.split(".").pop();
    const path = `${folder}/${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("profile-photos").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("profile-photos").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const url = await uploadFile(file, "logos");
      setLogoUrl(url);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadFile(file, "avatars");
      setAvatarUrl(url);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleStep1Continue = async () => {
    const valid = await form.trigger(["practiceName", "specialty", "address"]);
    if (!valid) return;
    setStep(2);
  };

  const handleStep2Continue = async () => {
    const valid = await form.trigger(["bio", "yearsPractice"]);
    if (!valid) return;
    setStep(3);
  };

  const handleComplete = async () => {
    const valid = await form.trigger();
    if (!valid || !user) return;

    const values = form.getValues();
    setSaving(true);
    try {
      // Generate doctor_slug from practice name or full_name
      const slugSource = values.practiceName || user.user_metadata?.full_name || user.id.slice(0, 8);
      const doctorSlug = slugSource
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 30);

      const { error } = await supabase
        .from("profiles")
        .update({
          practice_name: values.practiceName || null,
          specialty: values.specialty || null,
          bio: values.bio || null,
          years_practice: values.yearsPractice || 0,
          avatar_url: avatarUrl || null,
          practice_setup_completed: true,
          doctor_slug: doctorSlug,
        })
        .eq("user_id", user.id);

      if (error) throw error;
      toast({ title: "Practice setup complete!" });
      navigate("/doctor");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "hsl(216 32% 7%)", color: "hsl(38 23% 90%)" }}>
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="mono-label" style={{ color: "hsl(228 100% 62%)" }}>PRACTICE SETUP · STEP {step} OF 3</span>
          <h1 className="font-display text-3xl font-semibold mt-2">
            {step === 1 && "Practice Information"}
            {step === 2 && "Your Profile"}
            {step === 3 && "Choose Your Plan"}
          </h1>
        </div>

        {/* Progress bar */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex-1 h-1 rounded-full" style={{ background: s <= step ? "hsl(228 100% 62%)" : "hsl(0 0% 100% / 0.1)" }} />
          ))}
        </div>

        <Form {...form}>
          <form>
            {step === 1 && (
              <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="practiceName"
                  render={({ field }) => (
                    <FormItem>
                      <span className="mono-label block mb-2" style={{ color: "hsl(38 23% 90% / 0.45)" }}>PRACTICE NAME</span>
                      <FormControl>
                        <Input
                          placeholder="e.g. Smile Studio Dental"
                          className="bg-card border-border text-foreground"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <span className="mono-label block mb-2" style={{ color: "hsl(38 23% 90% / 0.45)" }}>ADDRESS</span>
                      <FormControl>
                        <Input
                          placeholder="123 Main St, City, State"
                          className="bg-card border-border text-foreground"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="specialty"
                  render={({ field }) => (
                    <FormItem>
                      <span className="mono-label block mb-2" style={{ color: "hsl(38 23% 90% / 0.45)" }}>SPECIALTY</span>
                      <FormControl>
                        <div className="grid grid-cols-2 gap-2">
                          {specialties.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => field.onChange(s)}
                              className="px-4 py-3 rounded-card text-sm font-body text-left transition"
                              style={{
                                background: field.value === s ? "hsl(228 100% 62% / 0.15)" : "hsl(220 24% 16%)",
                                border: `1px solid ${field.value === s ? "hsl(228 100% 62%)" : "hsl(0 0% 100% / 0.07)"}`,
                                color: field.value === s ? "hsl(228 100% 62%)" : "hsl(38 23% 90%)",
                              }}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div>
                  <span className="mono-label block mb-2" style={{ color: "hsl(38 23% 90% / 0.45)" }}>PRACTICE LOGO</span>
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="w-full rounded-card p-4 flex items-center justify-center gap-2 transition"
                    style={{ background: "hsl(220 24% 16%)", border: "1px dashed hsl(0 0% 100% / 0.15)" }}
                  >
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="h-12 w-12 rounded object-cover" />
                    ) : (
                      <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>
                        {uploadingLogo ? "UPLOADING..." : "CLICK TO UPLOAD LOGO"}
                      </span>
                    )}
                  </button>
                </div>
                <Button
                  type="button"
                  onClick={handleStep1Continue}
                  className="w-full rounded-pill bg-primary text-primary-foreground font-mono text-xs uppercase tracking-[0.15em] py-6"
                >
                  Continue
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <span className="mono-label block mb-2" style={{ color: "hsl(38 23% 90% / 0.45)" }}>PROFILE PHOTO</span>
                  <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="w-20 h-20 rounded-full mx-auto flex items-center justify-center overflow-hidden transition"
                    style={{ background: "hsl(220 24% 16%)", border: "2px dashed hsl(0 0% 100% / 0.15)" }}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>
                        {uploadingAvatar ? "..." : "PHOTO"}
                      </span>
                    )}
                  </button>
                </div>
                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <span className="mono-label block mb-2" style={{ color: "hsl(38 23% 90% / 0.45)" }}>BIO</span>
                      <FormControl>
                        <Textarea
                          placeholder="Tell patients about your practice and approach..."
                          className="bg-card border-border text-foreground min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="yearsPractice"
                  render={({ field }) => (
                    <FormItem>
                      <span className="mono-label block mb-2" style={{ color: "hsl(38 23% 90% / 0.45)" }}>YEARS IN PRACTICE</span>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="e.g. 12"
                          className="bg-card border-border text-foreground"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1 rounded-pill font-mono text-xs uppercase tracking-[0.15em] border-foreground/20 text-foreground">
                    Back
                  </Button>
                  <Button type="button" onClick={handleStep2Continue} className="flex-1 rounded-pill bg-primary text-primary-foreground font-mono text-xs uppercase tracking-[0.15em]">
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                {plans.map((plan) => (
                  <div
                    key={plan.tier}
                    className="rounded-card p-6"
                    style={{
                      background: "hsl(220 24% 16%)",
                      border: plan.tier === "Growth" ? "2px solid hsl(228 100% 62%)" : "1px solid hsl(0 0% 100% / 0.07)",
                    }}
                  >
                    <div className="flex items-baseline justify-between mb-2">
                      <h3 className="font-display text-lg font-semibold">{plan.tier}</h3>
                      <span className="font-mono text-sm" style={{ color: "hsl(228 100% 62%)" }}>{plan.price}</span>
                    </div>
                    <p className="mono-label mb-3" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{plan.patients}</p>
                    <ul className="space-y-1">
                      {plan.features.map((f) => (
                        <li key={f} className="text-sm font-body" style={{ color: "hsl(38 23% 90% / 0.7)" }}>✓ {f}</li>
                      ))}
                    </ul>
                    {plan.tier === "Growth" && (
                      <span className="mono-label mt-3 inline-block px-2 py-0.5 rounded-pill" style={{ background: "hsl(228 100% 62% / 0.15)", color: "hsl(228 100% 62%)" }}>
                        RECOMMENDED
                      </span>
                    )}
                  </div>
                ))}
                <p className="text-center text-xs font-body" style={{ color: "hsl(38 23% 90% / 0.3)" }}>
                  Billing is handled via Stripe. You can manage your subscription in Settings.
                </p>
                <div className="flex gap-3 mt-4">
                  <Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1 rounded-pill font-mono text-xs uppercase tracking-[0.15em] border-foreground/20 text-foreground">
                    Back
                  </Button>
                  <Button
                    type="button"
                    onClick={handleComplete}
                    disabled={saving}
                    className="flex-1 rounded-pill bg-primary text-primary-foreground font-mono text-xs uppercase tracking-[0.15em]"
                  >
                    {saving ? "Saving..." : "Complete Setup"}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </Form>
      </div>
    </div>
  );
}
