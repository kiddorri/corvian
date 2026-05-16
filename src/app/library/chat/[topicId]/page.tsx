"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { Send, ArrowLeft, Brain, Target } from "lucide-react";
import { getLibraryStudent } from "@/lib/auth/library-session";
import { useLibraryChat } from "@/lib/hooks/useLibraryChat";
import { FormattedText } from "@/components/FormattedText";

interface PageProps {
  params: Promise<{ topicId: string }>;
}

export default function LibraryChatPage({ params }: PageProps) {
  const { topicId } = use(params);
  const router = useRouter();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState<string>("");
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const s = getLibraryStudent();
    if (!s) {
      router.push(`/library/signup?redirect=${encodeURIComponent(`/library/chat/${topicId}`)}`);
      return;
    }
    setStudentId(s.id);
    setStudentName(s.display_name);
    setAuthChecked(true);
  }, [topicId, router]);

  if (!authChecked || !studentId) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center">
        <div className="text-[#A1A1AA] text-sm">Загрузка...</div>
      </div>
    );
  }

  return <ChatContent topicId={topicId} studentId={studentId} studentName={studentName} />;
}

function ChatContent({
  topicId,
  studentId,
  studentName,
}: {
  topicId: string;
  studentId: string;
  studentName: string;
}) {
  const router = useRouter();
  const { state, streamingText, isStreaming, sendMessage } = useLibraryChat(studentId, topicId);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state, streamingText]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage(text);
    inputRef.current?.focus();
  };

  if (state.kind === "loading") {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center">
        <div className="text-[#A1A1AA] text-sm">Загружаем урок...</div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="min-h-screen bg-[#09090B] text-[#F4F4F5] flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <div className="text-red-400 font-bold mb-2">Ошибка</div>
          <div className="text-sm text-red-300 mb-4">{state.message}</div>
          <button
            onClick={() => router.push("/library")}
            className="rounded-lg bg-[#8B5CF6] px-4 py-2 text-sm text-white"
          >
            Вернуться
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === "transition") {
    return (
      <div className="min-h-screen bg-[#09090B] text-[#F4F4F5] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="mb-6 flex justify-center">
            <div className="h-12 w-12 animate-pulse rounded-full bg-[#8B5CF6]/20 flex items-center justify-center">
              <Brain className="h-6 w-6 text-[#8B5CF6]" />
            </div>
          </div>
          <h2 className="text-2xl font-bold">Передаём тебя Мунину</h2>
          <p className="mt-2 text-sm text-[#A1A1AA]">
            Хугин рассказал что ты узнал. Сейчас будут задачи для закрепления.
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === "completed") {
    return (
      <div className="min-h-screen bg-[#09090B] text-[#F4F4F5] flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-[rgba(139,92,246,0.2)] bg-[#18181B] p-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="h-14 w-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Target className="h-7 w-7 text-emerald-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold">Урок пройден</h2>
          <p className="mt-2 text-sm text-[#A1A1AA]">
            Ты молодец, {studentName}. Прошёл всю тему от теории до практики.
          </p>
          <div className="mt-6 flex gap-3 justify-center">
            <button
              onClick={() => router.push("/library")}
              className="rounded-lg bg-[#8B5CF6] px-5 py-2.5 text-sm font-medium text-white"
            >
              В библиотеку
            </button>
            <button
              onClick={() => router.push(`/library/topic/${topicId}`)}
              className="rounded-lg border border-[rgba(139,92,246,0.3)] px-5 py-2.5 text-sm text-[#A1A1AA]"
            >
              О теме
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { session, messages } = state;
  const ravenLabel = session.raven === "huginn" ? "Хугин" : "Мунин";
  const ravenColor = session.raven === "huginn" ? "#8B5CF6" : "#10B981";

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F4F4F5] flex flex-col">
      <header className="border-b border-[rgba(139,92,246,0.1)] bg-[#09090B]/90 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.push(`/library/topic/${topicId}`)}
            className="flex items-center gap-2 text-sm text-[#A1A1AA] hover:text-[#F4F4F5]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Выйти</span>
          </button>
          <div className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full"
              style={{ background: ravenColor }}
            />
            <span className="text-sm font-medium" style={{ color: ravenColor }}>
              {ravenLabel}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} ravenLabel={ravenLabel} ravenColor={ravenColor} />
            ))}

            {isStreaming && streamingText && (
              <MessageBubble
                message={{ role: "assistant", content: streamingText }}
                ravenLabel={ravenLabel}
                ravenColor={ravenColor}
                streaming
              />
            )}

            {(isStreaming || messages.length === 0) && !streamingText && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-[rgba(255,255,255,0.05)] px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-[#A1A1AA] animate-pulse" />
                    <span className="h-2 w-2 rounded-full bg-[#A1A1AA] animate-pulse delay-150" />
                    <span className="h-2 w-2 rounded-full bg-[#A1A1AA] animate-pulse delay-300" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-[rgba(139,92,246,0.1)] bg-[#09090B]/90 backdrop-blur p-4">
        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Напиши ответ..."
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none rounded-2xl border border-[rgba(139,92,246,0.2)] bg-[#18181B] px-4 py-3 text-sm text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[#8B5CF6] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="rounded-2xl bg-[#8B5CF6] px-4 text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </footer>
    </div>
  );
}

function MessageBubble({
  message,
  ravenLabel,
  ravenColor,
  streaming,
}: {
  message: { role: string; content: string };
  ravenLabel: string;
  ravenColor: string;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[82%] px-4 py-3 text-white"
          style={{
            background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
            borderRadius: "16px 16px 4px 16px",
          }}
        >
          <FormattedText text={message.content} variant="chat" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[82%] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-[rgba(255,255,255,0.92)]"
        style={{ borderRadius: "16px 16px 16px 4px" }}
      >
        <p
          className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.5px]"
          style={{ color: ravenColor }}
        >
          {ravenLabel}
          {streaming && <span className="ml-1 opacity-60">печатает...</span>}
        </p>
        <FormattedText text={message.content} variant="chat" />
      </div>
    </div>
  );
}
