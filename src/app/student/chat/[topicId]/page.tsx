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
import { Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ChatMessage } from "@/components/ChatMessage";
import { GoalTracker } from "@/components/GoalTracker";
import { ChatInput } from "@/components/ChatInput";
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

const XP_HUGINN_SESSION = 50;
const XP_TOPIC_COMPLETE = 100;
const BASE_SCORE = 80;

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
  const [isLoading, setIsLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [transitionText, setTransitionText] = useState("Хугин улетает...");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalStatuses, setGoalStatuses] = useState<
    Record<string, "not_started" | "in_progress" | "mastered">
  >({});
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTextRef = useRef<string>("");
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
              if (data.newBubble) {
                // Финализируем текущий пузырь и создаём новый для вариации
                if (throttleRef.current) {
                  clearTimeout(throttleRef.current);
                  throttleRef.current = null;
                }
                const finalizedFirst = assistant;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant" as const,
                    content: finalizedFirst,
                  };
                  return [
                    ...updated,
                    { role: "assistant" as const, content: "" },
                  ];
                });
                assistant = "";
                pendingTextRef.current = "";
                continue;
              }
              if (data.text) {
                assistant += data.text;
                pendingTextRef.current = assistant;
                if (!throttleRef.current) {
                  throttleRef.current = setTimeout(() => {
                    setMessages((prev) => {
                      const updated = [...prev];
                      updated[updated.length - 1] = {
                        role: "assistant" as const,
                        content: pendingTextRef.current,
                      };
                      return updated;
                    });
                    throttleRef.current = null;
                  }, 80);
                }
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
              if (data.done) {
                if (data.stepAdvanced && rv === "huginn" && sid) {
                  const sb = createClient();
                  const { data: updatedProgress } = await sb
                    .from("goal_step_progress")
                    .select("goal_id, status")
                    .eq("session_id", sid);
                  if (updatedProgress) {
                    const newStatuses: Record<
                      string,
                      "not_started" | "in_progress" | "mastered"
                    > = {};
                    for (const gp of updatedProgress as Array<{
                      goal_id: string;
                      status: string;
                    }>) {
                      newStatuses[gp.goal_id] =
                        gp.status === "completed"
                          ? "mastered"
                          : gp.status === "pending"
                            ? "not_started"
                            : "in_progress";
                    }
                    setGoalStatuses(newStatuses);
                  }
                }

                if (data.stepAdvanced && rv === "muninn" && sid) {
                  const sb = createClient();
                  const { data: updatedTasks } = await sb
                    .from("task_progress")
                    .select("task_id, status")
                    .eq("session_id", sid);
                  if (updatedTasks) {
                    const tStatuses: Record<string, string> = {};
                    for (const tp of updatedTasks as Array<{
                      task_id: string;
                      status: string;
                    }>) {
                      tStatuses[tp.task_id] = tp.status;
                    }
                    setTaskStatuses(tStatuses);
                  }
                }

                if (data.stepFinished) {
                  if (rv === "huginn") {
                    handleHuginnComplete();
                  } else if (rv === "muninn") {
                    handleMuninComplete();
                  }
                }
                break;
              }
            } catch {
              // ignore malformed line
            }
          }
        }
      }

      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
      if (!errored) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant" as const,
            content: assistant,
          };
          return updated;
        });
      }

      setIsLoading(false);

      if (errored) return;
    },
    [
      student,
      sessionId,
      topicId,
      currentRaven,
      handleHuginnComplete,
      handleMuninComplete,
      goalStatuses,
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

      const { data: goalProgressData } = await supabase
        .from("goal_step_progress")
        .select("goal_id, status")
        .eq("session_id", resolvedSessionId);

      if (cancelled) return;
      if (goalProgressData) {
        const statuses: Record<string, string> = {};
        for (const gp of goalProgressData as Array<{
          goal_id: string;
          status: string;
        }>) {
          statuses[gp.goal_id] =
            gp.status === "completed" ? "mastered" : gp.status;
        }
        setGoalStatuses(
          statuses as Record<
            string,
            "not_started" | "in_progress" | "mastered"
          >,
        );
      }

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
    bottomAnchorRef.current?.scrollIntoView({ block: "end" });
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isLoading]);

  const showTyping = useMemo(() => {
    if (!isLoading) return false;
    const last = messages[messages.length - 1];
    return last?.role === "assistant" && last.content.length === 0;
  }, [isLoading, messages]);

  const goalProgress = useMemo(() => {
    const out: Record<string, "not_started" | "in_progress" | "mastered"> = {};
    const firstUnmasteredIdx = goals.findIndex(
      (g) => goalStatuses[g.id] !== "mastered",
    );
    goals.forEach((goal, i) => {
      if (goalStatuses[goal.id]) {
        out[goal.id] = goalStatuses[goal.id];
      } else {
        const allPrevDone = goals
          .slice(0, i)
          .every((g) => goalStatuses[g.id] === "mastered");
        out[goal.id] =
          allPrevDone && i === firstUnmasteredIdx
            ? "in_progress"
            : "not_started";
      }
    });
    return out;
  }, [goals, goalStatuses]);

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
      <div className="border-b border-[rgba(255,255,255,0.06)] px-5 py-5">
        <p className="text-[15px] font-bold leading-tight text-[rgba(255,255,255,0.9)]">
          {topic?.name ?? "Тема"}
        </p>
        <p className="mt-1 text-[12px] text-[rgba(255,255,255,0.35)]">
          {topic?.section ?? ""}
        </p>
      </div>
      <GoalTracker goals={goals} progress={goalProgress} />
    </div>
  );

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)]">
      <aside className="hidden lg:flex lg:w-[320px] lg:flex-shrink-0 lg:flex-col lg:border-r lg:border-[rgba(255,255,255,0.06)] lg:bg-[#0F0D17] lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
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
        {chatPhase === "muninn" && (
          <button
            type="button"
            onClick={handleReturnToHuginn}
            disabled={isLoading || !bootstrapped}
            className="shrink-0 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.06)] px-3 py-1.5 text-[12px] font-medium text-[rgba(255,255,255,0.4)] transition-colors hover:text-[rgba(255,255,255,0.7)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            ↩ К теории
          </button>
        )}
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
            if (
              msg.role === "assistant" &&
              i === messages.length - 1 &&
              msg.content.length === 0
            ) {
              return null;
            }
            return (
              <ChatMessage
                key={i}
                message={msg}
                ravenLabel={msg.role === "assistant" ? ravenMeta.label : undefined}
                ravenColor={msg.role === "assistant" ? ravenMeta.color : undefined}
              />
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
          <div ref={bottomAnchorRef} aria-hidden="true" />
        </div>
      </div>

      <div className="sticky bottom-0 bg-[#0F0D17] pb-[env(safe-area-inset-bottom)]">
        <ChatInput
          disabled={isLoading || !bootstrapped}
          onSend={(text) => sendMessage(text)}
          placeholder={`Задай вопрос по ${topic?.name ?? "теме"}...`}
        />
      </div>
      </div>
    </div>
  );
}
