import { useState, useEffect, useRef } from "react";
import { PatientBottomNav } from "@/components/patient/PatientBottomNav";
import { DoctorMarketplace } from "@/components/patient/DoctorMarketplace";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { Send, Paperclip, MessageCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { logError } from "@/lib/logger";

interface Message {
  id: string;
  content: string | null;
  sender_id: string;
  receiver_id: string;
  created_at: string;
}

type TabId = "messages" | "find";

export default function PatientChat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("messages");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState("Your Doctor");
  const [sending, setSending] = useState(false);
  const [detectionTags, setDetectionTags] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    (async () => {
      const { data: patient } = await supabase
        .from("patients")
        .select("id, assigned_doctor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (patient?.assigned_doctor_id) {
        setDoctorId(patient.assigned_doctor_id);

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", patient.assigned_doctor_id)
          .maybeSingle();
        if (profile?.full_name) setDoctorName(profile.full_name);

        const { data: msgs } = await supabase
          .from("messages")
          .select("id, content, sender_id, receiver_id, created_at")
          .or(
            `and(sender_id.eq.${user.id},receiver_id.eq.${patient.assigned_doctor_id}),and(sender_id.eq.${patient.assigned_doctor_id},receiver_id.eq.${user.id})`
          )
          .order("created_at", { ascending: true });
        setMessages(msgs || []);

        await supabase
          .from("messages")
          .update({ read_at: new Date().toISOString() })
          .eq("receiver_id", user.id)
          .eq("sender_id", patient.assigned_doctor_id)
          .is("read_at", null);
      }

      // Load detection tags for marketplace recommendations
      if (patient?.id) {
        const { data: scan } = await supabase
          .from("scans")
          .select("detection_tags")
          .eq("patient_id", patient.id)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (scan?.detection_tags && Array.isArray(scan.detection_tags)) {
          setDetectionTags(scan.detection_tags as string[]);
        }
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!user || !doctorId) return;
    const channel = supabase
      .channel(`chat-${[user.id, doctorId].sort().join("_")}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as Message;
        if (
          (msg.sender_id === user.id && msg.receiver_id === doctorId) ||
          (msg.sender_id === doctorId && msg.receiver_id === user.id)
        ) {
          setMessages((prev) => [...prev, msg]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, doctorId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !user || !doctorId || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.from("messages").insert({
        sender_id: user.id,
        receiver_id: doctorId,
        content: input.trim(),
      });
      if (error) throw error;
      setInput("");
    } catch (e) {
      logError(e, { operation: "Chat/sendMessage", userId: user?.id });
    } finally {
      setSending(false);
    }
  };

  const shouldShowTimestamp = (idx: number) => {
    if (idx === 0) return true;
    const prev = new Date(messages[idx - 1].created_at).getTime();
    const curr = new Date(messages[idx].created_at).getTime();
    return curr - prev > 300000;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-[480px] mx-auto pb-24">
      {/* Header */}
      <div className="px-5 pt-8 pb-0 border-b border-border">
        <h1 className="font-display text-xl font-semibold mb-4">
          {activeTab === "messages" ? (doctorId ? doctorName : "Messages") : "Find a Doctor"}
        </h1>

        {/* Tab bar */}
        <div className="flex gap-0">
          {([
            { id: "messages" as TabId, label: "MESSAGES", icon: MessageCircle },
            { id: "find" as TabId, label: "FIND A DOCTOR", icon: Search },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 mono-label border-b-2 transition-colors",
                activeTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Messages */}
      {activeTab === "messages" && (
        <>
          <div ref={scrollRef} className="flex-1 overflow-auto px-5 py-4 space-y-2">
            {!doctorId && (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-accent/20">
                  <MessageCircle className="w-7 h-7 text-accent" />
                </div>
                <h2 className="font-display text-base font-medium text-foreground mb-2">
                  No doctor connected yet
                </h2>
                <p className="text-sm text-muted-foreground text-center max-w-[280px] mb-2 leading-relaxed">
                  Once your doctor accepts your treatment plan, you'll be able to message them directly here.
                </p>
                <p className="text-xs text-muted-foreground/60 text-center max-w-[260px] mb-5 italic">
                  Or find a doctor in the "Find a Doctor" tab above.
                </p>
                <button
                  onClick={() => setActiveTab("find")}
                  className="rounded-pill px-5 py-2 mono-label border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition"
                >
                  Find a Doctor →
                </button>
              </div>
            )}

            {messages.map((msg, idx) => {
              const isOwn = msg.sender_id === user?.id;
              return (
                <div key={msg.id}>
                  {shouldShowTimestamp(idx) && (
                    <p className="text-center mono-label text-muted-foreground my-3">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                  <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                    {!isOwn && (
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mr-2 flex-shrink-0 mt-1">
                        <span className="font-mono text-xs text-primary font-semibold">DR</span>
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] px-4 py-2.5 text-sm ${
                        isOwn
                          ? "bg-primary text-primary-foreground rounded-[18px_18px_4px_18px]"
                          : "bg-secondary text-secondary-foreground rounded-[18px_18px_18px_4px]"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input bar */}
          {doctorId && (
            <div className="px-5 py-4 border-t border-border">
              <div className="flex items-center gap-2 bg-card rounded-pill border border-border px-4 py-2">
                <label className="cursor-pointer" aria-label="Attach file">
                  <Paperclip className="w-4 h-4 text-muted-foreground hover:text-foreground transition" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !user || !doctorId) return;
                      try {
                        const path = `chat/${user.id}/${Date.now()}-${file.name}`;
                        const { error: uploadErr } = await supabase.storage
                          .from("scan-videos")
                          .upload(path, file);
                        if (uploadErr) throw uploadErr;
                        const { data: urlData } = supabase.storage
                          .from("scan-videos")
                          .getPublicUrl(path);
                        await supabase.from("messages").insert({
                          sender_id: user.id,
                          receiver_id: doctorId,
                          content: "📎 Sent an image",
                          attachment_url: urlData.publicUrl,
                          message_type: "scan_attachment" as any,
                        });
                      } catch (err) {
                        logError(err, { operation: "Chat/uploadAttachment", userId: user?.id });
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 bg-transparent text-sm font-body outline-none placeholder:text-muted-foreground"
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className="w-8 h-8 rounded-full bg-primary flex items-center justify-center disabled:opacity-50"
                  aria-label="Send message"
                >
                  <Send className="w-3.5 h-3.5 text-primary-foreground" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Tab: Find a Doctor */}
      {activeTab === "find" && (
        <div className="flex-1 overflow-auto px-5 py-5">
          {detectionTags.length > 0 && (
            <p className="text-xs text-muted-foreground mb-4 italic">
              Showing recommendations based on your latest scan results.
            </p>
          )}
          <DoctorMarketplace
            mode="grid"
            detectionTags={detectionTags}
            onAssign={() => {
              setActiveTab("messages");
            }}
          />
        </div>
      )}

      <PatientBottomNav />
    </div>
  );
}
