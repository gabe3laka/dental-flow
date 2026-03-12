import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";

const TABLES_TO_COUNT = ["profiles", "patients", "scans", "scan_reviews", "messages", "subscriptions", "treatment_plans", "treatment_milestones"];

export default function AdminSystem() {
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [countingTables, setCountingTables] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("feature_flags").select("*").order("flag_key");
        setFlags(data || []);
      } catch (e) { logError(e, { operation: "AdminSystem/loadData" }); }
      finally { setLoading(false); }
    })();

    // Count rows per table
    (async () => {
      try {
        const counts: Record<string, number> = {};
        const tableResults = await Promise.allSettled(
          TABLES_TO_COUNT.map((table) =>
            supabase.from(table as any).select("id", { count: "exact", head: true }).then((res) => ({ table, res }))
          )
        );
        for (const result of tableResults) {
          if (result.status === "fulfilled") {
            counts[result.value.table] = result.value.res.count || 0;
          } else {
            logError(result.reason, { operation: "AdminSystem/countTableRows" });
            toast({ title: "Some settings failed to save", variant: "destructive" });
          }
        }
        setTableCounts(counts);
      } catch (e) { logError(e, { operation: "AdminSystem/loadData" }); }
      finally { setCountingTables(false); }
    })();
  }, []);

  const toggleFlag = async (id: string, enabled: boolean) => {
    await supabase.from("feature_flags").update({ enabled }).eq("id", id);
    setFlags(flags.map((f) => f.id === id ? { ...f, enabled } : f));
    toast({ title: `Flag ${enabled ? "enabled" : "disabled"}` });
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await supabase.functions.invoke("seed-users");
      toast({ title: "Seed complete", description: JSON.stringify(res.data) });
    } catch (e: any) {
      toast({ title: "Seed error", description: e.message, variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  const STORAGE_BUCKETS = [
    { name: "scan-videos", public: false },
    { name: "response-videos", public: false },
    { name: "profile-photos", public: true },
  ];

  return (
    <div>
      <span className="mono-label" style={{ color: "hsl(0 84% 60%)" }}>SYSTEM</span>
      <h1 className="font-display text-3xl font-semibold mt-1 mb-8">System Management</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Feature flags */}
        <div>
          <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>FEATURE FLAGS</span>
          <div className="rounded-card overflow-hidden" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
            {loading ? <div className="p-4"><Skeleton className="h-20" /></div> : flags.length === 0 ? (
              <div className="p-6 text-center"><p className="text-sm" style={{ color: "hsl(38 23% 90% / 0.3)" }}>No feature flags.</p></div>
            ) : flags.map((f) => (
              <div key={f.id} className="flex items-center justify-between p-4 border-b" style={{ borderColor: "hsl(0 0% 100% / 0.04)" }}>
                <div>
                  <p className="font-mono text-xs">{f.flag_key}</p>
                  {f.description && <p className="text-xs mt-1" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{f.description}</p>}
                </div>
                <Switch checked={f.enabled} onCheckedChange={(v) => toggleFlag(f.id, v)} />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          {/* Tools */}
          <div>
            <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>TOOLS</span>
            <div className="rounded-card p-6 space-y-4" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
              <div>
                <span className="mono-label block mb-2" style={{ color: "hsl(38 23% 90% / 0.45)" }}>SEED TEST USERS</span>
                <p className="text-xs mb-3" style={{ color: "hsl(38 23% 90% / 0.3)" }}>Creates user@test.com, doctor@test.com, admin@test.com test accounts.</p>
                <Button onClick={handleSeed} disabled={seeding} className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]" style={{ background: "hsl(0 84% 60%)", color: "white" }}>
                  {seeding ? "Seeding..." : "Run Seed"}
                </Button>
              </div>
            </div>
          </div>

          {/* Storage Buckets */}
          <div>
            <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>STORAGE BUCKETS</span>
            <div className="rounded-card overflow-hidden" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
              {STORAGE_BUCKETS.map((b) => (
                <div key={b.name} className="flex items-center justify-between p-4 border-b" style={{ borderColor: "hsl(0 0% 100% / 0.04)" }}>
                  <div>
                    <p className="font-mono text-xs">{b.name}</p>
                    <span className="mono-label" style={{ color: b.public ? "hsl(142 71% 45%)" : "hsl(38 23% 90% / 0.3)" }}>
                      {b.public ? "PUBLIC" : "PRIVATE"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* DB Row Counts */}
          <div>
            <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>DATABASE ROW COUNTS</span>
            <div className="rounded-card overflow-hidden" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
              {countingTables ? <div className="p-4"><Skeleton className="h-20" /></div> : TABLES_TO_COUNT.map((t) => (
                <div key={t} className="flex items-center justify-between p-3 border-b" style={{ borderColor: "hsl(0 0% 100% / 0.04)" }}>
                  <span className="font-mono text-xs">{t}</span>
                  <span className="font-mono text-xs" style={{ color: "hsl(228 100% 62%)" }}>{tableCounts[t] ?? "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
