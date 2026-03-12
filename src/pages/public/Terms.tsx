import { Link } from "react-router-dom";

export default function Terms() {
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
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-8">Terms of Service</h1>
        <p className="font-body text-muted-foreground text-sm font-light mb-4">Last updated: February 23, 2026</p>

        <div className="space-y-8 font-body text-foreground/80 text-sm font-light leading-relaxed">
          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using the Arcline platform, you agree to be bound by these Terms of Service. Arcline provides a virtual dental care platform connecting dental professionals with patients for remote monitoring, AI-powered scan analysis, and secure communication.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">2. Account Registration</h2>
            <p>You must provide accurate and complete information when creating an account. You are responsible for maintaining the security of your account credentials. Dental professionals must verify their credentials and licensure before accessing provider features.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">3. Use of Services</h2>
            <p>Arcline is designed to supplement, not replace, in-person dental care. The AI analysis provided is for informational purposes and should be reviewed by a licensed dental professional. Users agree not to misuse the platform or submit fraudulent information.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">4. Subscription & Billing</h2>
            <p>Dental practices subscribe to Arcline on a monthly basis. Pricing is based on the selected plan tier (Starter, Professional, or Enterprise). All subscriptions include a 14-day free trial. You may cancel at any time; access continues until the end of the billing period.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">5. Intellectual Property</h2>
            <p>The Arcline platform, including its AI models, interface design, and documentation, is the intellectual property of Arcline. Users retain ownership of their dental images and health data submitted to the platform.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">6. Limitation of Liability</h2>
            <p>Arcline is provided "as is" without warranties of any kind. We are not liable for clinical decisions made based on AI analysis. Dental professionals remain solely responsible for patient care decisions.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">7. Termination</h2>
            <p>We reserve the right to suspend or terminate accounts that violate these terms. Upon termination, you may request an export of your data within 30 days.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
