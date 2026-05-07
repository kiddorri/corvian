"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Send } from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { createClient } from "@/lib/supabase/client";
import { StudentContext } from "../../layout";

type Raven = "huginn" | "muninn";
type Message = { role: "user" | "assistant"; content: string };
type TopicMeta = { name: string; section: string };

const RAVEN_META: Record<Raven, { emoji: string; label: string; color: string }> = {
  huginn: { emoji: "🔵", label: "Хугин", color: "#818CF8" },
  muninn: { emoji: "🟣", label: "Мунин", color: "#8B5CF6" },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderWithKaTeX(text: string): string {
  const parts = text.split(/(\$[^$]+\$)/g);
  return parts
    .map((part) => {
      if (part.length > 1 && part.startsWith("$") && part.endsWith("$")) {
        const formula = part.slice(1, -1);
        try {
          return katex.renderToString(formula, { throwOnError: false });
        } catch {
          return escapeHtml(part);
        }
      }
      return escapeHtml(part);
    })
    .join("")
    .replace(/\n/g, "<br/>");
}

export default function ChatPage() {
  const router = useRouter();
  const params = useParams();
  const topicId =
    typeof params.topicId === "string" ? params.topicId : params.topicId?.[0];

  const { student } = useContext(StudentContext);

  const [topic, setTopic] = useState<TopicMeta | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentRaven, setCurrentRaven] = useState<Raven>("huginn");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sentInitialRef = useRef(false);

  const ravenMeta = RAVEN_META[currentRaven];

  const sendMessage = useCallback(
    async (text: string) => {
      if (!student || !sessionId || !topicId) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed },
        { role: "assistant", content: "" },
      ]);
      setIsLoading(true);

      let response: Response;
      try {
        response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            message: trimmed,
            raven: currentRaven,
            topicId,
            studentId: student.id,
          }),
        });
      } catch {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Ворон задумался... Попробуйте ещё раз.",
          };
          return updated;
        });
        setIsLoading(false);
        return;
      }

      if (!response.ok || !response.body) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Ворон задумался... Попробуйте ещё раз.",
          };
          return updated;
        });
        setIsLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistant = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const block of events) {
          for (const line of block.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                assistant += data.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: assistant,
                  };
                  return updated;
                });
              }
              if (data.error) {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: data.error,
                  };
                  return updated;
                });
              }
            } catch {
              // ignore malformed line
            }
          }
        }
      }

      setIsLoading(false);
    },
    [student, sessionId, topicId, currentRaven],
  );

  useEffect(() => {
    if (!topicId) return;
    if (typeof window === "undefined") return;
    const studentId = localStorage.getItem("corvian_student_id");
    if (!studentId) {
      router.push("/join");
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const { data: topicData, error: topicError } = await supabase
        .from("topics")
        .select("name, section")
        .eq("id", topicId)
        .single();

      if (cancelled) return;
      if (topicError || !topicData) {
        setBootstrapError("Тема не найдена.");
        return;
      }
      setTopic(topicData as TopicMeta);

      let { data: existingSession } = await supabase
        .from("chat_sessions")
        .select("id, raven")
        .eq("student_id", studentId)
        .eq("topic_id", topicId)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!existingSession) {
        const { data: newSession, error: createError } = await supabase
          .from("chat_sessions")
          .insert({
            student_id: studentId,
            topic_id: topicId,
            raven: "huginn",
          })
          .select("id, raven")
          .single();
        if (createError || !newSession) {
          if (!cancelled) setBootstrapError("Не удалось начать сессию.");
          return;
        }
        existingSession = newSession;
      }

      if (cancelled) return;
      setSessionId(existingSession.id);
      setCurrentRaven((existingSession.raven as Raven) ?? "huginn");

      const { data: history } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("session_id", existingSession.id)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      const historyTyped = ((history ?? []) as Message[]).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      setMessages(historyTyped);

      await supabase
        .from("student_progress")
        .upsert(
          {
            student_id: studentId,
            topic_id: topicId,
            status: "in_progress",
            last_session_at: new Date().toISOString(),
          },
          { onConflict: "student_id,topic_id" },
        );

      setBootstrapped(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [topicId, router]);

  // Auto-send initial greeting when no history
  useEffect(() => {
    if (
      bootstrapped &&
      sessionId &&
      messages.length === 0 &&
      !sentInitialRef.current &&
      student
    ) {
      sentInitialRef.current = true;
      sendMessage("Привет! Я готов изучать эту тему.");
    }
  }, [bootstrapped, sessionId, messages.length, student, sendMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    const max = 4 * 24; // ~4 строки
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    autoResize(e.target);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const text = input.trim();
    if (text.length === 0 || isLoading) return;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    sendMessage(text);
  }

  const showTyping = useMemo(() => {
    if (!isLoading) return false;
    const last = messages[messages.length - 1];
    return last?.role === "assistant" && last.content.length === 0;
  }, [isLoading, messages]);

  if (bootstrapError) {
    return (
      <div>
        <Link
          href="/student"
          className="text-sm text-[#A1A1AA] transition-colors hover:text-[#F4F4F5]"
        >
          ← Назад
        </Link>
        <p className="mt-6 text-sm text-[#EF4444]">{bootstrapError}</p>
      </div>
    );
  }

  return (
    <div className="-mx-4 -my-4 flex min-h-[calc(100dvh-3.5rem)] flex-col lg:-mx-6 lg:-my-6 lg:min-h-[calc(100dvh-3.5rem)]">
      <header className="sticky top-14 z-20 flex items-center gap-3 border-b border-[rgba(139,92,246,0.08)] bg-[#0F0D17] px-4 py-3">
        <Link
          href="/student"
          className="shrink-0 text-sm text-[#A1A1AA] transition-colors hover:text-[#F4F4F5]"
        >
          ← Назад
        </Link>
        <div className="flex flex-1 items-center justify-center gap-2">
          <span aria-hidden="true">{ravenMeta.emoji}</span>
          <span
            className="text-sm font-semibold"
            style={{ color: ravenMeta.color }}
          >
            {ravenMeta.label}
          </span>
        </div>
        <span className="max-w-[120px] shrink-0 truncate text-xs text-[#52525B]">
          {topic?.name ?? ""}
        </span>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        <div className="flex flex-col gap-4">
          {messages.map((msg, i) => {
            if (msg.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div
                    className="max-w-[80%] whitespace-pre-wrap rounded-[12px_12px_2px_12px] border border-[rgba(139,92,246,0.2)] bg-[rgba(139,92,246,0.15)] px-4 py-2 text-sm text-[#F4F4F5]"
                    dangerouslySetInnerHTML={{
                      __html: renderWithKaTeX(msg.content),
                    }}
                  />
                </div>
              );
            }
            // skip empty placeholder while streaming (typing indicator handles it)
            if (i === messages.length - 1 && msg.content.length === 0) {
              return null;
            }
            return (
              <div key={i} className="flex items-start gap-2">
                <div
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#181525] text-sm"
                >
                  {ravenMeta.emoji}
                </div>
                <div
                  className="max-w-[80%] whitespace-pre-wrap rounded-[12px_12px_12px_2px] border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.04)] px-4 py-2 text-sm text-[#A1A1AA]"
                  dangerouslySetInnerHTML={{
                    __html: renderWithKaTeX(msg.content),
                  }}
                />
              </div>
            );
          })}

          {showTyping && (
            <div className="flex items-start gap-2">
              <div
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#181525] text-sm"
              >
                {ravenMeta.emoji}
              </div>
              <div className="rounded-[12px_12px_12px_2px] border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.04)] px-4 py-3">
                <span className="inline-flex items-end gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-[#A1A1AA]"
                    style={{
                      animation: "typingDot 1.2s ease-in-out infinite",
                      animationDelay: "0s",
                    }}
                  />
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-[#A1A1AA]"
                    style={{
                      animation: "typingDot 1.2s ease-in-out infinite",
                      animationDelay: "0.15s",
                    }}
                  />
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-[#A1A1AA]"
                    style={{
                      animation: "typingDot 1.2s ease-in-out infinite",
                      animationDelay: "0.3s",
                    }}
                  />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-[rgba(139,92,246,0.08)] bg-[#0F0D17] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Напиши сообщение..."
            disabled={!bootstrapped}
            className="flex-1 resize-none rounded-lg border border-[rgba(139,92,246,0.08)] bg-[#09070F] px-3 py-2 text-sm text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[rgba(139,92,246,0.25)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            style={{ maxHeight: "96px" }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={isLoading || input.trim().length === 0 || !bootstrapped}
            aria-label="Отправить"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8B5CF6] text-white transition-all hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
