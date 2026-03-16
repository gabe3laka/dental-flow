import { ProgressRing } from "@/components/ui/progress-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { usePatientData } from "@/hooks/use-patient-data";
import { useNavigate } from "react-router-dom";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { DoctorMarketplace } from "@/components/patient/DoctorMarketplace";
import { Camera, TrendingUp, MessageCircle, Flame } from "lucide-react";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function UserAvatar({ name }: { name?: string }) {
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";
  return (
    <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
      <span className="font-mono text-xs text-primary font-semibold">{initials}</span>
    </div>
  );
}

export default function PatientHome() {
  const { user } = useAuth();
  const { data, loading } = usePatientData();
  const navigate = useNavigate();

  const today = new Date();
  const dateStr = today
    .toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })
    .toUpperCase();
  const firstName = user?.user_metadata?.full_name?.split(" ")[0];
  const fullName = user?.user_metadata?.full_name;

  const progressPercent = data?.progressPercent ?? 0;
  const notStarted = !data?.hasStarted && progressPercent === 0;

  return (
    <div className="min-h-screen bg-background max-w-[480px] mx-auto pb-28">
      {/* Hero greeting strip */}
      <div
        className="px-5 pt-10 pb-7 mb-1"
        style={{
          background:
            "linear-gradient(160deg, hsl(var(--primary) / 0.07) 0%, transparent 70%)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="mono-label text-muted-foreground">{dateStr}</span>
            <h1 className="font-display text-2xl font-semibold mt-0.5">
              {getGreeting()}
              {firstName ? `, ${firstName}` : ""}
            </h1>
          </div>
          <UserAvatar name={fullName} />
        </div>

        {/* Quick Actions row */}
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => navigate("/patient/scan")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-pill bg-primary text-primary-foreground mono-label shadow-sm hover:bg-primary/90 transition"
          >
            <Camera className="w-3.5 h-3.5" />
            SCAN NOW
          </button>
          <button
            onClick={() => navigate("/patient/progress")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-pill bg-card border border-border mono-label text-foreground hover:border-primary/40 transition"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            PROGRESS
          </button>
          <button
            onClick={() => navigate("/patient/chat")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-pill bg-card border border-border mono-label text-foreground hover:border-primary/40 transition"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            CHAT
          </button>
        </div>
      </div>

      <div className="px-5">
        {/* Treatment snapshot card */}
        <div className="bg-card rounded-card border border-border shadow-sm p-4 mb-4 flex items-center gap-5">
          {loading ? (
            <Skeleton className="w-[72px] h-[72px] rounded-full flex-shrink-0" />
          ) : (
            <div className="flex-shrink-0">
              <ProgressRing
                value={progressPercent}
                status={notStarted ? "not_started" : progressPercent >= 50 ? "on_track" : "needs_attention"}
                size={72}
              />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-2">
            <span className="mono-label text-muted-foreground block">TREATMENT PROGRESS</span>
            <div className="flex items-center gap-4">
              <div>
                <p className="font-display text-xl font-semibold leading-none">
                  {progressPercent}%
                </p>
                <span className="mono-label text-muted-foreground text-[10px]">COMPLETE</span>
              </div>
              <div className="w-px h-7 bg-border" />
              <div>
                <div className="flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <p className="font-display text-xl font-semibold leading-none">
                    {data?.complianceStreak ?? 0}
                  </p>
                </div>
                <span className="mono-label text-muted-foreground text-[10px]">SCANS DONE</span>
              </div>
              {data?.nextCheckInDays != null && (
                <>
                  <div className="w-px h-7 bg-border" />
                  <div>
                    <p className="font-display text-xl font-semibold leading-none">
                      {data.nextCheckInDays}
                    </p>
                    <span className="mono-label text-muted-foreground text-[10px]">DAYS LEFT</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Doctor Marketplace preview */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="mono-label text-muted-foreground">FIND A DOCTOR</span>
            <button
              onClick={() => navigate("/patient/chat")}
              className="mono-label text-primary text-[10px]"
            >
              SEE ALL →
            </button>
          </div>
          {loading ? (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="w-[180px] h-[130px] rounded-card flex-shrink-0" />
              ))}
            </div>
          ) : !data?.hasScanData ? (
            <div
              className="bg-card border border-dashed border-border rounded-card px-5 py-4 flex items-center gap-3 cursor-pointer hover:border-primary/30 transition"
              onClick={() => navigate("/patient/scan")}
            >
              <Camera className="w-5 h-5 text-muted-foreground opacity-60" />
              <div>
                <p className="text-sm font-medium">Submit a scan first</p>
                <p className="text-xs text-muted-foreground">
                  We'll recommend doctors based on your scan results.
                </p>
              </div>
              <span className="mono-label text-primary ml-auto flex-shrink-0">SCAN →</span>
            </div>
          ) : (
            <DoctorMarketplace mode="preview" />
          )}
        </div>

        {/* Latest message / doctor card */}
        {loading ? (
          <Skeleton className="h-16 rounded-card mb-4" />
        ) : data?.latestMessage ? (
          <div
            className="bg-card rounded-card p-4 mb-4 border border-border shadow-sm flex items-center gap-3 cursor-pointer hover:border-primary/30 transition"
            onClick={() => navigate("/patient/chat")}
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-mono text-xs text-primary font-semibold flex-shrink-0">
              DR
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{data.latestMessage.senderName}</p>
              <p className="text-xs text-muted-foreground truncate">{data.latestMessage.content}</p>
            </div>
            {data.unreadCount > 0 && (
              <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
            )}
          </div>
        ) : (
          <div
            className="bg-card rounded-card p-4 mb-4 border border-dashed border-border flex items-center gap-3 cursor-pointer hover:border-primary/30 transition"
            onClick={() => navigate("/patient/profile")}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-accent/15">
              <MessageCircle className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Your doctor will appear here</p>
              <p className="text-xs text-muted-foreground">
                Once assigned, you can message them directly.
              </p>
            </div>
            <span className="mono-label text-primary flex-shrink-0">PROFILE →</span>
          </div>
        )}
      </div>

      {/* Camera FAB */}
      <button
        onClick={() => navigate("/patient/scan")}
        className="fixed bottom-[88px] left-1/2 -translate-x-1/2 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
        style={{ boxShadow: "0 4px 20px hsl(var(--primary) / 0.35)" }}
        aria-label="Start new scan"
      >
        <Camera className="w-6 h-6" />
      </button>

      <PatientBottomNav />
    </div>
  );
}
