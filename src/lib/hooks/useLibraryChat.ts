"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface LibraryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LibrarySessionInfo {
  id: string;
  raven: "huginn" | "muninn";
  current_step_type: string | null;
  current_step_id: string | null;
  step_index: number | null;
  step_status: string | null;
}

export type LibraryChatState =
  | { kind: "loading" }
  | { kind: "active"; session: LibrarySessionInfo; messages: LibraryMessage[] }
  | { kind: "transition" }
  | { kind: "completed" }
  | { kind: "error"; message: string };

export function useLibraryChat(libraryStudentId: string, libraryTopicId: string) {
  const [state, setState] = useState<LibraryChatState>({ kind: "loading" });
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef<string>("");
  const autoStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    autoStartedRef.current = false;
    (async () => {
      try {
        const sessionRes = await fetch("/api/library/chat/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ library_student_id: libraryStudentId, library_topic_id: libraryTopicId }),
        });
        const sessionData = await sessionRes.json();
        if (!sessionRes.ok) {
          if (cancelled) return;
          setState({ kind: "error", message: sessionData.error ?? "Не удалось создать сессию" });
          return;
        }
        const session: LibrarySessionInfo = sessionData.session;

        const msgsRes = await fetch(`/api/library/chat/messages?sessionId=${session.id}`);
        const msgsData = await msgsRes.json();
        const messages: LibraryMessage[] = msgsRes.ok
          ? (msgsData.messages ?? [])
          : [];

        if (cancelled) return;
        setState({ kind: "active", session, messages });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: `Сетевая ошибка: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [libraryStudentId, libraryTopicId]);

  const sendMessage = useCallback(
    async (text: string, opts: { autoStart?: boolean } = {}) => {
      if (state.kind !== "active" || isStreaming) return;
      const { session } = state;

      if (!opts.autoStart) {
        const userMsg: LibraryMessage = { role: "user", content: text };
        setState({
          kind: "active",
          session,
          messages: [...state.messages, userMsg],
        });
      }
      setIsStreaming(true);
      setStreamingText("");
      streamingRef.current = "";

      try {
        const res = await fetch("/api/library/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.id,
            message: text,
            raven: session.raven,
            topicId: libraryTopicId,
            libraryStudentId,
            autoStart: opts.autoStart === true,
          }),
        });

        if (!res.ok || !res.body) {
          setIsStreaming(false);
          setStreamingText("");
          setState((prev) =>
            prev.kind === "active"
              ? {
                  ...prev,
                  messages: [
                    ...prev.messages,
                    { role: "assistant", content: "Ошибка соединения. Попробуй ещё раз." },
                  ],
                }
              : prev,
          );
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let stepAdvanced = false;
        let stepFinished = false;
        let bubbleAccumulator = "";
        const collectedBubbles: string[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;
            try {
              const data = JSON.parse(payload);
              if (data.text) {
                streamingRef.current += data.text;
                bubbleAccumulator += data.text;
                setStreamingText(streamingRef.current);
              }
              if (data.newBubble) {
                if (bubbleAccumulator.trim()) {
                  collectedBubbles.push(bubbleAccumulator.trim());
                }
                bubbleAccumulator = "";
                streamingRef.current = "";
                setStreamingText("");
              }
              if (data.done) {
                stepAdvanced = !!data.stepAdvanced;
                stepFinished = !!data.stepFinished;
              }
              if (data.error) {
                throw new Error(data.error);
              }
            } catch (err) {
              console.error("SSE parse error:", err);
            }
          }
        }

        if (bubbleAccumulator.trim()) {
          collectedBubbles.push(bubbleAccumulator.trim());
        }

        setIsStreaming(false);
        setStreamingText("");
        streamingRef.current = "";

        const newAssistantMessages: LibraryMessage[] = collectedBubbles.map((c) => ({
          role: "assistant",
          content: c,
        }));

        if (stepFinished) {
          if (session.raven === "huginn") {
            setState((prev) =>
              prev.kind === "active"
                ? {
                    ...prev,
                    messages: [...prev.messages, ...newAssistantMessages],
                  }
                : prev,
            );
            setTimeout(async () => {
              setState({ kind: "transition" });
              try {
                const transRes = await fetch("/api/library/chat/transition", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    sessionId: session.id,
                    library_student_id: libraryStudentId,
                    library_topic_id: libraryTopicId,
                  }),
                });
                const transData = await transRes.json();
                if (!transRes.ok) throw new Error(transData.error ?? "Ошибка перехода");
                const newSession: LibrarySessionInfo = transData.session;
                autoStartedRef.current = false;
                setState({ kind: "active", session: newSession, messages: [] });
              } catch (err) {
                setState({
                  kind: "error",
                  message: `Ошибка перехода к Мунину: ${err instanceof Error ? err.message : String(err)}`,
                });
              }
            }, 1500);
            return;
          } else {
            setState((prev) =>
              prev.kind === "active"
                ? {
                    ...prev,
                    messages: [...prev.messages, ...newAssistantMessages],
                  }
                : prev,
            );
            setTimeout(async () => {
              try {
                await fetch("/api/library/chat/complete", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ sessionId: session.id }),
                });
              } catch {}
              setState({ kind: "completed" });
            }, 1500);
            return;
          }
        }

        setState((prev) => {
          if (prev.kind !== "active") return prev;
          return {
            ...prev,
            messages: [...prev.messages, ...newAssistantMessages],
          };
        });

        if (stepAdvanced) {
          try {
            const refreshRes = await fetch("/api/library/chat/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                library_student_id: libraryStudentId,
                library_topic_id: libraryTopicId,
              }),
            });
            const refreshData = await refreshRes.json();
            if (refreshRes.ok) {
              const updated: LibrarySessionInfo = refreshData.session;
              setState((prev) =>
                prev.kind === "active" ? { ...prev, session: updated } : prev,
              );
            }
          } catch {}
        }
      } catch (err) {
        setIsStreaming(false);
        setStreamingText("");
        setState({
          kind: "error",
          message: `Ошибка: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    },
    [state, isStreaming, libraryStudentId, libraryTopicId],
  );

  // Автостарт: новая сессия (история пуста) — ворон сам отправляет первое сообщение.
  useEffect(() => {
    if (
      state.kind === "active" &&
      state.messages.length === 0 &&
      !isStreaming &&
      !autoStartedRef.current
    ) {
      autoStartedRef.current = true;
      void sendMessage("Начни урок.", { autoStart: true });
    }
  }, [state, isStreaming, sendMessage]);

  return { state, streamingText, isStreaming, sendMessage };
}
