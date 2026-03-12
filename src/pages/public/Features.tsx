import { Link } from "react-router-dom";
import { Scan, MessageSquare, BarChart3, Shield, Video, Brain, Zap, Users, ArrowRightLeft, ArrowLeft } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

const features = [
  { icon: Scan, title: "AI Scan Analysis", desc: "AI-powered quality checks and tooth-by-tooth analysis. Automatically detect alignment issues, plaque buildup, and treatment progress from patient-submitted scans.", accent: "#4f7cff" },
  { icon: Video, title: "Video Responses", desc: "Record and send branded video replies to patients. Deliver personalized care instructions, celebrate milestones, or explain treatment updates — all without an in-person visit.", accent: "#8b5cf6" },
  { icon: MessageSquare, title: "Real-Time Messaging", desc: "Secure, HIPAA-compliant chat between doctors and patients. Share images, scans, and files with end-to-end encryption and read receipts.", accent: "#10b981" },
  { icon: Zap, title: "Smart Automations", desc: "Set up automated reminders, follow-ups, and compliance nudges. Reduce no-shows and keep patients on track without manual effort.", accent: "#14b8a6" },
  { icon: Brain, title: "Treatment Tracking", desc: "Visual progress tracking with AI-generated summaries. Monitor stage completion, compliance streaks, and estimated treatment timelines.", accent: "#ec4899" },
  { icon: BarChart3, title: "Practice Analytics", desc: "Comprehensive dashboards for scans reviewed, visits avoided, revenue impact, and patient compliance. Export reports for team meetings.", accent: "#f59e0b" },
  { icon: Shield, title: "Enterprise Security", desc: "Role-based access control, encrypted data at rest and in transit, audit logs, and full HIPAA compliance. Built for practices that take security seriously.", accent: "#6366f1" },
  { icon: Users, title: "Virtual Consultations", desc: "Generate a public consultation link for new patient intake. Patients submit their concerns and scans before their first visit, saving chair time.", accent: "#f97316" },
  { icon: ArrowRightLeft, title: "Rapid Referrals", desc: "Two-click referrals with full patient context. Send scan history, treatment notes, and AI analysis to specialists instantly.", accent: "#8b5cf6" },
];

export default function Features() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="pt-24 pb-12 px-8 lg:px-20 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
          </Link>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">Platform Features</h1>
          <p className="font-body text-muted-foreground text-base font-light max-w-xl leading-relaxed">
            Everything your dental practice needs to deliver premium virtual care — from AI-powered scan analysis to smart automations.
          </p>
        </div>
      </div>

      {/* Features accordion grid */}
      <div className="py-16 px-8 lg:px-20">
        <div className="max-w-7xl mx-auto md:grid md:grid-cols-2 gap-x-12">
          <Accordion type="single" collapsible>
            {features.slice(0, 5).map(({ icon: Icon, title, desc, accent }) => (
              <AccordionItem key={title} value={title} className="border-b border-border">
                <AccordionTrigger className="hover:no-underline py-5 gap-3">
                  <span className="flex items-center gap-3">
                    <span
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${accent}14`, border: `1px solid ${accent}25` }}
                    >
                      <Icon className="w-4.5 h-4.5" style={{ color: accent }} />
                    </span>
                    <span className="font-display font-semibold text-foreground text-base text-left">{title}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="font-body text-muted-foreground text-sm font-light leading-relaxed pl-12">{desc}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <Accordion type="single" collapsible>
            {features.slice(5).map(({ icon: Icon, title, desc, accent }) => (
              <AccordionItem key={title} value={title} className="border-b border-border">
                <AccordionTrigger className="hover:no-underline py-5 gap-3">
                  <span className="flex items-center gap-3">
                    <span
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${accent}14`, border: `1px solid ${accent}25` }}
                    >
                      <Icon className="w-4.5 h-4.5" style={{ color: accent }} />
                    </span>
                    <span className="font-display font-semibold text-foreground text-base text-left">{title}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="font-body text-muted-foreground text-sm font-light leading-relaxed pl-12">{desc}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>

      {/* CTA */}
      <div className="py-16 px-8 lg:px-20 bg-card border-t border-border">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-4">Ready to get started?</h2>
          <p className="font-body text-muted-foreground text-sm font-light mb-8">Start your 14-day free trial today. No credit card required.</p>
          <Link
            to="/signup"
            className="inline-flex rounded-pill bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-[0.15em] px-8 py-3.5 hover:bg-primary/90 transition-colors"
            style={{ boxShadow: "0 4px 16px hsla(228,100%,62%,0.3)" }}
          >
            Start Free Trial
          </Link>
        </div>
      </div>
    </div>
  );
}
