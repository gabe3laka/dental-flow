import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center justify-between px-6 py-5 border-b border-border">
        <Link to="/" className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "hsl(228 100% 62%)" }} />
          <span className="font-mono uppercase text-foreground text-[11px]" style={{ letterSpacing: "0.25em" }}>ARCLINE</span>
        </Link>
        <Link to="/" className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors">← Back to Home</Link>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-8">Privacy Policy</h1>
        <p className="font-body text-muted-foreground text-sm font-light mb-4">Last updated: February 23, 2026</p>

        <div className="space-y-8 font-body text-foreground/80 text-sm font-light leading-relaxed">
          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">1. Information We Collect</h2>
            <p>Arcline collects information you provide directly when you create an account, submit dental scans, communicate with your dental provider, or contact our support team. This includes your name, email address, dental images and videos, treatment information, and communication history.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">2. How We Use Your Information</h2>
            <p>We use your information to provide and improve our virtual dental care platform, facilitate communication between patients and dental professionals, perform AI-powered scan analysis, generate treatment insights, and send you important service updates.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">3. Data Storage & Security</h2>
            <p>All data is stored using Supabase with row-level security (RLS) policies. Dental scans and personal health information are encrypted at rest and in transit using AES-256 encryption. We employ strict access controls to ensure only authorized personnel can access your data.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">4. Third-Party Services</h2>
            <p>Arcline uses select third-party services to operate our platform, including cloud hosting (Supabase), AI analysis engines, and payment processing (Stripe). These services are bound by their own privacy policies and our data processing agreements.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">5. Cookies & Analytics</h2>
            <p>We use essential cookies to maintain your session and preferences. We may use analytics tools to understand how our platform is used and to improve our services. You can control cookie preferences through your browser settings.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">6. Your Rights</h2>
            <p>You have the right to access, correct, or delete your personal data at any time. You can export your data or request account deletion by contacting our support team. We will respond to all requests within 30 days.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">7. Contact Us</h2>
            <p>If you have questions about this Privacy Policy, please contact us at privacy@arcline.app.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
