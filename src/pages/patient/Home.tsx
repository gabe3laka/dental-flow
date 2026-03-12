import { GradientOrb } from "@/components/ui/gradient-orb";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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

export default function PatientHome() {
  const { user, signOut } = useAuth();
  const { data, loading } = usePatientData();
  const navigate = useNavigate();
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
  const firstName = user?.user_metadata?.full_name?.split(" ")[0];

  const progressPercent = data?.progressPercent ?? 0;
  const notStarted = !data?.hasStarted && progressPercent === 0;

  return (
    <div className="min-h-screen bg-background px-6 py-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <span className="mono-label text-muted-foreground">TODAY · {dateStr}</span>
          <h1 className="font-display text-2xl font-semibold mt-1">
            {getGreeting()}{firstName ? `, ${firstName}` : ""}
          </h1>
        </div>
        <button onClick={signOut} className="mono-label text-muted-foreground hover:text-foreground transition">
          SIGN OUT
        </button>
      </div>

      {/* Progress Orb */}
      <div className="flex justify-center mb-8">
        {loading ? (
          <Skeleton className="w-48 h-48 rounded-full" />
        ) : (
          <GradientOrb
            percentage={progressPercent}
            status={notStarted ? "NOT STARTED" : progressPercent >= 50 ? "ON TRACK" : "IN PROGRESS"}
            notStarted={notStarted}
          />
        )}
      </div>

      {/* YOUR NEXT STEP card */}
      {!loading && (
        <div
          className="bg-card rounded-card p-5 mb-4 border border-border flex items-center gap-4 cursor-pointer hover:border-primary/30 transition"
          onClick={() => {
            if (!data?.hasScanData) navigate("/patient/scan");
            else if (!data?.doctorName) navigate("/patient/profile");
            else if (!data?.latestMessage) navigate("/patient/chat");
            else navigate("/patient/scan");
          }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "hsl(228 100% 62% / 0.1)" }}
          >
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
            <span className="mono-label text-muted-foreground text-[9px]">YOUR NEXT STEP</span>
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
          <span className="mono-label text-primary text-[9px] flex-shrink-0">
            {!data?.hasScanData
              ? "START SCAN →"
              : !data?.doctorName
              ? "UPDATE PROFILE →"
              : !data?.latestMessage
              ? "SEND MESSAGE →"
              : "START SCAN →"}
          </span>
        </div>
      )}

      {/* Next check-in card */}
      <div className="bg-card rounded-card p-6 mb-4 border border-border">
        {loading ? (
          <Skeleton className="h-12" />
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <span className="mono-label text-muted-foreground">NEXT CHECK-IN</span>
              <p className="font-display text-lg font-semibold mt-1">
                {data?.nextCheckInDays !== null ? `${data?.nextCheckInDays} days` : "No scans yet"}
              </p>
            </div>
            <div className="text-right">
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
          className="bg-card rounded-card p-6 mb-6 border border-border flex items-center gap-4 cursor-pointer hover:border-primary/30 transition"
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
          className="bg-card rounded-card p-5 mb-6 border border-border flex items-center gap-4 cursor-pointer hover:border-primary/30 transition"
          onClick={() => navigate("/patient/profile")}
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "hsl(256 67% 95%)" }}>
            <MessageCircle className="w-4 h-4" style={{ color: "hsl(256 67% 70%)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Your doctor will appear here</p>
            <p className="text-xs text-muted-foreground">Once assigned, you can message them directly.</p>
          </div>
          <span className="mono-label text-primary text-[9px] flex-shrink-0">PROFILE →</span>
        </div>
      )}

      {/* Empty state or Start Scan CTA */}
      {!loading && !data?.hasScanData && (
        <div className="text-center mb-4">
          <p className="text-sm text-muted-foreground mb-3">Submit your first scan to get started.</p>
        </div>
      )}

      <Button
        onClick={() => navigate("/patient/scan")}
        className="w-full rounded-pill bg-primary hover:bg-primary/90 text-primary-foreground font-mono uppercase tracking-[0.15em] text-sm py-6"
      >
        Start Scan
      </Button>

      <PatientBottomNav />
    </div>
  );
}
