import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Send } from "lucide-react";
import { logError } from "@/lib/logger";

interface Message {
  id: string;
  content: string | null;
  sender_id: string;
  receiver_id: string;
  created_at: string;
}

interface DoctorChatProps {
  patientUserId: string;
  patientName?: string;
}

export function DoctorChat({ patientUserId, patientName = "Patient" }: DoctorChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, content, sender_id, receiver_id, created_at")
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${patientUserId}),and(sender_id.eq.${patientUserId},receiver_id.eq.${user.id})`)
        .order("created_at", { ascending: true });
      setMessages(data || []);

      // Mark unread as read
      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("receiver_id", user.id)
        .eq("sender_id", patientUserId)
        .is("read_at", null);
    })();
  }, [user, patientUserId]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`doctor-chat-${[user.id, patientUserId].sort().join("_")}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as Message;
        if (
          (msg.sender_id === user.id && msg.receiver_id === patientUserId) ||
          (msg.sender_id === patientUserId && msg.receiver_id === user.id)
        ) {
          setMessages((prev) => [...prev, msg]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, patientUserId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !user || sending) return;
    setSending(true);
    try {
      await supabase.from("messages").insert({
        sender_id: user.id,
        receiver_id: patientUserId,
        content: input.trim(),
      });
      setInput("");
    } catch (e) {
      logError(e, { operation: "DoctorChat/sendMessage", userId: user?.id });
    } finally {
      setSending(false);
    }
  };

  const shouldShowTimestamp = (idx: number) => {
    if (idx === 0) return true;
    return new Date(messages[idx].created_at).getTime() - new Date(messages[idx - 1].created_at).getTime() > 300000;
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-sm mt-10" style={{ color: "hsl(38 23% 90% / 0.3)" }}>
            No messages yet
          </p>
        )}
        {messages.map((msg, idx) => {
          const isOwn = msg.sender_id === user?.id;
          return (
            <div key={msg.id}>
              {shouldShowTimestamp(idx) && (
                <p className="text-center font-mono text-[9px] tracking-[0.15em] my-3" style={{ color: "hsl(38 23% 90% / 0.3)" }}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[75%] px-4 py-2.5 text-sm"
                  style={{
                    background: isOwn ? "hsl(220 24% 16%)" : "hsl(228 100% 62%)",
                    color: "white",
                    borderRadius: isOwn ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t" style={{ borderColor: "hsl(0 0% 100% / 0.06)" }}>
        <div className="flex items-center gap-2 rounded-pill px-4 py-2" style={{ background: "hsl(220 24% 16%)", border: "1px solid hsl(0 0% 100% / 0.07)" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-30"
            style={{ color: "hsl(38 23% 90%)" }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5 text-primary-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}
