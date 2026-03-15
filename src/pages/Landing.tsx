import { Link, Navigate } from "react-router-dom";
import { useState } from "react";
import { VerticalLabel } from "@/components/ui/vertical-label";
import { Scan, MessageSquare, BarChart3, Shield, Video, Brain, Zap, Users, ArrowRightLeft, Check, ArrowRight, Play, Menu, X, Star, Hospital, Bluetooth } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import HeroOverlays from "@/components/landing/HeroOverlays";
import LightRays from "@/components/landing/LightRays";
import ScrollReveal from "@/components/landing/ScrollReveal";
import CustomCursor from "@/components/landing/CustomCursor";
import HeroPhoneMockup from "@/components/landing/HeroPhoneMockup";
import CountUpNumber from "@/components/landing/CountUpNumber";
import CarouselDots from "@/components/landing/CarouselDots";
import { useAuth } from "@/hooks/use-auth";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

/* ─── Smooth scroll helper ─── */
function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

/* ─── Decorative dashed box (brand motif) ─── */
function DecoDashedBox({ w = 70, h = 40, className = "" }: { w?: number; h?: number; className?: string }) {
  return (
    <div
      className={`pointer-events-none ${className}`}
      style={{
        width: w,
        height: h,
        border: "1px dashed hsla(228,100%,62%,0.2)",
        position: "relative",
      }}
    >
      {["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"].map((pos, i) => (
        <div
          key={i}
          className={`absolute w-[4px] h-[4px] ${pos}`}
          style={{
            background: "hsl(228 100% 62% / 0.3)",
            transform: `translate(${pos.includes("left") ? "-50%" : "50%"}, ${pos.includes("top") ? "-50%" : "50%"})`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Eyebrow line + text ─── */
function EyebrowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono-label text-muted-foreground flex items-center gap-3">
      <span className="inline-block w-5 h-px" style={{ background: "hsl(228 100% 62%)" }} />
      {children}
    </span>
  );
}

const features = [
  { icon: Scan, title: "AI Scan Analysis", desc: "AI-powered quality checks and tooth analysis.", accent: "#4f7cff" },
  { icon: Video, title: "Video Responses", desc: "Branded video replies, delivered instantly.", accent: "#8b5cf6" },
  { icon: MessageSquare, title: "Real-Time Messaging", desc: "Secure HIPAA-ready patient chat.", accent: "#10b981" },
  { icon: Brain, title: "Treatment Tracking", desc: "Visual progress with AI summaries.", accent: "#ec4899" },
  { icon: BarChart3, title: "Practice Analytics", desc: "Charts for scans, visits, and compliance.", accent: "#f59e0b" },
  { icon: Shield, title: "Enterprise Security", desc: "Role-based access and encrypted data.", accent: "#6366f1" },
  { icon: Zap, title: "Smart Automations", desc: "Automated reminders and follow-ups.", accent: "#14b8a6" },
  { icon: Users, title: "Virtual Consultations", desc: "Public link for new patient intake.", accent: "#f97316" },
  { icon: ArrowRightLeft, title: "Rapid Referrals", desc: "Two-click referrals with full context.", accent: "#8b5cf6" },
];

const pricingPlans = [
  {
    name: "Starter",
    description: "For small practices",
    price: "$149",
    period: "/mo",
    color: "hsl(228 100% 62%)",
    features: ["Up to 50 patients", "Basic scan review", "Patient messaging", "Email support"],
    cta: "Start Free Trial",
    ctaStyle: "outline" as const,
  },
  {
    name: "Professional",
    description: "For growing practices",
    price: "$349",
    period: "/mo",
    color: "hsl(228 100% 62%)",
    popular: true,
    features: ["Up to 200 patients", "AI scan analysis", "Video responses", "Analytics dashboard", "Priority support"],
    cta: "Start Free Trial",
    ctaStyle: "primary" as const,
  },
  {
    name: "Enterprise",
    description: "For DSOs and chains",
    price: "Custom",
    period: "",
    color: "hsl(43 50% 54%)",
    features: ["Unlimited patients", "Everything in Professional", "Multi-location support", "Custom integrations", "Dedicated account manager", "SLA guarantee", "White-label options"],
    cta: "Contact Sales",
    ctaStyle: "outline" as const,
  },
];

const navLinks = [
  { label: "Features", target: "features" },
  { label: "Pricing", target: "pricing" },
  { label: "Ecosystem", target: "ecosystem" },
  { label: "Contact", target: "cta" },
];

/* ─── Particle field dots ─── */
const particles = Array.from({ length: 20 }, (_, i) => ({
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 100}%`,
  delay: `${Math.random() * 6}s`,
  size: 2 + Math.random() * 2,
}));

/* ─── Feature Card (reusable) ─── */
function FeatureCard({ icon: Icon, title, desc, accent }: { icon: React.ElementType; title: string; desc: string; accent: string }) {
  return (
    <div
      className="relative p-6 rounded-card border border-border group cursor-default h-full overflow-hidden"
      style={{
        background: "hsl(36 47% 97%)",
        borderTop: `2px solid ${accent}25`,
        transition: "all 250ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = "hsl(0 0% 100%)";
        el.style.borderTopColor = accent;
        el.style.boxShadow = `0 8px 40px ${accent}18, 0 2px 8px rgba(0,0,0,0.06)`;
        el.style.transform = "scale(1.02) translateY(-4px)";
        const overlay = el.querySelector("[data-overlay]") as HTMLElement;
        if (overlay) overlay.style.opacity = "1";
        const arrow = el.querySelector("[data-arrow]") as HTMLElement;
        if (arrow) arrow.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = "hsl(36 47% 97%)";
        el.style.borderTopColor = `${accent}25`;
        el.style.boxShadow = "none";
        el.style.transform = "scale(1) translateY(0)";
        const overlay = el.querySelector("[data-overlay]") as HTMLElement;
        if (overlay) overlay.style.opacity = "0";
        const arrow = el.querySelector("[data-arrow]") as HTMLElement;
        if (arrow) arrow.style.opacity = "0";
      }}
    >
      <div
        data-overlay
        className="absolute inset-0 pointer-events-none rounded-card transition-opacity duration-300"
        style={{ background: `linear-gradient(135deg, ${accent}0D, transparent 60%)`, opacity: 0 }}
      />
      <div
        className="w-12 h-12 rounded-[10px] flex items-center justify-center mb-4 transition-colors duration-200 relative z-10"
        style={{ background: `${accent}14`, border: `1px solid ${accent}25` }}
      >
        <Icon className="w-5 h-5" style={{ color: accent }} />
      </div>
      <h3 className="text-lg text-foreground mb-2 relative z-10 font-display font-semibold">{title}</h3>
      <p className="font-body text-muted-foreground text-sm font-light leading-relaxed relative z-10">{desc}</p>
      <div data-arrow className="absolute bottom-4 right-4 transition-opacity duration-300 z-10" style={{ opacity: 0 }}>
        <ArrowRight className="w-4 h-4" style={{ color: accent }} />
      </div>
    </div>
  );
}

/* ─── Pricing Card (reusable) ─── */
function PricingCard({ plan }: { plan: typeof pricingPlans[number] }) {
  return (
    <div
      className={`relative rounded-card border border-border h-full p-6 ${plan.popular ? "lg:scale-105" : ""}`}
      style={{
        borderTop: `3px solid ${plan.color}`,
        transition: "all 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        background: plan.popular
          ? "linear-gradient(180deg, hsla(228,100%,62%,0.03) 0%, hsl(0 0% 100%) 100%)"
          : "hsl(0 0% 100%)",
        ...(plan.popular ? { boxShadow: `0 0 0 2px ${plan.color}, 0 8px 40px hsla(228,100%,62%,0.12)` } : {}),
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.transform = plan.popular ? "scale(1.05) translateY(-8px)" : "translateY(-8px)";
        el.style.boxShadow = plan.popular
          ? `0 0 0 2px ${plan.color}, 0 16px 48px hsla(228,100%,62%,0.2)`
          : "0 16px 48px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.transform = plan.popular ? "scale(1.05)" : "translateY(0)";
        el.style.boxShadow = plan.popular
          ? `0 0 0 2px ${plan.color}, 0 8px 40px hsla(228,100%,62%,0.12)`
          : "none";
      }}
    >
      {plan.popular && (
        <div
          className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 mono-label text-primary-foreground"
          style={{ background: "hsl(228 100% 62%)", boxShadow: "0 4px 12px hsla(228,100%,62%,0.3)" }}
        >
          Most Popular
        </div>
      )}
      <span className="mono-label block mb-1" style={{ color: plan.color }}>{plan.name}</span>
      <span className="font-body text-muted-foreground text-xs font-light block mb-4">{plan.description}</span>
      <div className="flex items-baseline gap-1 mb-6">
        <span className="font-display text-4xl font-bold text-foreground">{plan.price}</span>
        {plan.period && <span className="font-body text-muted-foreground text-sm font-light">{plan.period}</span>}
      </div>
      <ul className="space-y-3 mb-8">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <span className="font-body text-muted-foreground text-sm font-light">{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/signup"
        className={`block w-full text-center rounded-pill mono-label px-6 py-3 transition-colors ${
          plan.ctaStyle === "primary"
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border border-border text-foreground hover:border-foreground/30"
        }`}
        style={plan.ctaStyle === "primary" ? { boxShadow: "0 4px 16px hsla(228,100%,62%,0.3)" } : {}}
      >
        {plan.cta}
      </Link>
    </div>
  );
}

export default function Landing() {
  const { user, role, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pricingApi, setPricingApi] = useState<CarouselApi>();
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const [demoForm, setDemoForm] = useState({ name: "", email: "", practiceType: "General Dentistry" });

  if (!loading && user && role) {
    if (role === "admin") return <Navigate to="/admin" replace />;
    if (role === "doctor") return <Navigate to="/doctor" replace />;
    return <Navigate to="/patient" replace />;
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <CustomCursor />

      {/* ─── Navbar ─── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 py-4 md:py-5"
        style={{
          background: "rgba(245,241,235,0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full animate-nav-dot-pulse" style={{ background: "hsl(228 100% 62%)" }} />
          <span className="font-mono uppercase text-foreground text-[11px]" style={{ letterSpacing: "0.25em" }}>ARCLINE</span>
        </span>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <button
              key={link.target}
              onClick={() => scrollToSection(link.target)}
              className="mono-label text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer"
            >
              {link.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link to="/login" className="hidden md:inline mono-label text-muted-foreground hover:text-foreground transition-colors px-4 py-2">
            Sign In
          </Link>
          <button
            onClick={() => setDemoOpen(true)}
            className="hidden md:inline rounded-pill border border-border text-foreground mono-label px-4 py-2 hover:border-foreground/30 transition-colors"
          >
            Book a Demo
          </button>
          <Link
            to="/signup"
            className="hidden md:inline rounded-pill bg-primary text-primary-foreground mono-label px-4 md:px-6 py-2 md:py-2.5 hover:bg-primary/90 transition-colors"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 16px hsla(228,100%,62%,0.35)" }}
          >
            Get Started
          </Link>
          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <div
          className="fixed top-[60px] left-0 right-0 z-40 px-4 py-6 flex flex-col gap-4 md:hidden"
          style={{
            background: "rgba(245,241,235,0.95)",
            backdropFilter: "blur(16px)",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          {navLinks.map((link) => (
            <button
              key={link.target}
              onClick={() => { scrollToSection(link.target); setMobileMenuOpen(false); }}
              className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors text-left py-2"
            >
              {link.label}
            </button>
          ))}
          <Link to="/login" className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground py-2">Sign In</Link>
          <Link
            to="/signup"
            className="rounded-pill bg-primary text-primary-foreground mono-label px-6 py-3 text-center hover:bg-primary/90 transition-colors"
          >
            Get Started
          </Link>
        </div>
      )}

      {/* ─── Hero ─── */}

      {/* ── Mobile Hero (< 640px) ── */}
      <section className="sm:hidden relative min-h-screen flex flex-col justify-center overflow-hidden"
        style={{ background: "linear-gradient(180deg, #1a2980 0%, #3d6dff 40%, #6b8fff 65%, #c5d3ff 85%, #f0f2ff 95%, #e8ecf8 100%)" }}
      >
        {/* Dark overlay gradient for text readability */}
        <div className="absolute inset-0 z-[5]" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 40%, transparent 60%)" }} />
        {/* Phone mockup */}
        <div className="relative z-10 flex justify-center pt-12 pb-0">
          <div style={{ transform: "scale(0.7)", transformOrigin: "center center" }}>
            <HeroPhoneMockup />
          </div>
        </div>
        {/* Overlaid text content */}
        <div className="relative z-20 px-6 pb-6 -mt-16">
          <h1 className="font-display italic leading-[1.08] text-white mb-3 text-5xl" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>
            <span className="font-bold">Your smile,</span><br />
            <span className="font-light">reimagined.</span>
          </h1>
          <p className="font-body text-white/80 text-sm font-light max-w-xs mb-3 leading-relaxed" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>
            AI-powered virtual dental care for modern practices.
          </p>
          <div className="flex flex-col gap-2.5">
            <Link
              to="/signup"
              className="rounded-pill bg-white text-foreground mono-label px-8 py-3.5 hover:bg-white/90 transition-colors text-center"
            >
              Start as Patient
            </Link>
            <button
              onClick={() => scrollToSection("cta")}
              className="rounded-pill border border-white/50 text-white mono-label px-6 py-3.5 hover:border-white/70 transition-colors flex items-center justify-center gap-2"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
            >
              <Play className="w-3.5 h-3.5" />
              Watch Demo
            </button>
          </div>
        </div>
      </section>

      {/* ── Tablet Hero (640px - 1023px) ── */}
      <section className="hidden sm:flex lg:hidden relative min-h-screen">
        {/* Left text */}
        <div
          className="w-1/2 flex flex-col justify-center px-8 pt-24 z-10 relative animate-gradient-shift"
          style={{ background: "linear-gradient(160deg, #f8f5f0 0%, #f0e8f4 35%, #e8e0f0 55%, #f5f0ea 75%, #faf8f5 100%)", backgroundSize: "200% 200%" }}
        >
          <div className="absolute pointer-events-none" style={{ width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(61,109,255,0.10), transparent 70%)", left: -100, top: 200 }} />
          <div className="absolute pointer-events-none" style={{ width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.10), transparent 70%)", right: -50, top: 80 }} />
          <div className="absolute pointer-events-none" style={{ width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(201,168,76,0.06), transparent 70%)", left: -50, bottom: -50 }} />

          <ScrollReveal>
            <EyebrowLabel>VIRTUAL DENTAL CARE</EyebrowLabel>
          </ScrollReveal>
          <ScrollReveal delay={80}>
            <h1 className="font-display italic leading-[1.08] text-foreground mb-4 mt-4 text-4xl md:text-5xl">
              <span className="font-bold">Your smile,</span><br />
              <span className="font-light">reimagined.</span>
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={160}>
            <p className="font-body text-muted-foreground text-base font-light max-w-sm mb-8 leading-relaxed">
              AI-powered virtual dental care connecting professionals and patients through remote monitoring.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={240}>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/signup"
                className="rounded-pill bg-primary text-primary-foreground mono-label px-6 py-3 hover:bg-primary/90 transition-colors"
                style={{ boxShadow: "0 4px 16px hsla(228,100%,62%,0.3)" }}
              >
                Start as Patient
              </Link>
              <button
                onClick={() => scrollToSection("cta")}
                className="rounded-pill border border-border text-foreground mono-label px-5 py-3 hover:border-foreground/30 transition-colors flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5" />
                Watch Demo
              </button>
            </div>
            <div className="mt-6 flex items-center gap-4">
              <span className="mono-label text-muted-foreground/50">Trusted by</span>
              {["SmileDirect", "Invisalign", "Candid"].map((name) => (
                <span key={name} className="mono-label text-muted-foreground/30">{name}</span>
              ))}
            </div>
          </ScrollReveal>
        </div>
        {/* Right phone with blue gradient */}
        <div
          className="w-1/2 flex items-center justify-center relative overflow-hidden"
          style={{ background: "linear-gradient(180deg, #1a2980 0%, #3d6dff 30%, #6b8fff 55%, #c5d3ff 78%, #f0f2ff 90%, #faf7f2 100%)" }}
        >
          <div className="relative z-10" style={{ transform: "scale(0.75)", transformOrigin: "center center" }}>
            <HeroPhoneMockup />
          </div>
        </div>
      </section>

      {/* ── Desktop Hero (1024px+) ── */}
      <section className="hidden lg:flex relative min-h-screen">
        {/* Left content */}
        <div
          className="flex-1 flex flex-col justify-center px-20 pt-24 z-10 relative animate-gradient-shift"
          style={{ background: "linear-gradient(160deg, #f8f5f0 0%, #f0e8f4 35%, #e8e0f0 55%, #f5f0ea 75%, #faf8f5 100%)", backgroundSize: "200% 200%" }}
        >
          <div
            className="absolute pointer-events-none"
            style={{ width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(61,109,255,0.10), transparent 70%)", left: -150, top: 200 }}
          />
          <div className="absolute pointer-events-none" style={{ width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.10), transparent 70%)", right: -80, top: 100 }} />
          <div className="absolute pointer-events-none" style={{ width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(201,168,76,0.06), transparent 70%)", left: -80, bottom: -80 }} />

          <ScrollReveal>
            <EyebrowLabel>VIRTUAL DENTAL CARE</EyebrowLabel>
          </ScrollReveal>
          <ScrollReveal delay={80}>
            <h1 className="font-display italic leading-[1.08] text-foreground mb-6 mt-6" style={{ fontSize: "clamp(48px, 5.5vw, 72px)" }}>
              <span className="font-bold">Your smile,</span><br />
              <span className="font-light">reimagined.</span>
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={160}>
            <p className="font-body text-muted-foreground text-lg md:text-xl font-light max-w-md mb-10 leading-relaxed">
              Premium virtual care connecting dental professionals and patients through AI-powered remote monitoring — from alignment to whitening and everything in between.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={240}>
            <div className="flex flex-wrap gap-3">
                <Link
                  to="/signup"
                  className="rounded-pill bg-primary text-primary-foreground mono-label px-8 py-3.5 hover:bg-primary/90 transition-colors"
                  style={{ boxShadow: "0 4px 16px hsla(228,100%,62%,0.3)" }}
                >
                  Get Started Free
                </Link>
                <button
                  onClick={() => setDemoOpen(true)}
                  className="rounded-pill border border-border text-foreground mono-label px-6 py-3.5 hover:border-foreground/30 transition-colors flex items-center gap-2"
                >
                  Book a Demo
                </button>
              </div>
              <div className="mt-4">
                <Link to="/login" className="font-body text-muted-foreground text-xs font-light hover:text-foreground transition-colors">
                  Already a provider? <span className="underline">Sign in</span>
                </Link>
              </div>
              <div className="mt-6 flex items-center gap-6">
                <span className="mono-label text-muted-foreground/50">Trusted by</span>
                {["SmileDirect", "Invisalign", "Candid"].map((name) => (
                  <span key={name} className="mono-label text-muted-foreground/30">{name}</span>
                ))}
            </div>
          </ScrollReveal>
        </div>

        {/* Right — Phone mockup with orbs */}
        <div
          className="w-1/2 flex items-center justify-center relative overflow-hidden"
          style={{ background: "linear-gradient(180deg, #1a2980 0%, #3d6dff 30%, #6b8fff 55%, #c5d3ff 78%, #f0f2ff 90%, #faf7f2 100%)" }}
        >
          <LightRays />
          <VerticalLabel text="AI ANALYSIS · LIVE" className="text-white/15" />

          <div className="absolute pointer-events-none" style={{ width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, hsla(256,67%,80%,0.3), transparent 70%)", filter: "blur(60px)", top: "15%", left: "10%" }} />
          <div className="absolute pointer-events-none" style={{ width: 250, height: 250, borderRadius: "50%", background: "radial-gradient(circle, hsla(330,50%,81%,0.25), transparent 70%)", filter: "blur(50px)", bottom: "20%", right: "5%" }} />
          <div className="absolute pointer-events-none" style={{ width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, hsla(228,100%,62%,0.2), transparent 70%)", filter: "blur(40px)", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />

          {particles.map((p, i) => (
            <div
              key={i}
              className="absolute rounded-full animate-float-slow pointer-events-none"
              style={{
                width: p.size,
                height: p.size,
                background: "rgba(255,255,255,0.3)",
                left: p.left,
                top: p.top,
                animationDelay: p.delay,
              }}
            />
          ))}

          <div className="relative z-10">
            <HeroPhoneMockup />
          </div>
          <HeroOverlays />
        </div>
      </section>

      {/* ─── Trust Pillars ─── */}
      <section className="border-y border-border bg-background">
        <div className="max-w-7xl mx-auto px-8 lg:px-20 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {[
              { icon: Hospital, text: "Built for dental professionals" },
              { icon: Shield, text: "HIPAA-compliant and secure" },
              { icon: Zap, text: "60-second full mouth scan" },
              { icon: Users, text: "Dedicated care specialists" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="mono-label text-muted-foreground">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features (Bento Grid) ─── */}
      <section id="features" className="py-24 px-8 lg:px-20 bg-card">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal>
            <EyebrowLabel>PLATFORM FEATURES</EyebrowLabel>
          </ScrollReveal>
          <ScrollReveal delay={80}>
            <div className="flex items-start gap-6 mb-4 mt-4">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground">
                Everything you need to<br />scale your practice.
              </h2>
              <DecoDashedBox className="hidden md:block mt-2" />
            </div>
            <p className="font-body text-muted-foreground text-sm font-light max-w-xl mb-12 leading-relaxed">
              Trusted by orthodontists, general dentists, and specialists. 50% less chair time. 55% more revenue per visit.
            </p>
          </ScrollReveal>

          {/* Top 4 features accordion */}
          <div className="max-w-2xl">
            <Accordion type="single" collapsible>
              {features.slice(0, 4).map(({ icon: Icon, title, desc, accent }) => (
                <AccordionItem key={title} value={title} className="border-b border-border">
                  <AccordionTrigger className="hover:no-underline py-4 gap-3">
                    <span className="flex items-center gap-3">
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `${accent}14`, border: `1px solid ${accent}25` }}
                      >
                        <Icon className="w-4 h-4" style={{ color: accent }} />
                      </span>
                      <span className="font-display font-semibold text-foreground text-sm text-left">{title}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="font-body text-muted-foreground text-sm font-light leading-relaxed pl-11">{desc}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            <Link
              to="/features"
              className="inline-flex items-center gap-2 mt-6 mono-label text-primary hover:text-primary/80 transition-colors"
            >
              See all features <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section className="py-24 px-8 lg:px-20 bg-background">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal>
            <EyebrowLabel>TESTIMONIALS</EyebrowLabel>
          </ScrollReveal>
          <ScrollReveal delay={80}>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mt-4 mb-12">
              Practices that chose Arcline.
            </h2>
          </ScrollReveal>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: "Dr. Sarah Chen", specialty: "General Dentist", practice: "Bright Smile Family Dental", quote: "Chair time dropped by nearly half. Our hygienists can focus on what matters while Arcline handles the monitoring." },
              { name: "Dr. James Malkovich", specialty: "Orthodontist", practice: "Malkovich Orthodontics", quote: "Patient compliance went from our biggest headache to our greatest strength. The scan streaks keep them engaged." },
              { name: "Dr. Priya Nair", specialty: "Periodontist", practice: "Nair Periodontal Group", quote: "The AI analysis catches things I might miss on a busy day. It's like having a tireless second set of eyes." },
            ].map((t, i) => (
              <ScrollReveal key={t.name} delay={i * 100}>
                <div className="bg-card rounded-card border border-border p-6 h-full flex flex-col">
                  <div className="flex gap-0.5 mb-4">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} className="w-3.5 h-3.5 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="font-body text-muted-foreground text-sm font-light italic leading-relaxed flex-1 mb-6">"{t.quote}"</p>
                  <div>
                    <p className="font-display text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="font-body text-xs text-muted-foreground font-light">{t.specialty} · {t.practice}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Stats Strip ─── */}
      <section style={{ background: "hsl(216 32% 7%)" }}>
        <div className="max-w-7xl mx-auto px-8 lg:px-20 py-20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
            {[
              { end: 50, suffix: "%", label: "CHAIR TIME\nREDUCTION", orbColor: "hsla(256,67%,80%,0.15)" },
              { end: 55, suffix: "%+", label: "REVENUE PER\nVISIT INCREASE", orbColor: "hsla(228,100%,62%,0.15)" },
              { end: 60, suffix: " SEC", label: "FULL MOUTH\nSCAN TIME", orbColor: "hsla(330,50%,81%,0.15)" },
              { end: 94, suffix: "%", label: "AI ANALYSIS\nCONFIDENCE", orbColor: "hsla(228,100%,62%,0.15)" },
            ].map((s, i) => (
              <ScrollReveal key={i} delay={i * 120}>
                <div className="relative">
                  {/* Gradient orb behind stat */}
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: "50%",
                      background: `radial-gradient(circle, ${s.orbColor}, transparent 70%)`,
                      filter: "blur(30px)",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%,-50%)",
                    }}
                  />
                  <CountUpNumber
                    end={s.end}
                    suffix={s.suffix}
                    className="font-display font-black text-white block mb-3 text-6xl md:text-7xl relative z-10"
                  />
                  <span className="mono-label whitespace-pre-line" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {s.label}
                  </span>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section id="pricing" className="py-24 px-8 lg:px-20 bg-card">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal>
            <EyebrowLabel>PRICING</EyebrowLabel>
          </ScrollReveal>
          <ScrollReveal delay={80}>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mt-4 mb-4">Simple, transparent pricing.</h2>
            <p className="font-body text-muted-foreground text-sm font-light max-w-xl mb-16 leading-relaxed">
              Start with a 14-day free trial. No credit card required. Scale as your practice grows.
            </p>
          </ScrollReveal>

          {/* Mobile/Tablet carousel */}
          <div className="lg:hidden">
            <Carousel opts={{ align: "center", loop: true, startIndex: 1 }} setApi={setPricingApi}>
              <CarouselContent>
                {pricingPlans.map((plan) => (
                  <CarouselItem key={plan.name}>
                    <PricingCard plan={plan} />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
            <CarouselDots api={pricingApi} />
          </div>

          {/* Desktop grid */}
          <div className="hidden lg:grid lg:grid-cols-3 gap-6 items-start">
            {pricingPlans.map((plan, i) => (
              <ScrollReveal key={plan.name} delay={i * 100}>
                <PricingCard plan={plan} />
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Ecosystem Section ─── */}
      <section id="ecosystem" className="py-24 px-8 lg:px-20" style={{ background: "hsl(36 47% 97%)" }}>
        <div className="max-w-7xl mx-auto">
          <ScrollReveal><EyebrowLabel>ECOSYSTEM</EyebrowLabel></ScrollReveal>
          <ScrollReveal delay={80}>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mt-4 mb-4">One platform. Three suites.</h2>
            <p className="font-body text-muted-foreground text-sm font-light max-w-xl mb-12">
              Everything your practice needs — from patient monitoring to growth tools and smart automation.
            </p>
          </ScrollReveal>

          <div className="max-w-2xl">
            <Accordion type="single" collapsible>
              {[
                { name: "ArclineCare", desc: "Remote monitoring, AI scan analysis, video responses, and secure messaging for seamless patient care.", color: "hsl(228 100% 62%)" },
                { name: "ArclineGrowth", desc: "Virtual consultations, rapid referrals, and practice analytics to grow your patient base and revenue.", color: "hsl(43 50% 54%)" },
                { name: "ArclineThrive", desc: "Smart automations, compliance tracking, and broadcast messaging to keep your practice running efficiently.", color: "hsl(142 71% 45%)" },
              ].map((suite) => (
                <AccordionItem key={suite.name} value={suite.name} className="border-b border-border">
                  <AccordionTrigger className="hover:no-underline py-5 gap-3">
                    <span className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: suite.color }} />
                      <span className="font-display font-semibold text-foreground text-base">{suite.name}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="font-body text-muted-foreground text-sm font-light leading-relaxed pl-[22px]">{suite.desc}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* ─── Arcline Scope ─── */}
      <section className="py-24 px-8 lg:px-20 bg-card">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-0 rounded-card overflow-hidden border border-border">
            <div className="p-10 lg:p-16 flex flex-col justify-center" style={{ background: "hsl(216 32% 7%)" }}>
              <ScrollReveal>
                <span className="mono-label text-primary mb-4 block">HARDWARE</span>
                <h2 className="font-display text-3xl md:text-4xl font-bold text-white mb-4">Arcline Scope</h2>
                <p className="font-body text-white/50 text-sm font-light leading-relaxed mb-8 max-w-sm">
                  Clinical-grade intraoral scanner designed for remote dental monitoring. Compact, precise, and effortless to use.
                </p>
                <div className="flex flex-wrap gap-6 mb-8">
                  {[
                    { label: "SCAN TIME", value: "60 SEC", icon: Zap },
                    { label: "RESOLUTION", value: "1080P", icon: Scan },
                    { label: "CONNECTIVITY", value: "BLUETOOTH", icon: Bluetooth },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-primary" />
                      <div>
                        <span className="mono-label text-white/30 block">{label}</span>
                        <span className="mono-label text-white">{value}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setDemoOpen(true)}
                  className="rounded-pill mono-label px-6 py-3 text-white transition-colors w-fit"
                  style={{ border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)" }}
                >
                  Learn More
                </button>
              </ScrollReveal>
            </div>
            <div className="p-10 lg:p-16 flex items-center justify-center" style={{ background: "hsl(36 47% 97%)" }}>
              <div className="relative w-48 h-48 md:w-64 md:h-64">
                <div className="absolute inset-0 rounded-[32px] border-2 border-dashed border-border" />
                <div className="absolute inset-4 rounded-[24px] border border-border bg-card" />
                <div className="absolute inset-8 rounded-[16px] border border-primary/20 bg-primary/5 flex items-center justify-center">
                  <Scan className="w-10 h-10 text-primary/30" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Unified Dark CTA ─── */}
      <section
        id="cta"
        className="relative py-24 px-8 lg:px-20 overflow-hidden"
        style={{ background: "hsl(216 32% 7%)" }}
      >
        {/* Subtle radial glow */}
        <div className="absolute pointer-events-none" style={{ width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, hsla(228,100%,62%,0.15), transparent 70%)", filter: "blur(80px)", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />

        <div className="max-w-3xl mx-auto text-center relative z-10">
          <ScrollReveal>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-white mb-6">
              Ready to transform your practice?
            </h2>
            <p className="font-body text-white/50 text-lg font-light mb-10 max-w-xl mx-auto">
              Join thousands of dental professionals using Arcline to deliver better care remotely.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4 mb-10">
              <Link
                to="/signup"
                className="rounded-pill bg-primary text-primary-foreground mono-label px-8 py-3.5 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                style={{ boxShadow: "0 4px 24px hsla(228,100%,62%,0.35)" }}
              >
                Start Free Trial <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                className="rounded-pill mono-label px-8 py-3.5 text-white transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)" }}
              >
                Talk to Sales
              </button>
            </div>
            {/* Trust badges */}
            <div className="flex flex-wrap justify-center gap-6">
              {["No credit card required", "14-day free trial", "Cancel anytime"].map((badge) => (
                <span key={badge} className="flex items-center gap-2 mono-label text-white/40">
                  <Check className="w-3.5 h-3.5" /> {badge}
                </span>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ─── Provider CTA Bar ─── */}
      <section className="px-8 lg:px-20 py-12" style={{ background: "hsl(228 100% 62%)" }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="font-display text-white text-lg md:text-xl font-semibold text-center md:text-left">
            Join the growing network of practices using Arcline.
          </p>
          <button
            onClick={() => setDemoOpen(true)}
            className="rounded-pill bg-white text-foreground mono-label px-8 py-3.5 hover:bg-white/90 transition-colors flex-shrink-0"
          >
            Book a Discovery Call
          </button>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="py-16 px-8 lg:px-20 bg-background" style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            {/* Brand column */}
            <div className="col-span-2 md:col-span-1">
              <span className="flex items-center gap-2 mb-4">
                <span className="w-1.5 h-1.5 rounded-full animate-nav-dot-pulse" style={{ background: "hsl(228 100% 62%)" }} />
                <span className="font-mono uppercase text-foreground text-[11px]" style={{ letterSpacing: "0.25em" }}>ARCLINE</span>
              </span>
              <p className="font-body text-muted-foreground text-xs font-light leading-relaxed mb-4">
                Premium virtual dental care for modern practices.
              </p>
              <p className="font-body text-muted-foreground/50 mono-label font-light">© 2026 Arcline. All rights reserved.</p>
            </div>

            {/* Product */}
            <div>
              <span className="mono-label text-foreground/50 block mb-4">Product</span>
              <Link to="/features" className="block font-body text-muted-foreground text-sm font-light mb-2 hover:text-foreground transition-colors">Features</Link>
              <button onClick={() => scrollToSection("pricing")} className="block font-body text-muted-foreground text-sm font-light mb-2 hover:text-foreground transition-colors cursor-pointer bg-transparent border-none text-left p-0">Pricing</button>
              <Link to="/integrations" className="block font-body text-muted-foreground text-sm font-light mb-2 hover:text-foreground transition-colors">Integrations</Link>
            </div>

            {/* Company */}
            <div>
              <span className="mono-label text-foreground/50 block mb-4">Company</span>
              <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="block font-body text-muted-foreground text-sm font-light mb-2 hover:text-foreground transition-colors cursor-pointer bg-transparent border-none text-left p-0">About</button>
              <Link to="/blog" className="block font-body text-muted-foreground text-sm font-light mb-2 hover:text-foreground transition-colors">Blog</Link>
              <Link to="/careers" className="block font-body text-muted-foreground text-sm font-light mb-2 hover:text-foreground transition-colors">Careers</Link>
              <Link to="/contact" className="block font-body text-muted-foreground text-sm font-light mb-2 hover:text-foreground transition-colors">Contact</Link>
            </div>

            {/* Legal */}
            <div>
              <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-foreground/50 block mb-4">Legal</span>
              <Link to="/privacy" className="block font-body text-muted-foreground text-sm font-light mb-2 hover:text-foreground transition-colors">Privacy</Link>
              <Link to="/terms" className="block font-body text-muted-foreground text-sm font-light mb-2 hover:text-foreground transition-colors">Terms</Link>
              <Link to="/hipaa" className="block font-body text-muted-foreground text-sm font-light mb-2 hover:text-foreground transition-colors">HIPAA</Link>
              <Link to="/security" className="block font-body text-muted-foreground text-sm font-light mb-2 hover:text-foreground transition-colors">Security</Link>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-black/[0.06]">
            <div className="flex gap-4 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/50">
              <a href="#" className="hover:text-foreground transition-colors">Twitter</a>
              <a href="#" className="hover:text-foreground transition-colors">LinkedIn</a>
              <a href="#" className="hover:text-foreground transition-colors">Instagram</a>
            </div>
            <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/50">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "hsl(142 71% 45%)" }} />
              All systems operational
            </span>
          </div>
        </div>
      </footer>

      {/* ─── Book a Demo Modal ─── */}
      <Dialog open={demoOpen} onOpenChange={(open) => { setDemoOpen(open); if (!open) setDemoSubmitted(false); }}>
        <DialogContent className="sm:max-w-md rounded-card">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-semibold">
              {demoSubmitted ? "You're all set!" : "Book a Demo"}
            </DialogTitle>
            <DialogDescription>
              {demoSubmitted
                ? "We'll be in touch within 24 hours."
                : "Tell us about your practice and we'll schedule a personalized walkthrough."}
            </DialogDescription>
          </DialogHeader>
          {demoSubmitted ? (
            <div className="py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Check className="w-6 h-6 text-primary" />
              </div>
              <p className="font-body text-sm text-muted-foreground">A member of our team will reach out shortly.</p>
            </div>
          ) : (
            <form
              className="space-y-4 mt-2"
              onSubmit={(e) => {
                e.preventDefault();
                toast({ title: "Demo requested!", description: `We'll contact ${demoForm.email} within 24 hours.` });
                setDemoSubmitted(true);
              }}
            >
              <Input
                placeholder="Full name"
                value={demoForm.name}
                onChange={(e) => setDemoForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
              <Input
                type="email"
                placeholder="Work email"
                value={demoForm.email}
                onChange={(e) => setDemoForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
              <select
                value={demoForm.practiceType}
                onChange={(e) => setDemoForm((f) => ({ ...f, practiceType: e.target.value }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option>General Dentistry</option>
                <option>Orthodontics</option>
                <option>Periodontics</option>
                <option>Pediatric Dentistry</option>
                <option>DSO / Multi-Location</option>
                <option>Other</option>
              </select>
              <button
                type="submit"
                className="w-full rounded-pill bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-[0.15em] py-3 hover:bg-primary/90 transition-colors"
              >
                Book Call
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
