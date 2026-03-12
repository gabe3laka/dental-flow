import { Link } from "react-router-dom";

export default function Blog() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="flex items-center justify-between px-6 py-5 border-b border-border">
        <Link to="/" className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "hsl(228 100% 62%)" }} />
          <span className="font-mono uppercase text-foreground text-[11px]" style={{ letterSpacing: "0.25em" }}>ARCLINE</span>
        </Link>
        <Link to="/" className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors">← Back to Home</Link>
      </nav>
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-3xl font-bold text-foreground mb-3">Blog</h1>
        <p className="font-body text-muted-foreground text-sm font-light">Coming soon.</p>
      </main>
    </div>
  );
}
