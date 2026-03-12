import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";

export default function AdminSupport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [flaggedScans, setFlaggedScans] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [recentSignups, setRecentSignups] = useState<any[]>([]);
  const [impersonateEmail, setImpersonateEmail] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const [scansResult, notesResult, signupsResult] = await Promise.allSettled([
          supabase.from("scans").select("id, patient_id, status, submitted_at").eq("status", "flagged").order("submitted_at", { ascending: false }).limit(20),
          supabase.from("admin_notes").select("*").order("created_at", { ascending: false }).limit(20),
          supabase.from("profiles").select("user_id, full_name, created_at").gte("created_at", sevenDaysAgo.toISOString()).order("created_at", { ascending: false }).limit(10),
        ]);

        if (scansResult.status === "rejected") {
          logError(scansResult.reason, { operation: "AdminSupport/fetchScans" });
        }
        if (notesResult.status === "rejected") {
          logError(notesResult.reason, { operation: "AdminSupport/fetchNotes" });
        }
        if (signupsResult.status === "rejected") {
          logError(signupsResult.reason, { operation: "AdminSupport/fetchSignups" });
        }

        // Enrich flagged scans with patient + doctor names
        const scanData = scansResult.status === "fulfilled" ? (scansResult.value.data || []) : [];
        if (scanData.length > 0) {
          const patientIds = scanData.map((s) => s.patient_id);
          const { data: patients } = await supabase.from("patients").select("id, user_id, assigned_doctor_id").in("id", patientIds);
          const allUserIds = new Set<string>();
          (patients || []).forEach((p) => {
            allUserIds.add(p.user_id);
            if (p.assigned_doctor_id) allUserIds.add(p.assigned_doctor_id);
          });
          const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", Array.from(allUserIds));
          const nameMap: Record<string, string> = {};
          (profiles || []).forEach((p) => { nameMap[p.user_id] = p.full_name || "Unknown"; });
          const patientMap: Record<string, any> = {};
          (patients || []).forEach((p) => { patientMap[p.id] = p; });

          setFlaggedScans(scanData.map((s) => ({
            ...s,
            patientName: nameMap[patientMap[s.patient_id]?.user_id] || "Unknown",
            doctorName: nameMap[patientMap[s.patient_id]?.assigned_doctor_id] || "Unassigned",
          })));
        } else {
          setFlaggedScans([]);
        }

        setNotes(notesResult.status === "fulfilled" ? (notesResult.value.data || []) : []);
        setRecentSignups(signupsResult.status === "fulfilled" ? (signupsResult.value.data || []) : []);
      } catch (e) { logError(e, { operation: "AdminSupport/loadData" }); }
      finally { setLoading(false); }
    })();
  }, []);

  const addNote = async () => {
    if (!newNote.trim() || !user) return;
    try {
      const { error } = await supabase.from("admin_notes").insert({
        admin_id: user.id,
        content: newNote.trim(),
        target_id: user.id,
        target_type: "general",
      });
      if (error) throw error;
      setNotes([{ id: crypto.randomUUID(), content: newNote.trim(), created_at: new Date().toISOString(), admin_id: user.id, target_type: "general", target_id: user.id }, ...notes]);
      setNewNote("");
      toast({ title: "Note added" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div>
      <span className="mono-label" style={{ color: "hsl(0 84% 60%)" }}>SUPPORT</span>
      <h1 className="font-display text-3xl font-semibold mt-1 mb-8">Support Tools</h1>

      {/* Impersonation Search */}
      <div className="rounded-card p-6 mb-6" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
        <span className="mono-label mb-3 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>IMPERSONATION TOOL</span>
        <div className="flex gap-2">
          <Input
            value={impersonateEmail}
            onChange={(e) => setImpersonateEmail(e.target.value)}
            placeholder="Search user by email..."
            className="bg-card border-border text-foreground flex-1"
          />
          <Button
            onClick={async () => {
              if (!impersonateEmail.trim() || !user) return;
              // Find user by email from profiles
              const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").limit(50);
              // Find matching user role
              const { data: allRoles } = await supabase.from("user_roles").select("user_id, role");
              // Match by searching full_name or trying email
              const match = profiles?.find((p) => p.full_name?.toLowerCase().includes(impersonateEmail.toLowerCase()));
              if (!match) { toast({ title: "User not found" }); return; }
              const role = allRoles?.find((r) => r.user_id === match.user_id);
              
              // Log impersonation
              const { data: logEntry } = await supabase.from("impersonation_log").insert({
                admin_id: user.id,
                target_user_id: match.user_id,
                reason: "Admin impersonation via support tool",
              }).select("id").single();

              sessionStorage.setItem("impersonating_user_id", match.user_id);
              sessionStorage.setItem("impersonating_email", match.full_name || impersonateEmail);
              if (logEntry) sessionStorage.setItem("impersonation_log_id", logEntry.id);

              const targetPath = role?.role === "doctor" ? "/doctor" : "/patient";
              navigate(targetPath);
            }}
            className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]"
            style={{ background: "hsl(0 84% 60%)", color: "white" }}
          >
            Impersonate
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Flagged scans */}
        <div>
          <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>FLAGGED SCANS</span>
          <div className="rounded-card overflow-hidden" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
            {loading ? <div className="p-4"><Skeleton className="h-20" /></div> : flaggedScans.length === 0 ? (
              <div className="p-6 text-center"><p className="text-sm" style={{ color: "hsl(38 23% 90% / 0.3)" }}>No flagged scans.</p></div>
            ) : flaggedScans.map((s) => (
              <div key={s.id} className="p-4 border-b" style={{ borderColor: "hsl(0 0% 100% / 0.04)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{s.patientName}</span>
                  <span className="mono-label" style={{ color: "hsl(38 92% 50%)" }}>FLAGGED</span>
                </div>
                <div className="flex gap-4">
                  <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>DR: {s.doctorName}</span>
                  <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>{new Date(s.submitted_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          {/* Recent Signups */}
          <div>
            <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>RECENT SIGNUPS (7D)</span>
            <div className="rounded-card overflow-hidden" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
              {loading ? <div className="p-4"><Skeleton className="h-16" /></div> : recentSignups.length === 0 ? (
                <div className="p-6 text-center"><p className="text-sm" style={{ color: "hsl(38 23% 90% / 0.3)" }}>No signups in last 7 days.</p></div>
              ) : recentSignups.map((s) => (
                <div key={s.user_id} className="p-4 border-b flex items-center justify-between" style={{ borderColor: "hsl(0 0% 100% / 0.04)" }}>
                  <span className="text-sm">{s.full_name || "Unknown"}</span>
                  <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Admin notes */}
          <div>
            <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>ADMIN NOTES</span>
            <div className="mb-4">
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add an admin note..."
                className="bg-card border-border text-foreground mb-2"
              />
              <Button onClick={addNote} className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]" style={{ background: "hsl(0 84% 60%)", color: "white" }}>
                Add Note
              </Button>
            </div>
            <div className="space-y-2">
              {notes.map((n) => (
                <div key={n.id} className="rounded-card p-4" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
                  <p className="text-sm font-body">{n.content}</p>
                  <span className="mono-label mt-2 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
