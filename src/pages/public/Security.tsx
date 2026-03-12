import { Link } from "react-router-dom";
import { Shield, Lock, Eye, Server } from "lucide-react";

export default function Security() {
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
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">Security</h1>
        <p className="font-body text-muted-foreground text-sm font-light mb-12">How we protect your data and ensure platform integrity.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {[
            { icon: Lock, title: "Encryption", desc: "All data is encrypted at rest (AES-256) and in transit (TLS 1.3). Dental scans and PHI are stored with additional encryption layers." },
            { icon: Shield, title: "Row-Level Security", desc: "Supabase RLS policies ensure users can only access their own data. Doctors see only their assigned patients." },
            { icon: Eye, title: "Access Controls", desc: "Role-based access control separates patient, doctor, and admin permissions. All access is logged and auditable." },
            { icon: Server, title: "Infrastructure", desc: "Hosted on Supabase with automated backups, DDoS protection, and 99.9% uptime SLA. SOC 2 Type II certification in progress." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-card border border-border p-6 bg-card">
              <Icon className="w-5 h-5 text-primary mb-3" />
              <h3 className="font-display text-lg font-semibold text-foreground mb-2">{title}</h3>
              <p className="font-body text-muted-foreground text-sm font-light leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <div className="space-y-6 font-body text-foreground/80 text-sm font-light leading-relaxed">
          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">Vulnerability Disclosure</h2>
            <p>If you discover a security vulnerability, please report it to security@arcline.app. We commit to acknowledging reports within 24 hours and providing a resolution timeline within 72 hours.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground mb-3">Compliance</h2>
            <p>Arcline is designed with HIPAA compliance in mind. We maintain Business Associate Agreements (BAAs) with all infrastructure providers and implement technical safeguards required by the HIPAA Security Rule.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
