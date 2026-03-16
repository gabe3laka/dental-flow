import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Camera, Send, MessageCircle, CheckCircle2 } from "lucide-react";

interface NextActionCardProps {
  daysSinceLastScan: number;
  hasUnsentScans: boolean;
  hasUnreadReviews: boolean;
}

export function NextActionCard({ daysSinceLastScan, hasUnsentScans, hasUnreadReviews }: NextActionCardProps) {
  const navigate = useNavigate();

  let icon = CheckCircle2;
  let title = "You're all caught up!";
  let description = "Keep up the great work with your dental routine.";
  let action: (() => void) | null = null;
  let actionLabel = "";
  let variant: "default" | "outline" = "default";

  if (hasUnreadReviews) {
    icon = MessageCircle;
    title = "Doctor feedback available";
    description = "Your doctor has reviewed a scan. Check it out!";
    action = () => navigate("/patient/scans");
    actionLabel = "View Feedback";
  } else if (hasUnsentScans) {
    icon = Send;
    title = "Send scans to your doctor";
    description = "You have analyzed scans that haven't been sent for professional review.";
    action = () => navigate("/patient/scans");
    actionLabel = "Review & Send";
  } else if (daysSinceLastScan > 3) {
    icon = Camera;
    title = `Last scan was ${daysSinceLastScan} days ago`;
    description = "Scan regularly to track your progress and catch issues early.";
    action = () => navigate("/patient/scan");
    actionLabel = "Start Scan";
  }

  const Icon = icon;

  return (
    <div className="rounded-card bg-card border border-border p-4">
      <span className="mono-label text-primary mb-3 block">NEXT ACTION</span>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          {action && (
            <Button
              onClick={action}
              size="sm"
              className="mt-3 rounded-pill mono-label"
              variant={variant}
            >
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
