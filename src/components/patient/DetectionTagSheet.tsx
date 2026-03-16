import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getEducation } from "@/lib/dental-education";
import { Search, MessageCircle, AlertTriangle, CheckCircle2, Shield } from "lucide-react";

interface DetectionTagSheetProps {
  tag: string;
  severity?: string;
  confidence?: number;
  affectedTeeth?: string[];
  open: boolean;
  onClose: () => void;
}

export function DetectionTagSheet({ tag, severity, confidence, affectedTeeth, open, onClose }: DetectionTagSheetProps) {
  const navigate = useNavigate();
  const education = getEducation(tag);

  if (!education) return null;

  const severityLevel = severity || "minor";
  const severityText = education.severity[severityLevel] || education.severity.minor;
  const severityColor =
    severityLevel === "severe" ? "text-destructive" : severityLevel === "moderate" ? "text-status-warning" : "text-status-success";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[420px] max-h-[85vh] overflow-y-auto rounded-card">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{education.title}</DialogTitle>
        </DialogHeader>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed">{education.description}</p>

        {/* Your Results */}
        <div className="rounded-lg bg-muted p-4 space-y-2">
          <span className="mono-label text-primary block">YOUR SCAN RESULTS</span>
          <div className="flex items-center gap-2">
            {severityLevel === "severe" ? (
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
            ) : severityLevel === "moderate" ? (
              <AlertTriangle className="w-4 h-4 text-status-warning flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-status-success flex-shrink-0" />
            )}
            <span className={`text-sm font-medium capitalize ${severityColor}`}>{severityLevel}</span>
            {confidence != null && (
              <span className="mono-label text-muted-foreground ml-auto">{Math.round(confidence * 100)}% confidence</span>
            )}
          </div>
          <p className="text-sm text-foreground/80">{severityText}</p>
          {affectedTeeth && affectedTeeth.length > 0 && (
            <p className="mono-label text-muted-foreground">Affected: {affectedTeeth.join(", ")}</p>
          )}
        </div>

        {/* What You Can Do */}
        <div className="space-y-2">
          <span className="mono-label text-muted-foreground block">WHAT YOU CAN DO</span>
          <ul className="space-y-1.5">
            {education.prevention.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                <Shield className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                {tip}
              </li>
            ))}
          </ul>
        </div>

        {/* When to see doctor */}
        <div className="rounded-lg border border-border p-3">
          <span className="mono-label text-status-warning block mb-1">WHEN TO SEE A DOCTOR</span>
          <p className="text-sm text-foreground/80">{education.whenToSeeDoctor}</p>
        </div>

        {/* CTAs */}
        <div className="space-y-2 pt-2">
          <Button
            onClick={() => {
              onClose();
              navigate("/patient/chat", {
                state: { activeTab: "find", prefilterSpecialty: education.specialistType, fromDetection: tag },
              });
            }}
            className="w-full rounded-pill mono-label"
          >
            <Search className="w-3.5 h-3.5 mr-1.5" />
            Find a {education.title} Specialist
          </Button>
          <Button
            onClick={() => {
              onClose();
              navigate("/patient/chat", { state: { activeTab: "messages" } });
            }}
            variant="outline"
            className="w-full rounded-pill mono-label"
          >
            <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
            Ask Your Doctor
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
