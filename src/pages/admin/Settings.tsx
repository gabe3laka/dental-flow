import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";

const PLAN_LIMITS = [
  { tier: "Starter", price: "$149/mo", patients: 50 },
  { tier: "Growth", price: "$349/mo", patients: 200 },
  { tier: "Enterprise", price: "Custom", patients: "Unlimited" },
];

export default function AdminSettings() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceFlagId, setMaintenanceFlagId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [announcementsResult, adminRolesResult, flagsResult] = await Promise.allSettled([
          supabase.from("platform_announcements").select("*").order("created_at", { ascending: false }),
          supabase.from("user_roles").select("user_id").eq("role", "admin"),
          supabase.from("feature_flags").select("*").eq("flag_key", "MAINTENANCE_MODE"),
        ]);

        if (announcementsResult.status === "rejected") logError(announcementsResult.reason, { operation: "AdminSettings/fetchAnnouncements" });
        if (adminRolesResult.status === "rejected") logError(adminRolesResult.reason, { operation: "AdminSettings/fetchAdminRoles" });
        if (flagsResult.status === "rejected") logError(flagsResult.reason, { operation: "AdminSettings/fetchFeatureFlags" });

        const announcementsData = announcementsResult.status === "fulfilled" ? announcementsResult.value.data : null;
        const adminRolesData = adminRolesResult.status === "fulfilled" ? adminRolesResult.value.data : null;
        const flagsData = flagsResult.status === "fulfilled" ? flagsResult.value.data : null;

        setAnnouncements(announcementsData || []);

        // Get admin emails
        if (adminRolesData?.length) {
          const ids = adminRolesData.map((r) => r.user_id);
          const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
          setAdminUsers(profiles || []);
        }

        // Maintenance flag
        if (flagsData?.[0]) {
          setMaintenanceMode(flagsData[0].enabled);
          setMaintenanceFlagId(flagsData[0].id);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const toggleMaintenance = async (enabled: boolean) => {
    setMaintenanceMode(enabled);
    if (maintenanceFlagId) {
      await supabase.from("feature_flags").update({ enabled }).eq("id", maintenanceFlagId);
    } else {
      const { data } = await supabase.from("feature_flags").insert({
        flag_key: "MAINTENANCE_MODE",
        enabled,
        description: "When enabled, shows maintenance banner to users",
      }).select().single();
      if (data) setMaintenanceFlagId(data.id);
    }
    toast({ title: enabled ? "Maintenance mode enabled" : "Maintenance mode disabled" });
  };

  const createAnnouncement = async () => {
    if (!title.trim() || !content.trim() || !user) return;
    try {
      const { error } = await supabase.from("platform_announcements").insert({
        title: title.trim(),
        content: content.trim(),
        created_by: user.id,
      });
      if (error) throw error;
      setAnnouncements([{ id: crypto.randomUUID(), title: title.trim(), content: content.trim(), active: true, created_at: new Date().toISOString(), created_by: user.id, audience: "all" }, ...announcements]);
      setTitle("");
      setContent("");
      toast({ title: "Announcement created" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div>
      <span className="mono-label" style={{ color: "hsl(0 84% 60%)" }}>SETTINGS</span>
      <h1 className="font-display text-3xl font-semibold mt-1 mb-8">Platform Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Maintenance Mode */}
        <div className="rounded-card p-6" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
          <div className="flex items-center justify-between">
            <div>
              <span className="mono-label block mb-1" style={{ color: "hsl(38 23% 90% / 0.3)" }}>MAINTENANCE MODE</span>
              <p className="text-xs" style={{ color: "hsl(38 23% 90% / 0.45)" }}>Show maintenance banner to all users</p>
            </div>
            <Switch checked={maintenanceMode} onCheckedChange={toggleMaintenance} />
          </div>
        </div>

        {/* Plan Limits */}
        <div className="rounded-card p-6" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
          <span className="mono-label block mb-4" style={{ color: "hsl(38 23% 90% / 0.3)" }}>PLAN LIMITS</span>
          <div className="space-y-3">
            {PLAN_LIMITS.map((p) => (
              <div key={p.tier} className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-xs">{p.tier}</span>
                  <span className="mono-label ml-2" style={{ color: "hsl(228 100% 62%)" }}>{p.price}</span>
                </div>
                <span className="mono-label" style={{ color: "hsl(38 23% 90% / 0.45)" }}>{p.patients} patients</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Admin Users */}
      <div className="rounded-card p-6 mb-8" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
        <span className="mono-label block mb-4" style={{ color: "hsl(38 23% 90% / 0.3)" }}>ADMIN USERS</span>
        {loading ? <Skeleton className="h-12" /> : adminUsers.length === 0 ? (
          <p className="text-sm" style={{ color: "hsl(38 23% 90% / 0.3)" }}>No admin users found.</p>
        ) : (
          <div className="space-y-2">
            {adminUsers.map((a) => (
              <div key={a.user_id} className="flex items-center gap-3 py-2 border-b" style={{ borderColor: "hsl(0 0% 100% / 0.04)" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "hsl(0 84% 60% / 0.15)" }}>
                  <span className="mono-label" style={{ color: "hsl(0 84% 60%)" }}>{(a.full_name || "A")[0]}</span>
                </div>
                <span className="text-sm">{a.full_name || "Unknown"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Announcements */}
      <div className="mb-8">
        <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>CREATE ANNOUNCEMENT</span>
        <div className="rounded-card p-6 space-y-4" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title..." className="bg-card border-border text-foreground" />
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Announcement content..." className="bg-card border-border text-foreground" />
          <Button onClick={createAnnouncement} className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]" style={{ background: "hsl(0 84% 60%)", color: "white" }}>
            Publish
          </Button>
        </div>
      </div>

      <span className="mono-label mb-4 block" style={{ color: "hsl(38 23% 90% / 0.3)" }}>RECENT ANNOUNCEMENTS</span>
      <div className="space-y-3 mb-8">
        {loading ? <Skeleton className="h-20 rounded-card" /> : announcements.length === 0 ? (
          <p className="text-sm" style={{ color: "hsl(38 23% 90% / 0.3)" }}>No announcements.</p>
        ) : announcements.map((a) => (
          <div key={a.id} className="rounded-card p-5" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-sm font-semibold">{a.title}</h3>
              <span className="mono-label" style={{ color: a.active ? "hsl(142 71% 45%)" : "hsl(38 23% 90% / 0.3)" }}>
                {a.active ? "ACTIVE" : "INACTIVE"}
              </span>
            </div>
            <p className="text-sm font-body" style={{ color: "hsl(38 23% 90% / 0.7)" }}>{a.content}</p>
          </div>
        ))}
      </div>

      {/* Danger Zone */}
      <div className="rounded-card p-6" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 84% 60% / 0.2)" }}>
        <span className="mono-label block mb-3" style={{ color: "hsl(0 84% 60%)" }}>DANGER ZONE</span>
        <p className="text-xs mb-4" style={{ color: "hsl(38 23% 90% / 0.3)" }}>Purge test data removes all seed accounts and their associated data. This cannot be undone.</p>
        <Button
          variant="outline"
          onClick={() => toast({ title: "Purge", description: "Test data purge not yet implemented." })}
          className="rounded-pill font-mono text-xs uppercase tracking-[0.15em]"
          style={{ borderColor: "hsl(0 84% 60% / 0.3)", color: "hsl(0 84% 60%)" }}
        >
          Purge Test Data
        </Button>
      </div>
    </div>
  );
}
