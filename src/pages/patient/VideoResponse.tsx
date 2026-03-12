import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { logError } from "@/lib/logger";

interface ReviewData {
  id: string;
  review_notes: string | null;
  response_video_url: string | null;
  reviewed_at: string;
  action_type: string | null;
  doctorName: string;
  avatarUrl: string | null;
}

export default function VideoResponse() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data: r } = await supabase
          .from("scan_reviews")
          .select("id, review_notes, response_video_url, reviewed_at, action_type, doctor_id")
          .eq("id", id)
          .maybeSingle();

        if (!r) { setLoading(false); return; }

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("user_id", r.doctor_id)
          .maybeSingle();

        setReview({
          id: r.id,
          review_notes: r.review_notes,
          response_video_url: r.response_video_url,
          reviewed_at: r.reviewed_at,
          action_type: r.action_type,
          doctorName: profile?.full_name || "Doctor",
          avatarUrl: profile?.avatar_url || null,
        });
      } catch (e) {
        logError(e, { operation: "VideoResponse/loadData" });
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-6 py-8 max-w-lg mx-auto pb-24">
        <Skeleton className="h-64 rounded-card mb-4" />
        <Skeleton className="h-40 rounded-card" />
        <PatientBottomNav />
      </div>
    );
  }

  if (!review) {
    return (
      <div className="min-h-screen bg-background px-6 py-8 max-w-lg mx-auto pb-24">
        <p className="text-muted-foreground text-sm">Response not found.</p>
        <PatientBottomNav />
      </div>
    );
  }

  const actionItems = (review.review_notes || "")
    .split("\n")
    .filter((line) => /^(\d+[.)]\s*|-\s+)/.test(line.trim()))
    .map((line) => line.replace(/^(\d+[.)]\s*|-\s+)/, "").trim());

  const transcript = (review.review_notes || "No transcript available.")
    .split("\n")
    .filter((line) => !/^(\d+[.)]\s*|-\s+)/.test(line.trim()))
    .join("\n")
    .trim();

  return (
    <div className="min-h-screen bg-background px-6 py-8 max-w-lg mx-auto pb-24">
      <button onClick={() => navigate("/patient/scans")} className="mono-label text-muted-foreground hover:text-foreground transition-colors mb-4">
        ← BACK TO SCANS
      </button>
      <span className="mono-label text-muted-foreground">DOCTOR RESPONSE</span>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-6">Video Response</h1>

      {/* Video player */}
      <div className="relative aspect-video rounded-card bg-card border border-border mb-6 overflow-hidden flex items-center justify-center">
        {review.response_video_url ? (
          <video src={review.response_video_url} controls className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-soft-panel flex items-center justify-center">
              <span className="mono-label text-muted-foreground">▶</span>
            </div>
            <span className="mono-label text-muted-foreground">NO VIDEO RECORDED</span>
          </div>
        )}
        {/* Branded overlay with practice logo */}
        <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center gap-2" style={{ background: "rgba(0,0,0,0.45)" }}>
          {review.avatarUrl && (
            <img src={review.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
          )}
          <span className="mono-label text-white">ARCLINE · DR. {review.doctorName.toUpperCase()}</span>
          <span className="mono-label text-white/60 ml-auto">
            {format(new Date(review.reviewed_at), "dd MMM yyyy").toUpperCase()}
          </span>
        </div>
      </div>

      {/* Transcript */}
      <div className="bg-card rounded-card border border-border p-6 mb-4">
        <span className="mono-label text-muted-foreground mb-3 block">TRANSCRIPT</span>
        <p className="text-sm font-body text-foreground leading-relaxed whitespace-pre-wrap">
          {transcript || "No transcript available."}
        </p>
      </div>

      {/* Action Items */}
      {actionItems.length > 0 && (
        <div className="bg-card rounded-card border border-border p-6 mb-6">
          <span className="mono-label text-muted-foreground mb-3 block">ACTION ITEMS</span>
          <ol className="list-decimal list-inside space-y-2">
            {actionItems.map((item, i) => (
              <li key={i} className="text-sm font-body text-foreground">{item}</li>
            ))}
          </ol>
        </div>
      )}

      {/* CTAs */}
      <div className="flex gap-3">
        <Button
          onClick={() => navigate("/patient/chat")}
          variant="outline"
          className="flex-1 rounded-pill font-mono text-xs uppercase tracking-[0.15em]"
        >
          Message Doctor
        </Button>
        {review.action_type === "schedule_visit" && (
          <Button
            onClick={() => window.location.href = "mailto:?subject=Book In-Office Visit&body=I would like to schedule an in-office visit."}
            className="flex-1 rounded-pill bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-xs uppercase tracking-[0.15em]"
          >
            Book In-Office Visit
          </Button>
        )}
        {review.action_type === "rescan_needed" && (
          <Button
            onClick={() => navigate("/patient/scan")}
            className="flex-1 rounded-pill bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-xs uppercase tracking-[0.15em]"
          >
            Submit New Scan
          </Button>
        )}
      </div>

      <PatientBottomNav />
    </div>
  );
}
