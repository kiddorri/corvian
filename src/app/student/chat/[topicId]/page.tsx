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
import { Info, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { createClient } from "@/lib/supabase/client";
import { StudentContext } from "../../layout";

type Raven = "huginn" | "muninn";
type ChatPhase = "huginn" | "transition" | "muninn" | "result";
type Message = { role: "user" | "assistant"; content: string };
type TopicMeta = { name: string; section: string };
type ResultData = { score: number; xpEarned: number; streak: number };
type Skill = { id: string; text: string; level: string; sort_order: number };
type Goal = { id: string; text: string; sort_order: number };

const RAVEN_META: Record<Raven, { emoji: string; label: string; color: string }> = {
  huginn: { emoji: "🔵", label: "Хугин", color: "#818CF8" },
  muninn: { emoji: "🟣", label: "Мунин", color: "#8B5CF6" },
};

const PHASE_LABEL: Record<Raven, string> = {
  huginn: "Теория",
  muninn: "Практика",
};

const HUGINN_GREETING = "Привет! Я готов изучать эту тему.";
const MUNINN_GREETING =
  "Привет, Мунин! Я прошёл теорию с Хугином и готов к задачам.";

const HUGINN_DONE_PHRASE = "Мунин уже ждёт";
const MUNINN_DONE_PHRASE = "Все задачи решены";

const XP_HUGINN_SESSION = 50;
const XP_TOPIC_COMPLETE = 100;
const BASE_SCORE = 80;

function MessageContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-[#F4F4F5]">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="mb-2 ml-4 list-disc last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="mb-0.5">{children}</li>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="my-2 overflow-x-auto rounded-lg bg-[#09070F] p-3 text-xs">
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code className="rounded bg-[#181525] px-1.5 py-0.5 text-xs font-mono text-[#818CF8]">
              {children}
            </code>
          );
        },
        hr: () => <hr className="my-3 border-[rgba(139,92,246,0.08)]" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return "#22C55E";
  if (score >= 50) return "#F59E0B";
  return "#EF4444";
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function yesterdayIso(): string {
  return new Date(Date.now() - 86400000).toISOString().split("T")[0];
}

export default function ChatPage() {
  const router = useRouter();
  const params = useParams();
  const topicId =
    typeof params.topicId === "string" ? params.topicId : params.topicId?.[0];

  const { student, refreshStudent } = useContext(StudentContext);

  const [topic, setTopic] = useState<TopicMeta | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentRaven, setCurrentRaven] = useState<Raven>("huginn");
  const [chatPhase, setChatPhase] = useState<ChatPhase>("huginn");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [transitionText, setTransitionText] = useState("Хугин улетает...");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sentInitialRef = useRef(false);
  // latest messages snapshot for closure-free reads
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const ravenMeta = RAVEN_META[currentRaven];

  const handleHuginnComplete = useCallback(async () => {
    if (!sessionId || !topicId || !student) return;
    const supabase = createClient();

    const recent = messagesRef.current
      .slice(-6)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
    const summary = `Ученик изучал тему "${topic?.name ?? ""}". Краткое содержание диалога:\n${recent}`;

    await supabase
      .from("chat_sessions")
      .update({ ended_at: new Date().toISOString(), summary })
      .eq("id", sessionId);

    setChatPhase("transition");
    setTransitionText("Хугин улетает...");
    window.setTimeout(() => {
      setTransitionText("Мунин прилетает!");
    }, 1500);

    window.setTimeout(async () => {
      const sb = createClient();
      const { data: newSession, error } = await sb
        .from("chat_sessions")
        .insert({
          student_id: student.id,
          topic_id: topicId,
          raven: "muninn",
        })
        .select("id")
        .single();
      if (error || !newSession) {
        setBootstrapError("Не удалось начать сессию с Мунином.");
        return;
      }
      setSessionId(newSession.id);
      setCurrentRaven("muninn");
      setMessages([]);
      messagesRef.current = [];
      setChatPhase("muninn");
      // Trigger Muninn greeting via the auto-greeting effect
      sentInitialRef.current = false;
    }, 3000);
  }, [sessionId, topicId, student, topic]);

  const handleMuninComplete = useCallback(async () => {
    if (!sessionId || !topicId || !student) return;
    const supabase = createClient();

    await supabase
      .from("chat_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId);

    const score = BASE_SCORE;

    await supabase
      .from("student_progress")
      .update({
        status: "completed",
        score,
        attempts: 1,
        last_session_at: new Date().toISOString(),
      })
      .eq("student_id", student.id)
      .eq("topic_id", topicId);

    const xpEarned = XP_HUGINN_SESSION + XP_TOPIC_COMPLETE;
    const newXp = (student.xp ?? 0) + xpEarned;
    await supabase
      .from("students")
      .update({ xp: newXp })
      .eq("id", student.id);

    const today = todayIso();
    let newStreak = student.streak_days ?? 0;
    if (student.streak_last_date !== today) {
      newStreak =
        student.streak_last_date === yesterdayIso()
          ? (student.streak_days ?? 0) + 1
          : 1;
      await supabase
        .from("students")
        .update({ streak_days: newStreak, streak_last_date: today })
        .eq("id", student.id);
    }

    refreshStudent();
    setResultData({ score, xpEarned, streak: newStreak });
    setChatPhase("result");
  }, [sessionId, topicId, student, refreshStudent]);

  const handleReturnToHuginn = useCallback(async () => {
    if (!topicId || !student || isLoading) return;
    const supabase = createClient();

    if (sessionId) {
      await supabase
        .from("chat_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sessionId);
    }

    const { data: newSession, error } = await supabase
      .from("chat_sessions")
      .insert({
        student_id: student.id,
        topic_id: topicId,
        raven: "huginn",
      })
      .select("id")
      .single();
    if (error || !newSession) {
      setBootstrapError("Не удалось вернуться к теории.");
      return;
    }

    setSessionId(newSession.id);
    setCurrentRaven("huginn");
    setMessages([]);
    messagesRef.current = [];
    setChatPhase("huginn");
    sentInitialRef.current = false;
  }, [sessionId, topicId, student, isLoading]);

  const sendMessage = useCallback(
    async (
      text: string,
      override?: { sessionId?: string; raven?: Raven },
    ) => {
      if (!student || !topicId) return;
      const sid = override?.sessionId ?? sessionId;
      const rv = override?.raven ?? currentRaven;
      if (!sid) return;

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
            sessionId: sid,
            message: trimmed,
            raven: rv,
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
      let errored = false;

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
                errored = true;
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

      if (errored) return;

      // Detect phase transitions based on raven response
      if (rv === "huginn" && assistant.includes(HUGINN_DONE_PHRASE)) {
        handleHuginnComplete();
      } else if (rv === "muninn" && assistant.includes(MUNINN_DONE_PHRASE)) {
        handleMuninComplete();
      }
    },
    [
      student,
      sessionId,
      topicId,
      currentRaven,
      handleHuginnComplete,
      handleMuninComplete,
    ],
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

      const [skillsRes, goalsRes] = await Promise.all([
        supabase
          .from("skills")
          .select("id, text, level, sort_order")
          .eq("topic_id", topicId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("learning_goals")
          .select("id, text, sort_order")
          .eq("topic_id", topicId)
          .order("sort_order", { ascending: true }),
      ]);
      if (cancelled) return;
      setSkills((skillsRes.data ?? []) as Skill[]);
      setGoals((goalsRes.data ?? []) as Goal[]);

      const { data: openSession } = await supabase
        .from("chat_sessions")
        .select("id, raven")
        .eq("student_id", studentId)
        .eq("topic_id", topicId)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let resolvedSessionId: string;
      let resolvedRaven: Raven;

      if (openSession) {
        resolvedSessionId = openSession.id;
        resolvedRaven = (openSession.raven as Raven) ?? "huginn";
      } else {
        const { data: completedHuginn } = await supabase
          .from("chat_sessions")
          .select("id")
          .eq("student_id", studentId)
          .eq("topic_id", topicId)
          .eq("raven", "huginn")
          .not("ended_at", "is", null)
          .limit(1)
          .maybeSingle();

        const startRaven: Raven = completedHuginn ? "muninn" : "huginn";
        const { data: newSession, error: createError } = await supabase
          .from("chat_sessions")
          .insert({
            student_id: studentId,
            topic_id: topicId,
            raven: startRaven,
          })
          .select("id")
          .single();
        if (createError || !newSession) {
          if (!cancelled) setBootstrapError("Не удалось начать сессию.");
          return;
        }
        resolvedSessionId = newSession.id;
        resolvedRaven = startRaven;
      }

      if (cancelled) return;
      setSessionId(resolvedSessionId);
      setCurrentRaven(resolvedRaven);
      setChatPhase(resolvedRaven);

      const { data: history } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("session_id", resolvedSessionId)
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

  // Auto-send greeting when session has no history
  useEffect(() => {
    if (
      bootstrapped &&
      sessionId &&
      messages.length === 0 &&
      !sentInitialRef.current &&
      student &&
      (chatPhase === "huginn" || chatPhase === "muninn")
    ) {
      sentInitialRef.current = true;
      const greeting =
        currentRaven === "huginn" ? HUGINN_GREETING : MUNINN_GREETING;
      sendMessage(greeting);
    }
  }, [
    bootstrapped,
    sessionId,
    messages.length,
    student,
    currentRaven,
    chatPhase,
    sendMessage,
  ]);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    const max = 4 * 24;
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

  if (chatPhase === "transition") {
    return (
      <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgba(129,140,248,0.18),rgba(139,92,246,0.12)_40%,transparent_70%)] px-6 transition-colors duration-1000">
        <div className="flex items-center gap-6">
          <span
            className="text-5xl transition-all duration-700"
            style={{
              opacity: transitionText.startsWith("Хугин") ? 1 : 0.3,
              transform: transitionText.startsWith("Хугин")
                ? "scale(1) translateX(0)"
                : "scale(0.7) translateX(-20px)",
            }}
            aria-hidden="true"
          >
            🔵
          </span>
          <span
            className="text-5xl transition-all duration-700"
            style={{
              opacity: transitionText.startsWith("Мунин") ? 1 : 0.3,
              transform: transitionText.startsWith("Мунин")
                ? "scale(1) translateX(0)"
                : "scale(0.7) translateX(20px)",
            }}
            aria-hidden="true"
          >
            🟣
          </span>
        </div>
        <p
          key={transitionText}
          className="animate-fade-in mt-8 text-lg text-[#A1A1AA]"
        >
          {transitionText}
        </p>
      </div>
    );
  }

  if (chatPhase === "result" && resultData) {
    const color = scoreColor(resultData.score);
    return (
      <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2"
          style={{
            background:
              "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div className="animate-fade-in flex w-full max-w-xs flex-col items-center text-center">
          <div className="flex items-center gap-3 text-5xl" aria-hidden="true">
            <span>🔵</span>
            <span>🟣</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#F4F4F5]">
            Тема завершена!
          </h1>
          {topic?.name && (
            <p className="mt-1 text-sm text-[#A1A1AA]">{topic.name}</p>
          )}

          <p
            className="mt-8 font-mono text-5xl font-bold"
            style={{ color }}
          >
            {resultData.score}
          </p>
          <p className="mt-1 text-sm text-[#52525B]">из 100</p>

          <div className="mt-8 grid w-full grid-cols-3 gap-2">
            <div className="rounded-lg border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-3">
              <p className="font-mono text-sm text-[#8B5CF6]">
                ⚡ +{resultData.xpEarned}
              </p>
              <p className="mt-1 text-[10px] text-[#52525B]">XP</p>
            </div>
            <div className="rounded-lg border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-3">
              <p className="font-mono text-sm text-[#F97316]">
                🔥 {resultData.streak}
              </p>
              <p className="mt-1 text-[10px] text-[#52525B]">дней</p>
            </div>
            <div className="rounded-lg border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-3">
              <p className="font-mono text-sm text-[#22C55E]">✓</p>
              <p className="mt-1 text-[10px] text-[#52525B]">завершено</p>
            </div>
          </div>

          <div className="mt-10 flex w-full flex-col gap-3">
            <Link
              href="/student/library"
              className="inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-8 py-[0.85rem] text-base font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)]"
            >
              Следующая тема
            </Link>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="inline-flex w-full items-center justify-center rounded-xl border border-[rgba(139,92,246,0.25)] bg-transparent px-8 py-[0.85rem] text-base font-medium text-[#F4F4F5] transition-all hover:border-[rgba(139,92,246,0.4)] hover:bg-[rgba(139,92,246,0.05)]"
            >
              Пересдать
            </button>
            <Link
              href="/student"
              className="inline-flex w-full items-center justify-center rounded-xl px-8 py-[0.85rem] text-sm text-[#71717A] transition-colors hover:bg-[rgba(139,92,246,0.05)] hover:text-[#F4F4F5]"
            >
              На главную
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Шапка сайдбара */}
      <div className="border-b border-[rgba(139,92,246,0.08)] p-5">
        <h2 className="text-lg font-bold text-[#F4F4F5]">{topic?.name ?? "Тема"}</h2>
        <p className="mt-1 text-sm text-[#71717A]">{topic?.section ?? ""}</p>

        {/* Прогресс-бар */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-[#A1A1AA]">Прогресс</span>
            <span className="font-mono text-xs font-bold text-[#8B5CF6]">
              0/{goals.length + skills.length}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#181525]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#8B5CF6] transition-all duration-500"
              style={{ width: "0%" }}
            />
          </div>
        </div>
      </div>

      {/* Timeline с шагами */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="relative flex flex-col">

          {/* Цели обучения */}
          {goals.length > 0 && (
            <>
              <div className="mb-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#52525B]">
                  Цели обучения
                </span>
              </div>
              {goals.map((goal, i) => (
                <div key={goal.id} className="relative flex gap-3 pb-4">
                  {/* Вертикальная линия */}
                  {(i < goals.length - 1 || skills.length > 0) && (
                    <div className="absolute left-[11px] top-7 bottom-0 w-[2px] bg-[#181525]" />
                  )}
                  {/* Индикатор */}
                  <div className="relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 border-[#52525B] bg-[#09070F]">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#52525B]" />
                  </div>
                  {/* Контент */}
                  <div className="flex-1 rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#09070F] px-3.5 py-3">
                    <p className="text-sm leading-snug text-[#A1A1AA]">{goal.text}</p>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Разделитель между целями и навыками */}
          {goals.length > 0 && skills.length > 0 && (
            <div className="relative mb-3 mt-1 flex items-center gap-3">
              <div className="relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center">
                <div className="h-[2px] w-3 bg-[#52525B]" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#52525B]">
                Навыки для освоения
              </span>
            </div>
          )}

          {/* Навыки */}
          {skills.length > 0 && goals.length === 0 && (
            <div className="mb-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#52525B]">
                Навыки для освоения
              </span>
            </div>
          )}
          {skills.map((skill, i) => {
            const levelColor = skill.level === "продвинутый"
              ? "#8B5CF6"
              : skill.level === "олимпиадный"
              ? "#F59E0B"
              : "#3B82F6";
            return (
              <div key={skill.id} className="relative flex gap-3 pb-4">
                {/* Вертикальная линия */}
                {i < skills.length - 1 && (
                  <div className="absolute left-[11px] top-7 bottom-0 w-[2px] bg-[#181525]" />
                )}
                {/* Индикатор с цветом уровня */}
                <div
                  className="relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 bg-[#09070F]"
                  style={{ borderColor: levelColor }}
                >
                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: levelColor }} />
                </div>
                {/* Контент */}
                <div className="flex-1 rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#09070F] px-3.5 py-3">
                  <p className="text-sm font-medium leading-snug text-[#F4F4F5]">{skill.text}</p>
                  <span
                    className="mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      color: levelColor,
                      backgroundColor: `${levelColor}15`,
                    }}
                  >
                    {skill.level}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Пустое состояние */}
          {goals.length === 0 && skills.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <span className="text-sm text-[#52525B]">Учитель не добавил целей и навыков</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)]">
      <aside className="hidden lg:flex lg:w-[320px] lg:flex-shrink-0 lg:flex-col lg:border-r lg:border-[rgba(139,92,246,0.08)] lg:bg-[#0F0D17]">
        {sidebarContent}
      </aside>

      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside className="fixed left-0 top-0 z-50 h-full w-[320px] overflow-y-auto bg-[#0F0D17] lg:hidden">
            {sidebarContent}
          </aside>
        </>
      )}

      <div className="flex flex-1 flex-col">
      <header className="sticky top-14 z-20 flex items-center gap-3 border-b border-[rgba(139,92,246,0.08)] bg-[#0F0D17] px-4 py-3">
        <Link
          href="/student"
          className="shrink-0 text-sm text-[#A1A1AA] transition-colors hover:text-[#F4F4F5]"
        >
          ← Назад
        </Link>
        <button
          type="button"
          aria-label="Информация о теме"
          onClick={() => setSidebarOpen((v) => !v)}
          className="shrink-0 text-[#A1A1AA] transition-colors hover:text-[#F4F4F5] lg:hidden"
        >
          <Info size={18} />
        </button>
        <div className="flex flex-1 items-center justify-center gap-2">
          <span aria-hidden="true">{ravenMeta.emoji}</span>
          <span
            className="text-sm font-semibold"
            style={{ color: ravenMeta.color }}
          >
            {ravenMeta.label}
          </span>
          <span className="inline-flex items-center rounded-full border border-[rgba(139,92,246,0.15)] bg-transparent px-[0.5rem] py-[0.1rem] text-[10px] font-medium uppercase tracking-wider text-[#71717A]">
            {PHASE_LABEL[currentRaven]}
          </span>
        </div>
        <span className="max-w-[120px] shrink-0 truncate text-xs text-[#52525B]">
          {topic?.name ?? ""}
        </span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-4">
          {messages.map((msg, i) => {
            if (msg.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-[12px_12px_2px_12px] border border-[rgba(139,92,246,0.2)] bg-[rgba(139,92,246,0.15)] px-4 py-2 text-sm text-[#F4F4F5]">
                    <MessageContent content={msg.content} />
                  </div>
                </div>
              );
            }
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
                <div className="max-w-[80%] rounded-[12px_12px_12px_2px] border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.04)] px-4 py-2 text-sm text-[#A1A1AA]">
                  <MessageContent content={msg.content} />
                </div>
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
        {chatPhase === "muninn" && (
          <div className="mb-2 flex justify-start">
            <button
              type="button"
              onClick={handleReturnToHuginn}
              disabled={isLoading || !bootstrapped}
              className="text-sm text-[#A1A1AA] transition-colors hover:text-[#F4F4F5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              ↩ Вернуться к теории
            </button>
          </div>
        )}
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
    </div>
  );
}
