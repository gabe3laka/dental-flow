import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";

const TEMPLATES = [
  { name: "Missed Scan Reminder", trigger_type: "no_scan", trigger_days: 3, action_type: "send_message", message_template: "Hi {patient_name}, we noticed you haven't submitted a scan in {days} days. Please scan today to stay on track!" },
  { name: "Weekly Check-in", trigger_type: "recurring", trigger_days: 7, action_type: "send_message", message_template: "Hi {patient_name}, it's time for your weekly check-in scan. How is your treatment going?" },
  { name: "Compliance Alert", trigger_type: "low_compliance", trigger_days: 5, action_type: "send_message", message_template: "Hi {patient_name}, your scan compliance has dropped. Regular scans help us monitor your progress effectively." },
];

export default function Automations() {
  const { user } = useAuth();
  const [automations, setAutomations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrigger, setNewTrigger] = useState("no_scan");
  const [newDays, setNewDays] = useState("7");
  const [newAction, setNewAction] = useState("send_message");
  const [newTemplate, setNewTemplate] = useState("");
  const [addingAutomation, setAddingAutomation] = useState(false);
  const [addingTemplate, setAddingTemplate] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("automations").select("*").eq("doctor_id", user.id).order("created_at", { ascending: false });
      setAutomations(data || []);
      setLoading(false);
    })();
  }, [user]);

  const addAutomation = async () => {
    if (!user || !newName.trim() || addingAutomation) return;
    setAddingAutomation(true);
    try {
      const { data, error } = await supabase.from("automations").insert({
        doctor_id: user.id, name: newName, trigger_type: newTrigger, trigger_days: parseInt(newDays) || 7, action_type: newAction, message_template: newTemplate,
      }).select().single();
      if (error) throw error;
      setAutomations([data, ...automations]);
      setShowAdd(false); setNewName(""); setNewTemplate("");
      toast({ title: "Automation created" });
    } catch (e: any) {
      logError(e, { operation: "Automations.addAutomation", userId: user?.id });
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAddingAutomation(false);
    }
  };

  const toggleAutomation = async (id: string, enabled: boolean) => {
    await supabase.from("automations").update({ enabled }).eq("id", id);
    setAutomations(automations.map((a) => a.id === id ? { ...a, enabled } : a));
  };

  const addTemplate = async (t: typeof TEMPLATES[0]) => {
    if (!user || addingTemplate === t.name) return;
    setAddingTemplate(t.name);
    try {
      const { data, error } = await supabase.from("automations").insert({ doctor_id: user.id, ...t }).select().single();
      if (error) throw error;
      if (data) { setAutomations([data, ...automations]); toast({ title: `Added: ${t.name}` }); }
    } catch (e: any) {
      logError(e, { operation: "Automations.addTemplate", userId: user?.id });
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAddingTemplate(null);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <span className="mono-label" style={{ color: "hsl(228 100% 62%)" }}>ARCLINETHRIVE</span>
        <h1 className="font-display text-3xl font-semibold mt-1 mb-2">Smart Automations</h1>
        <p className="text-sm mb-8" style={{ color: "hsl(38 23% 90% / 0.45)" }}>Automate patient communication and follow-ups.</p>

        {/* Quick-add templates */}
        <div className="mb-8">
          <span className="mono-label mb-3 block" style={{ color: "hsl(38 23% 90% / 0.45)" }}>QUICK ADD TEMPLATES</span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.name}
                onClick={() => addTemplate(t)}
                disabled={addingTemplate === t.name}
                className="rounded-card p-4 text-left transition disabled:opacity-50"
                style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "hsl(228 100% 62% / 0.3)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "hsl(0 0% 100% / 0.07)"; }}
              >
                <p className="text-sm font-medium mb-1">{addingTemplate === t.name ? "Adding..." : t.name}</p>
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>Every {t.trigger_days}d · {t.action_type.replace("_", " ")}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>YOUR AUTOMATIONS</span>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)} className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]" style={{ background: "hsl(228 100% 62%)", color: "white" }}>
            {showAdd ? "Cancel" : "Add Custom"}
          </Button>
        </div>

        {showAdd && (
          <div className="rounded-card p-6 mb-4 space-y-3" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Automation name" style={{ background: "hsl(216 32% 7%)", borderColor: "hsl(0 0% 100% / 0.07)" }} />
            <div className="flex gap-2">
              <Input value={newDays} onChange={(e) => setNewDays(e.target.value)} placeholder="Days" type="number" className="w-20" style={{ background: "hsl(216 32% 7%)", borderColor: "hsl(0 0% 100% / 0.07)" }} />
              <span className="self-center text-sm" style={{ color: "hsl(38 23% 90% / 0.45)" }}>days after trigger</span>
            </div>
            <Textarea value={newTemplate} onChange={(e) => setNewTemplate(e.target.value)} placeholder="Message template..." style={{ background: "hsl(216 32% 7%)", borderColor: "hsl(0 0% 100% / 0.07)" }} />
            <Button onClick={addAutomation} disabled={!newName.trim() || addingAutomation} className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]" style={{ background: "hsl(228 100% 62%)", color: "white" }}>
              {addingAutomation ? "Creating..." : "Create"}
            </Button>
          </div>
        )}

        {loading ? [1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-card mb-3" />) : automations.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: "hsl(38 23% 90% / 0.45)" }}>No automations configured. Use a template above to get started.</p>
        ) : automations.map((a) => (
          <div key={a.id} className="rounded-card p-5 mb-3 flex items-center justify-between" style={{ background: "hsl(218 26% 11%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
            <div>
              <p className="text-sm font-medium">{a.name}</p>
              <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{a.trigger_type.replace("_", " ").toUpperCase()} · {a.trigger_days}D · {a.action_type.replace("_", " ").toUpperCase()}</span>
            </div>
            <Switch checked={a.enabled} onCheckedChange={(checked) => toggleAutomation(a.id, checked)} />
          </div>
        ))}
      </div>
    </div>
  );
}
