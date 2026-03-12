import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, format } from "date-fns";
import { logError } from "@/lib/logger";

interface PatientRow {
  id: string;
  name: string;
  treatmentType: string;
  treatmentCategory: string;
  doctorName: string;
  joinDate: string | null;
  lastScan: string | null;
  complianceScore: number | null;
}

export default function AdminPatients() {
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: patientRows } = await supabase.from("patients").select("id, user_id, treatment_type, treatment_category, assigned_doctor_id, created_at, compliance_streak");
        if (!patientRows?.length) { setLoading(false); return; }

        const userIds = [...new Set([...patientRows.map((p) => p.user_id), ...patientRows.filter((p) => p.assigned_doctor_id).map((p) => p.assigned_doctor_id!)])];
        const [profilesResult, scansResult] = await Promise.allSettled([
          supabase.from("profiles").select("user_id, full_name").in("user_id", userIds),
          supabase.from("scans").select("patient_id, submitted_at").in("patient_id", patientRows.map((p) => p.id)).order("submitted_at", { ascending: false }),
        ]);

        if (profilesResult.status === "rejected") {
          logError(profilesResult.reason, { operation: "AdminPatients/fetchProfiles" });
        }
        if (scansResult.status === "rejected") {
          logError(scansResult.reason, { operation: "AdminPatients/fetchScans" });
        }

        const profilesData = profilesResult.status === "fulfilled" ? profilesResult.value.data : null;
        const scansData = scansResult.status === "fulfilled" ? scansResult.value.data : null;

        const nameMap: Record<string, string> = {};
        (profilesData || []).forEach((p) => { nameMap[p.user_id] = p.full_name || "Unknown"; });

        const lastScanMap: Record<string, string> = {};
        (scansData || []).forEach((s) => {
          if (!lastScanMap[s.patient_id]) lastScanMap[s.patient_id] = s.submitted_at;
        });

        setPatients(patientRows.map((p) => ({
          id: p.id,
          name: nameMap[p.user_id] || "Unknown",
          treatmentType: p.treatment_type || "—",
          treatmentCategory: p.treatment_category || "—",
          doctorName: p.assigned_doctor_id ? (nameMap[p.assigned_doctor_id] || "—") : "Unassigned",
          joinDate: p.created_at,
          lastScan: lastScanMap[p.id] || null,
          complianceScore: p.compliance_streak != null ? Math.min(p.compliance_streak * 5, 100) : null,
        })));
      } catch (e) { logError(e, { operation: "AdminPatients/loadData" }); }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = patients.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  const getComplianceColor = (score: number | null) => {
    if (score == null) return "hsl(38 23% 90% / 0.3)";
    if (score >= 80) return "hsl(142 71% 45%)";
    if (score >= 60) return "hsl(38 92% 50%)";
    return "hsl(0 84% 60%)";
  };

  return (
    <div>
      <span className="mono-label" style={{ color: "hsl(0 84% 60%)" }}>PATIENTS</span>
      <h1 className="font-display text-3xl font-semibold mt-1 mb-6">All Patients</h1>

      <Input placeholder="Search patients..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm mb-6 bg-card border-border text-foreground" />

      <div className="rounded-card overflow-hidden" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_0.8fr] gap-4 p-4 border-b" style={{ borderColor: "hsl(0 0% 100% / 0.06)" }}>
          {["PATIENT", "TYPE", "CATEGORY", "DOCTOR", "JOINED", "LAST SCAN", "COMPLIANCE"].map((h) => (
            <span key={h} className="mono-label" style={{ color: "hsl(38 23% 90% / 0.3)" }}>{h}</span>
          ))}
        </div>
        {loading ? [1, 2, 3].map((i) => <div key={i} className="p-4"><Skeleton className="h-8" /></div>) : filtered.length === 0 ? (
          <div className="p-8 text-center"><p className="text-sm" style={{ color: "hsl(38 23% 90% / 0.3)" }}>No patients found.</p></div>
        ) : filtered.map((p) => (
          <div key={p.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_0.8fr] gap-4 p-4 border-b items-center" style={{ borderColor: "hsl(0 0% 100% / 0.04)" }}>
            <span className="text-sm font-medium">{p.name}</span>
            <span className="text-sm" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{p.treatmentType}</span>
            <span className="text-sm" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{p.treatmentCategory}</span>
            <span className="text-sm" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{p.doctorName}</span>
            <span className="font-mono text-[10px]" style={{ color: "hsl(38 23% 90% / 0.45)" }}>
              {p.joinDate ? format(new Date(p.joinDate), "dd MMM yyyy").toUpperCase() : "—"}
            </span>
            <span className="font-mono text-[10px]" style={{ color: "hsl(38 23% 90% / 0.45)" }}>
              {p.lastScan ? formatDistanceToNow(new Date(p.lastScan), { addSuffix: true }) : "—"}
            </span>
            <span className="mono-label px-2 py-0.5 rounded-pill text-center" style={{
              background: `${getComplianceColor(p.complianceScore)}20`,
              color: getComplianceColor(p.complianceScore),
            }}>
              {p.complianceScore != null ? `${p.complianceScore}%` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
