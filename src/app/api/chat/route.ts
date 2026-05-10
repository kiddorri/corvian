import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { buildSystemPrompt } from "@/lib/services/prompt-builder";
import { StreamParser } from "@/lib/services/stream-parser";
import {
  initSessionSteps,
  advanceStep,
  type SessionState,
} from "@/lib/services/lesson-engine";
import { generateTaskVariation } from "@/lib/services/task-generator";

export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Topic = {
  name: string;
  section: string;
  classes?: { grade: number; subject: string } | null;
};

type Calibration = {
  theory_text: string | null;
  huginn_instructions: string | null;
  muninn_instructions: string | null;
  socratic_level: number;
  max_hints_before_answer: number;
  allow_humor: boolean;
  allow_analogies: boolean;
};

type Goal = { id: string; text: string };

export async function POST(req: NextRequest) {
  try {
    const { sessionId, message, raven, topicId, studentId } = await req.json();

    const supabase = getSupabase();

    const { data: calibration } = await supabase
      .from("calibrations")
      .select("*")
      .eq("topic_id", topicId)
      .single();

    const { data: topic } = await supabase
      .from("topics")
      .select("*, classes(grade, subject)")
      .eq("id", topicId)
      .single();

    const { data: goals } = await supabase
      .from("learning_goals")
      .select("id, text, sort_order")
      .eq("topic_id", topicId)
      .order("sort_order", { ascending: true });

    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    // Инициализировать шаги если это первое сообщение сессии
    if (!history || history.length === 0) {
      await initSessionSteps(supabase, sessionId, topicId, raven);
    }

    // Загрузить текущий шаг сессии
    const { data: sessionState } = await supabase
      .from("chat_sessions")
      .select("current_step_type, current_step_id, step_index, step_status")
      .eq("id", sessionId)
      .single();

    // Если шаги уже завершены (тема без целей или без задач) — сразу stepFinished
    if (
      sessionState?.step_status === "completed" &&
      (!history || history.length === 0)
    ) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                text:
                  raven === "huginn"
                    ? "У этой темы нет отдельных целей для изучения. Переходим к практике!"
                    : "У этой темы нет задач.",
              })}\n\n`,
            ),
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                stepAdvanced: false,
                stepFinished: true,
              })}\n\n`,
            ),
          );
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Загрузить данные текущего шага
    let currentStepData: { text: string; id: string } | null = null;
    let currentTaskData: {
      question: string;
      answer: string;
      steps: string | null;
      id: string;
    } | null = null;
    const stepProgress: { total: number; completed: number } = {
      total: 0,
      completed: 0,
    };

    if (
      sessionState?.current_step_type === "goal" &&
      sessionState.current_step_id
    ) {
      const { data: goalData } = await supabase
        .from("learning_goals")
        .select("id, text")
        .eq("id", sessionState.current_step_id)
        .single();
      currentStepData = goalData as { id: string; text: string } | null;

      const { data: allGoalProgress } = await supabase
        .from("goal_step_progress")
        .select("status")
        .eq("session_id", sessionId);
      if (allGoalProgress) {
        stepProgress.total = allGoalProgress.length;
        stepProgress.completed = allGoalProgress.filter(
          (g: { status: string }) => g.status === "completed",
        ).length;
      }
    } else if (
      sessionState?.current_step_type === "task" &&
      sessionState.current_step_id
    ) {
      const { data: taskData } = await supabase
        .from("tasks")
        .select("id, question, answer, steps")
        .eq("id", sessionState.current_step_id)
        .single();
      currentTaskData = taskData as {
        id: string;
        question: string;
        answer: string;
        steps: string | null;
      } | null;

      const { data: allTaskProgress } = await supabase
        .from("task_progress")
        .select("status")
        .eq("session_id", sessionId);
      if (allTaskProgress) {
        stepProgress.total = allTaskProgress.length;
        stepProgress.completed = allTaskProgress.filter(
          (t: { status: string }) => t.status === "completed",
        ).length;
      }
    }

    let huginnSummary = "";
    if (raven === "muninn") {
      const { data: huginnSession } = await supabase
        .from("chat_sessions")
        .select("summary")
        .eq("student_id", studentId)
        .eq("topic_id", topicId)
        .eq("raven", "huginn")
        .not("summary", "is", null)
        .order("ended_at", { ascending: false })
        .limit(1)
        .single();

      huginnSummary = huginnSession?.summary || "";
    }

    // Активная вариация задачи (хранится как system-сообщение в chat_messages)
    let activeVariation: { question: string; answer: string } | null = null;
    if (sessionState?.current_step_type === "task") {
      const { data: variationMsg } = await supabase
        .from("chat_messages")
        .select("content")
        .eq("session_id", sessionId)
        .eq("role", "system")
        .ilike("content", "VARIATION:%")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (variationMsg) {
        try {
          const raw = (variationMsg as { content: string }).content;
          const parsed = JSON.parse(raw.replace(/^VARIATION:/, ""));
          if (
            parsed &&
            typeof parsed.question === "string" &&
            typeof parsed.answer === "string"
          ) {
            activeVariation = {
              question: parsed.question,
              answer: parsed.answer,
            };
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    // Если есть активная вариация — подменяем данные задачи в промпте
    const promptCurrentTask =
      activeVariation && currentTaskData
        ? {
            id: currentTaskData.id,
            question: activeVariation.question,
            answer: activeVariation.answer,
            steps: null,
          }
        : currentTaskData;

    const systemPrompt = buildSystemPrompt({
      raven,
      topic: topic as Topic | null,
      calibration: calibration as Calibration | null,
      goals: (goals ?? []) as Goal[],
      currentGoal: currentStepData,
      currentTask: promptCurrentTask,
      stepProgress,
      huginnSummary: huginnSummary || undefined,
      isVariation: !!activeVariation,
    });

    await supabase
      .from("chat_messages")
      .insert({ session_id: sessionId, role: "user", content: message });

    // В messages для Anthropic API передаём только user/assistant (system-маркеры вариаций не нужны модели)
    const messages = [
      ...((history ?? []) as { role: string; content: string }[])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      { role: "user" as const, content: message },
    ];

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 30000);

    const stream = anthropic.messages.stream(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: systemPrompt,
        messages,
      },
      { signal: abortController.signal },
    );

    const encoder = new TextEncoder();
    const parser = new StreamParser();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const cleaned = parser.processChunk(event.delta.text);
              if (cleaned) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ text: cleaned })}\n\n`,
                  ),
                );
              }
            }
          }

          // Сбросить остаток буфера
          const remaining = parser.flush();
          if (remaining) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ text: remaining })}\n\n`,
              ),
            );
          }

          clearTimeout(timeout);

          const cleanedResponse = parser.getCleanedResponse();

          await supabase
            .from("chat_messages")
            .insert({
              session_id: sessionId,
              role: "assistant",
              content: cleanedResponse,
            });

          // Обработка маркеров state machine
          const hasStepDone = parser.hasStepDone();
          const hasTaskDone = parser.hasTaskDone();
          console.log(
            "[MARKER] hasStepDone:",
            hasStepDone,
            "hasTaskDone:",
            hasTaskDone,
            "step_type:",
            sessionState?.current_step_type,
            "step_id:",
            sessionState?.current_step_id,
          );

          let stepResult: {
            advanced: boolean;
            finished: boolean;
            nextStepId: string | null;
          } = { advanced: false, finished: false, nextStepId: null };

          if (hasStepDone || hasTaskDone) {
            const userMsgCount =
              (history ?? []).filter(
                (m: { role: string }) => m.role === "user",
              ).length + 1;
            const estimatedBefore =
              (sessionState?.step_index ?? 0) * 3;
            const msgsOnStep = userMsgCount - estimatedBefore;
            console.log(
              "[MARKER] msgsOnStep:",
              msgsOnStep,
              "userMsgCount:",
              userMsgCount,
              "estimatedBefore:",
              estimatedBefore,
              "step_index:",
              sessionState?.step_index,
            );

            if (
              msgsOnStep >= 2 ||
              (hasTaskDone && sessionState?.current_step_type === "task")
            ) {
              if (
                hasTaskDone &&
                sessionState?.current_step_type === "task"
              ) {
                console.log(
                  "[MARKER] activeVariation:",
                  !!activeVariation,
                  "currentTaskData:",
                  !!currentTaskData,
                  "topic:",
                  !!topic,
                );
                if (activeVariation) {
                  // Вариация решена — удалить маркер и advance
                  await supabase
                    .from("chat_messages")
                    .delete()
                    .eq("session_id", sessionId)
                    .eq("role", "system")
                    .ilike("content", "VARIATION:%");

                  stepResult = await advanceStep(
                    supabase,
                    sessionId,
                    topicId,
                    raven,
                    sessionState as SessionState | null,
                  );
                } else if (currentTaskData && topic) {
                  // Оригинальная задача решена — генерируем вариацию через Sonnet
                  try {
                    const variation = await generateTaskVariation(
                      currentTaskData.question,
                      currentTaskData.answer,
                      (topic as Topic).name,
                    );
                    await supabase.from("chat_messages").insert({
                      session_id: sessionId,
                      role: "system",
                      content: "VARIATION:" + JSON.stringify(variation),
                    });

                    // --- Второй стрим: Мунин выдаёт вариацию ---
                    try {
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify({ newBubble: true })}\n\n`,
                        ),
                      );

                      const variationPrompt = buildSystemPrompt({
                        raven: "muninn",
                        topic: topic as Topic | null,
                        calibration: calibration as Calibration | null,
                        goals: (goals ?? []) as Goal[],
                        currentGoal: null,
                        currentTask: {
                          id: currentTaskData.id,
                          question: variation.question,
                          answer: variation.answer,
                          steps: null,
                        },
                        stepProgress,
                        huginnSummary: huginnSummary || undefined,
                        isVariation: true,
                      });

                      const variationMessages = [
                        ...messages,
                        {
                          role: "assistant" as const,
                          content: cleanedResponse,
                        },
                        { role: "user" as const, content: "продолжай" },
                      ];

                      const variationStream = anthropic.messages.stream(
                        {
                          model: "claude-haiku-4-5-20251001",
                          max_tokens: 1024,
                          system: variationPrompt,
                          messages: variationMessages,
                        },
                        { timeout: 20000 },
                      );

                      const parser2 = new StreamParser();

                      for await (const event of variationStream) {
                        if (
                          event.type === "content_block_delta" &&
                          event.delta.type === "text_delta"
                        ) {
                          const cleaned = parser2.processChunk(
                            event.delta.text,
                          );
                          if (cleaned) {
                            controller.enqueue(
                              encoder.encode(
                                `data: ${JSON.stringify({ text: cleaned })}\n\n`,
                              ),
                            );
                          }
                        }
                      }

                      const remaining2 = parser2.flush();
                      if (remaining2) {
                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify({ text: remaining2 })}\n\n`,
                          ),
                        );
                      }

                      const variationText = parser2.getCleanedResponse();
                      if (variationText) {
                        await supabase.from("chat_messages").insert({
                          session_id: sessionId,
                          role: "assistant",
                          content: variationText,
                        });
                      }

                      // task_done во втором стриме крайне маловероятен (модель сама не отвечает за ученика),
                      // но если случилось — удалить маркер вариации и advance
                      if (parser2.hasTaskDone() && msgsOnStep >= 2) {
                        await supabase
                          .from("chat_messages")
                          .delete()
                          .eq("session_id", sessionId)
                          .eq("role", "system")
                          .ilike("content", "VARIATION:%");
                        stepResult = await advanceStep(
                          supabase,
                          sessionId,
                          topicId,
                          raven,
                          sessionState as SessionState | null,
                        );
                      }
                    } catch (streamErr) {
                      console.error(
                        "Variation second stream failed:",
                        streamErr,
                      );
                      // VARIATION-маркер сохранён, не advance — следующий запрос ученика получит вариацию
                    }
                  } catch (err) {
                    console.error("Variation generation failed:", err);
                    stepResult = await advanceStep(
                      supabase,
                      sessionId,
                      topicId,
                      raven,
                      sessionState as SessionState | null,
                    );
                  }
                } else {
                  // Нет данных задачи — fallback: advance
                  stepResult = await advanceStep(
                    supabase,
                    sessionId,
                    topicId,
                    raven,
                    sessionState as SessionState | null,
                  );
                }
              } else {
                // Хугин step_done → advance напрямую
                stepResult = await advanceStep(
                  supabase,
                  sessionId,
                  topicId,
                  raven,
                  sessionState as SessionState | null,
                );

                // Следующая цель — Хугин начинает её вторым стримом автоматически
                if (
                  raven === "huginn" &&
                  stepResult.advanced &&
                  !stepResult.finished &&
                  stepResult.nextStepId
                ) {
                  try {
                    const { data: nextGoalData } = await supabase
                      .from("learning_goals")
                      .select("id, text")
                      .eq("id", stepResult.nextStepId)
                      .single();

                    if (nextGoalData) {
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify({ newBubble: true })}\n\n`,
                        ),
                      );

                      const nextGoalPrompt = buildSystemPrompt({
                        raven: "huginn",
                        topic: topic as Topic | null,
                        calibration: calibration as Calibration | null,
                        goals: (goals ?? []) as Goal[],
                        currentGoal: nextGoalData as {
                          id: string;
                          text: string;
                        },
                        currentTask: null,
                        stepProgress: {
                          total: stepProgress.total,
                          completed: stepProgress.completed + 1,
                        },
                        huginnSummary: undefined,
                        isVariation: false,
                      });

                      const nextGoalMessages = [
                        ...messages,
                        {
                          role: "assistant" as const,
                          content: cleanedResponse,
                        },
                        { role: "user" as const, content: "продолжай" },
                      ];

                      const nextGoalStream = anthropic.messages.stream(
                        {
                          model: "claude-haiku-4-5-20251001",
                          max_tokens: 1024,
                          system: nextGoalPrompt,
                          messages: nextGoalMessages,
                        },
                        { timeout: 20000 },
                      );

                      const parser3 = new StreamParser();

                      for await (const event of nextGoalStream) {
                        if (
                          event.type === "content_block_delta" &&
                          event.delta.type === "text_delta"
                        ) {
                          const chunkText = parser3.processChunk(
                            event.delta.text,
                          );
                          if (chunkText) {
                            controller.enqueue(
                              encoder.encode(
                                `data: ${JSON.stringify({ text: chunkText })}\n\n`,
                              ),
                            );
                          }
                        }
                      }

                      const remaining3 = parser3.flush();
                      if (remaining3) {
                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify({ text: remaining3 })}\n\n`,
                          ),
                        );
                      }

                      const nextGoalText = parser3.getCleanedResponse();
                      if (nextGoalText) {
                        await supabase.from("chat_messages").insert({
                          session_id: sessionId,
                          role: "assistant",
                          content: nextGoalText,
                        });
                      }
                    }
                  } catch (streamErr) {
                    console.error(
                      "Huginn next goal stream failed:",
                      streamErr,
                    );
                  }
                }
              }
            }
            // Если msgsOnStep < 2 — игнорируем маркер: ученик не мог понять за 1 сообщение
          }

          // Fallback: если модель не поставила маркер за 8+ user-сообщений по одному шагу — форсировать продвижение
          if (
            !stepResult.advanced &&
            !hasStepDone &&
            !hasTaskDone &&
            sessionState?.current_step_id
          ) {
            const userMessagesInSession =
              (history ?? []).filter(
                (m: { role: string }) => m.role === "user",
              ).length + 1;
            const estimatedMessagesBeforeCurrentStep =
              (sessionState.step_index ?? 0) * 4;
            const messagesOnCurrentStep =
              userMessagesInSession - estimatedMessagesBeforeCurrentStep;

            if (messagesOnCurrentStep >= 8) {
              stepResult = await advanceStep(
                supabase,
                sessionId,
                topicId,
                raven,
                sessionState as SessionState | null,
              );
            }
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                stepAdvanced: stepResult.advanced,
                stepFinished: stepResult.finished,
              })}\n\n`,
            ),
          );
          controller.close();
        } catch (err) {
          console.error("Chat API stream error:", err);
          clearTimeout(timeout);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: "Ворон задумался... Попробуйте ещё раз.",
              })}\n\n`,
            ),
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return Response.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}


