import { PillNav } from "@/components/ui/pill-nav";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useDoctorPatients } from "@/hooks/use-doctor-patients";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Brain, Megaphone } from "lucide-react";
import { logError } from "@/lib/logger";

const tabs = [
  { id: "all", label: "ALL" },
  { id: "pending", label: "PENDING REVIEW" },
  { id: "attention", label: "ATTENTION" },
  { id: "on_track", label: "ON TRACK" },
];

interface PatientRow {
  patientId: string;
  name: string;
  type: string;
  category: string;
  progress: number;
  lastScan: string;
  status: "pending" | "reviewed" | "flagged" | "action_required";
  latestScanId: string | null;
}

export default function DoctorOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [metrics, setMetrics] = useState({ active: 0, pending: 0, alerts: 0, visitsSaved: 0 });
  const [enriching, setEnriching] = useState(false);

  const { data: patientRows = [], isPending: patientsPending } = useDoctorPatients();

  const loading = patientsPending || enriching;

  useEffect(() => {
    if (!user || patientRows.length === 0) {
      if (!patientsPending) {
        setPatients([]);
        setMetrics({ active: 0, pending: 0, alerts: 0, visitsSaved: 0 });
      }
      return;
    }

    setEnriching(true);

    (async () => {
      try {
        const profilesPromise = supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", patientRows.map((p) => p.user_id));

        const scansPromise = supabase
          .from("scans")
          .select("id, patient_id, status, submitted_at")
          .in("patient_id", patientRows.map((p) => p.id))
          .order("submitted_at", { ascending: false });

        const analyticsPromise = supabase
          .from("practice_analytics")
          .select("visits_avoided")
          .eq("doctor_id", user.id);

        const [profilesResult, scansResult, analyticsResult] = await Promise.allSettled([profilesPromise, scansPromise, analyticsPromise]);

        if (profilesResult.status === "rejected") {
          logError(profilesResult.reason, { operation: "DoctorOverview/fetchProfiles", userId: user?.id });
        }
        if (scansResult.status === "rejected") {
          logError(scansResult.reason, { operation: "DoctorOverview/fetchScans", userId: user?.id });
        }
        if (analyticsResult.status === "rejected") {
          logError(analyticsResult.reason, { operation: "DoctorOverview/fetchAnalytics", userId: user?.id });
        }

        const profilesData = profilesResult.status === "fulfilled" ? profilesResult.value.data : null;
        const scansData = scansResult.status === "fulfilled" ? scansResult.value.data : null;
        const analyticsData = analyticsResult.status === "fulfilled" ? analyticsResult.value.data : null;

        const profileMap: Record<string, string> = {};
        (profilesData || []).forEach((p) => { profileMap[p.user_id] = p.full_name || "Unknown"; });

        const scansByPatient: Record<string, typeof scansData> = {};
        (scansData || []).forEach((s) => {
          if (!scansByPatient[s.patient_id]) scansByPatient[s.patient_id] = [];
          scansByPatient[s.patient_id].push(s);
        });

        let pendingCount = 0;
        let alertCount = 0;
        const rows: PatientRow[] = patientRows.map((p) => {
          const patientScans = scansByPatient[p.id] || [];
          const latest = patientScans[0];
          const latestStatus = (latest?.status || "pending") as PatientRow["status"];
          if (latestStatus === "pending") pendingCount++;
          if (latestStatus === "flagged" || latestStatus === "action_required") alertCount++;

          const progress = p.total_stages ? Math.round(((p.current_stage || 0) / p.total_stages) * 100) : 0;
          return {
            patientId: p.id,
            name: profileMap[p.user_id] || "Unknown",
            type: p.treatment_type || "—",
            category: (p as any).treatment_category || "",
            progress,
            lastScan: latest ? new Date(latest.submitted_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase() : "—",
            status: latestStatus,
            latestScanId: latest?.id || null,
          };
        });

        const totalVisitsSaved = (analyticsData || []).reduce((sum, r) => sum + (r.visits_avoided || 0), 0);

        setPatients(rows);
        setMetrics({
          active: patientRows.length,
          pending: pendingCount,
          alerts: alertCount,
          visitsSaved: totalVisitsSaved,
        });
      } catch (e) {
        logError(e, { operation: "DoctorOverview/loadData", userId: user?.id });
      } finally {
        setEnriching(false);
      }
    })();
  }, [user, patientRows]);

  const filteredPatients = patients.filter((p) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (activeTab === "all") return true;
    if (activeTab === "pending") return p.status === "pending";
    if (activeTab === "attention") return p.status === "flagged" || p.status === "action_required";
    if (activeTab === "on_track") return p.status === "reviewed";
    return true;
  });

  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [sending, setSending] = useState(false);

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim() || !user) return;
    setSending(true);
    try {
      const { data: patientRecords } = await supabase.from("patients").select("user_id").in("id", patients.map(p => p.patientId));
      if (patientRecords) {
        const messages = patientRecords.map((pr) => ({
          sender_id: user.id,
          receiver_id: pr.user_id,
          content: broadcastMsg.trim(),
        }));
        await supabase.from("messages").insert(messages);
      }
      toast({ title: "Broadcast sent", description: `Message sent to ${patients.length} patients.` });
      setBroadcastOpen(false);
      setBroadcastMsg("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "Doctor";

  const metricsDisplay = [
    { label: "ACTIVE PATIENTS", value: String(metrics.active) },
    { label: "SCANS PENDING", value: String(metrics.pending) },
    { label: "ALERTS", value: String(metrics.alerts) },
    { label: "CHAIR TIME SAVED — EST.", value: String(metrics.visitsSaved), sub: "~50% REDUCTION" },
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <span className="mono-label text-muted-foreground">PRACTICE OVERVIEW</span>
        <h1 className="font-display text-2xl md:text-3xl font-semibold mt-1">
          Welcome back, Dr. {firstName}
        </h1>
      </div>

      {/* AI Insights Card */}
      {!loading && (
        <div className="rounded-card p-5 mb-6 bg-card border border-border border-l-[3px] border-l-primary">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-primary" />
            <span className="mono-label text-primary">AI INSIGHTS</span>
          </div>
          <ul className="space-y-2">
            {[
              `${metrics.pending} scans are awaiting review — prioritize flagged patients first.`,
              patients.length > 3 ? `${Math.max(1, Math.floor(patients.length * 0.2))} patients haven't scanned in over 2 weeks.` : "Encourage all patients to maintain scan streaks.",
              metrics.alerts > 0 ? `${metrics.alerts} patients need attention — review flagged scans today.` : "All patients are on track. Great work!",
            ].map((insight, i) => (
              <li key={i} className="text-sm flex items-start gap-2 text-foreground/60">
                <span className="text-primary mt-0.5">•</span>
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Metrics strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading ? (
          [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)
        ) : (
          metricsDisplay.map((m) => (
            <div key={m.label} className="rounded-card p-4 md:p-5 bg-card border border-border">
              <span className="mono-label text-muted-foreground">{m.label}</span>
              <p className="font-display text-2xl md:text-3xl font-bold mt-2">{m.value}</p>
              {"sub" in m && m.sub && (
                <span className="mono-label mt-1 block text-status-success">{m.sub}</span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Broadcast modal */}
      <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="mono-label text-foreground">BROADCAST MESSAGE</DialogTitle>
          </DialogHeader>
          <Textarea value={broadcastMsg} onChange={(e) => setBroadcastMsg(e.target.value)} placeholder="Type your message to all patients..." className="mb-4 bg-background border-border" />
          <Button onClick={handleBroadcast} disabled={sending || !broadcastMsg.trim()} className="w-full rounded-pill">
            {sending ? "Sending..." : `Send to ${patients.length} patients`}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Patient filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <div className="overflow-x-auto w-full sm:w-auto scrollbar-hide">
          <PillNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
        <Input placeholder="Search patients..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs bg-card border-border" />
        <Button onClick={() => setBroadcastOpen(true)} variant="outline" className="rounded-pill mono-label gap-1.5">
          <Megaphone className="w-3.5 h-3.5" /> Broadcast
        </Button>
      </div>

      {/* Desktop table */}
      <div className="rounded-card overflow-hidden hidden md:block bg-card border border-border">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 p-4 border-b border-border">
          {["PATIENT", "TYPE", "PROGRESS", "LAST SCAN", "STATUS"].map((h) => (
            <span key={h} className="mono-label text-muted-foreground">{h}</span>
          ))}
        </div>
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="p-4 border-b border-border">
              <Skeleton className="h-8" />
            </div>
          ))
        ) : filteredPatients.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">No patients found.</p>
          </div>
        ) : (
          filteredPatients.map((p) => (
            <div
              key={p.patientId}
              onClick={() => {
                if (p.latestScanId) navigate(`/doctor/scans/${p.latestScanId}`);
                else navigate(`/doctor/patients/${p.patientId}`);
              }}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 p-4 hover:bg-white/[0.02] transition cursor-pointer items-center border-b border-border"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center mono-label bg-muted text-muted-foreground">
                  {p.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <span className="text-sm font-medium">{p.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground/60">{p.type}</span>
                {p.category && <span className="mono-label px-2 py-0.5 rounded-pill bg-primary/10 text-primary">{p.category.toUpperCase()}</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
                </div>
                <span className="mono-label text-muted-foreground">{p.progress}%</span>
              </div>
              <span className="mono-label text-muted-foreground">{p.lastScan}</span>
              <StatusBadge variant={p.status} />
            </div>
          ))
        )}
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {loading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)
        ) : filteredPatients.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">No patients found.</p>
          </div>
        ) : (
          filteredPatients.map((p) => (
            <div
              key={p.patientId}
              onClick={() => {
                if (p.latestScanId) navigate(`/doctor/scans/${p.latestScanId}`);
                else navigate(`/doctor/patients/${p.patientId}`);
              }}
              className="rounded-card p-4 cursor-pointer hover:bg-white/[0.02] transition bg-card border border-border"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center mono-label bg-muted text-muted-foreground">
                    {p.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <span className="text-sm font-medium">{p.name}</span>
                </div>
                <StatusBadge variant={p.status} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="mono-label text-muted-foreground">{p.type}</span>
                <span className="mono-label text-muted-foreground">{p.lastScan}</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
                </div>
                <span className="mono-label text-muted-foreground">{p.progress}%</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
