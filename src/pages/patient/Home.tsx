import { ProgressRing } from "@/components/ui/progress-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { usePatientData } from "@/hooks/use-patient-data";
import { useNavigate } from "react-router-dom";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { MessageCircle, Camera, User, Flame } from "lucide-react";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatStreak(streak: number) {
  if (streak === 0) return "0 scans submitted";
  if (streak < 5) return `${streak} 🔥`;
  return `${streak} 🔥🔥`;
}

function UserAvatar({ name }: { name?: string }) {
  const initials = name
    ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";
  return (
    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
      <span className="font-mono text-xs text-primary font-medium">{initials}</span>
    </div>
  );
}

function getProgressStatus(data: any, progressPercent: number) {
  if (!data?.hasStarted && progressPercent === 0) return "not_started" as const;
  if (progressPercent >= 50) return "on_track" as const;
  return "needs_attention" as const;
}

export default function PatientHome() {
  const { user, signOut } = useAuth();
  const { data, loading } = usePatientData();
  const navigate = useNavigate();
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
  const firstName = user?.user_metadata?.full_name?.split(" ")[0];
  const fullName = user?.user_metadata?.full_name;

  const progressPercent = data?.progressPercent ?? 0;
  const status = getProgressStatus(data, progressPercent);

  return (
    <div className="min-h-screen bg-background px-5 py-8 max-w-[480px] mx-auto pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <span className="mono-label text-muted-foreground">TODAY · {dateStr}</span>
          <h1 className="font-display text-2xl font-semibold mt-1">
            {getGreeting()}{firstName ? `, ${firstName}` : ""}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={signOut} className="mono-label text-muted-foreground hover:text-foreground transition">
            SIGN OUT
          </button>
          <UserAvatar name={fullName} />
        </div>
      </div>

      {/* Treatment Progress Card */}
      <div className="bg-card rounded-card p-6 mb-4 border border-border shadow-sm">
        <span className="mono-label text-muted-foreground block mb-4">TREATMENT PROGRESS</span>
        {loading ? (
          <div className="flex justify-center">
            <Skeleton className="w-[100px] h-[100px] rounded-full" />
          </div>
        ) : (
          <ProgressRing
            value={progressPercent}
            status={status}
            subtitle={
              data?.complianceStreak
                ? `${data.complianceStreak} scans completed`
                : undefined
            }
          />
        )}
      </div>

      {/* YOUR NEXT STEP card */}
      {!loading && (
        <div
          className="bg-card rounded-card p-5 mb-4 border border-border shadow-sm flex items-center gap-4 cursor-pointer hover:border-primary/30 transition"
          onClick={() => {
            if (!data?.hasScanData) navigate("/patient/scan");
            else if (!data?.doctorName) navigate("/patient/profile");
            else if (!data?.latestMessage) navigate("/patient/chat");
            else navigate("/patient/scan");
          }}
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-primary/10">
            {!data?.hasScanData ? (
              <Camera className="w-4 h-4 text-primary" />
            ) : !data?.doctorName ? (
              <User className="w-4 h-4 text-primary" />
            ) : !data?.latestMessage ? (
              <MessageCircle className="w-4 h-4 text-primary" />
            ) : (
              <Flame className="w-4 h-4 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <span className="mono-label text-muted-foreground">YOUR NEXT STEP</span>
            <p className="text-sm font-medium mt-0.5">
              {!data?.hasScanData
                ? "Submit your first scan to get started."
                : !data?.doctorName
                ? "Complete your profile — your doctor needs your info."
                : !data?.latestMessage
                ? `Introduce yourself to Dr. ${data.doctorName.split(" ")[0]}.`
                : `Next scan due in ${data.nextCheckInDays ?? "—"} days. Keep your streak going!`}
            </p>
          </div>
          <span className="mono-label text-primary flex-shrink-0">
            {!data?.hasScanData
              ? "START →"
              : !data?.doctorName
              ? "UPDATE →"
              : !data?.latestMessage
              ? "MESSAGE →"
              : "SCAN →"}
          </span>
        </div>
      )}

      {/* Next check-in card */}
      <div className="bg-card rounded-card p-5 mb-4 border border-border shadow-sm">
        {loading ? (
          <Skeleton className="h-12" />
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <span className="mono-label text-muted-foreground">NEXT CHECK-IN</span>
              <p className="font-display text-lg font-semibold mt-1">
                {data?.nextCheckInDays !== null ? `${data?.nextCheckInDays} days` : "No scans yet"}
              </p>
            </div>
            <div className="w-px h-10 bg-border mx-4" />
            <div className="flex-1 text-right">
              <span className="mono-label text-muted-foreground">SCAN STREAK</span>
              <p className="font-display text-lg font-semibold mt-1">{formatStreak(data?.complianceStreak ?? 0)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Message preview */}
      {loading ? (
        <Skeleton className="h-16 rounded-card mb-6" />
      ) : data?.latestMessage ? (
        <div
          className="bg-card rounded-card p-5 mb-6 border border-border shadow-sm flex items-center gap-4 cursor-pointer hover:border-primary/30 transition"
          onClick={() => navigate("/patient/chat")}
        >
          <div className="w-10 h-10 rounded-full bg-soft-panel flex items-center justify-center font-mono text-xs text-muted-foreground">
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
          className="bg-card rounded-card p-5 mb-6 border border-border shadow-sm flex items-center gap-4 cursor-pointer hover:border-primary/30 transition"
          onClick={() => navigate("/patient/profile")}
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center bg-accent/20">
            <MessageCircle className="w-4 h-4 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Your doctor will appear here</p>
            <p className="text-xs text-muted-foreground">Once assigned, you can message them directly.</p>
          </div>
          <span className="mono-label text-primary flex-shrink-0">PROFILE →</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !data?.hasScanData && (
        <div className="text-center mb-4">
          <p className="text-sm text-muted-foreground mb-3">Submit your first scan to get started.</p>
        </div>
      )}

      {/* Floating Action Button */}
      <button
        onClick={() => navigate("/patient/scan")}
        className="fixed bottom-[88px] left-1/2 -translate-x-1/2 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
        style={{ boxShadow: "0 4px 20px hsl(var(--primary) / 0.3)" }}
        aria-label="Start new scan"
      >
        <Camera className="w-6 h-6" />
      </button>

      <PatientBottomNav />
    </div>
  );
}
