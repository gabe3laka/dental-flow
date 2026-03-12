import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";

export default function PublicConsult() {
  const { doctorSlug } = useParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [concern, setConcern] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorSlug) return;
    setSubmitting(true);
    try {
      // Find doctor by slug or partial ID
      const { data: profile } = await supabase.from("profiles").select("user_id").or(`doctor_slug.eq.${doctorSlug},user_id.like.${doctorSlug}%`).limit(1).maybeSingle();
      if (!profile) {
        logError("Doctor not found for consult slug", { operation: "Consult/handleSubmit" });
        throw new Error("Doctor not found");
      }

      const { error } = await supabase.from("consult_requests").insert({
        doctor_id: profile.user_id,
        patient_name: name,
        patient_email: email,
        concern_text: concern || null,
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <span className="text-2xl">✓</span>
          </div>
          <h1 className="font-display text-2xl font-semibold mb-2">Consultation Submitted</h1>
          <p className="text-muted-foreground text-sm">Your doctor will review your submission and respond shortly. Check your email for updates.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="max-w-md mx-auto">
        <span className="mono-label text-primary mb-2 block">ARCLINE · VIRTUAL CONSULT</span>
        <h1 className="font-display text-3xl font-semibold mb-2">Free Consultation</h1>
        <p className="text-muted-foreground text-sm mb-8">Submit your details and concern below. Your doctor will review and respond with personalized guidance.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mono-label text-muted-foreground mb-1 block">YOUR NAME</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" required className="rounded-tag" />
          </div>
          <div>
            <label className="mono-label text-muted-foreground mb-1 block">EMAIL</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="rounded-tag" />
          </div>
          <div>
            <label className="mono-label text-muted-foreground mb-1 block">DESCRIBE YOUR CONCERN</label>
            <Textarea value={concern} onChange={(e) => setConcern(e.target.value)} placeholder="Tell us about your dental concern..." className="rounded-tag min-h-[120px]" />
          </div>
          <Button type="submit" disabled={submitting} className="w-full rounded-pill bg-primary hover:bg-primary/90 text-primary-foreground font-mono uppercase tracking-[0.15em] text-sm py-6">
            {submitting ? "Submitting..." : "Submit for Free Consultation"}
          </Button>
        </form>
      </div>
    </div>
  );
}
