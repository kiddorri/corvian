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
import { isMathematicallyEqual } from "@/lib/services/math-validator";

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

    // Серверная проверка эквивалентности ответа (75% == 3/4 == 0.75 == 6/8).
    // Только для Мунина — если есть текущая задача и сообщение ученика похоже
    // на числовой ответ. Передаётся в системный промпт как "проверено сервером",
    // чтобы Haiku не отклонил эквивалентную форму.
    const serverValidatedCorrect =
      raven === "muninn" &&
      promptCurrentTask !== null &&
      typeof message === "string" &&
      isMathematicallyEqual(message, promptCurrentTask.answer);
    console.log(
      "[MATH-CHECK] serverValidatedCorrect:",
      serverValidatedCorrect,
      "student:",
      typeof message === "string" ? message.slice(0, 40) : "<non-string>",
      "expected:",
      promptCurrentTask?.answer,
    );

    const systemPrompt = buildSystemPrompt({
      raven,
      topic: topic as Topic | null,
      calibration: calibration as Calibration | null,
      goals: (goals ?? []) as Goal[],
      currentGoal: currentStepData,
      currentTask: promptCurrentTask,
      stepProgress,
      huginnSummary: huginnSummary || undefined,
      // Main stream is for checking the student's answer (the variation was
      // already presented via the second stream on the prior turn). Never
      // re-tell the model to "give the variation" here.
      isVariation: false,
      serverValidatedCorrect,
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

          console.log("[DEBUG] message saved, checking markers");

          // Обработка маркеров state machine
          let hasStepDone = false;
          let hasTaskDone = false;
          let stepResult: {
            advanced: boolean;
            finished: boolean;
            nextStepId: string | null;
          } = { advanced: false, finished: false, nextStepId: null };

          // Узкий try/catch именно вокруг parser-вызовов, чтобы [PARSER-CRASH]
          // мог появиться независимо от внешнего [CRITICAL] (диагностика того,
          // почему [MARKER] лог не доходит до Vercel).
          console.log("[MARKER-CHECK] about to check markers");
          try {
            hasStepDone = parser.hasStepDone();
            console.log("[MARKER-CHECK] hasStepDone returned:", hasStepDone);
            hasTaskDone = parser.hasTaskDone();
            console.log("[MARKER-CHECK] hasTaskDone returned:", hasTaskDone);
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
          } catch (parseErr) {
            console.error("[PARSER-CRASH]", parseErr);
          }

          try {
            hasStepDone = parser.hasStepDone();
            hasTaskDone = parser.hasTaskDone();
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

          if (hasStepDone || hasTaskDone) {
            console.log("[DEBUG] entering marker block");
            console.log("[GATE] marker detected, computing msgsOnStep");
            const userMsgCount =
              (history ?? []).filter(
                (m: { role: string }) => m.role === "user",
              ).length + 1;
            const estimatedBefore =
              (sessionState?.step_index ?? 0) * 3;
            const msgsOnStep = userMsgCount - estimatedBefore;
            const isFirstRequest = !history || history.length === 0;
            console.log(
              "[MARKER] msgsOnStep:",
              msgsOnStep,
              "userMsgCount:",
              userMsgCount,
              "estimatedBefore:",
              estimatedBefore,
              "step_index:",
              sessionState?.step_index,
              "isFirstRequest:",
              isFirstRequest,
            );

            // Защита от ложного task_done на сообщении, где Мунин ВЫДАЁТ задачу:
            // считаем сколько user-сообщений было после последнего advance этого raven.
            // Если ученик ещё не отвечал (или только написал «дальше») — task_done должен
            // быть проигнорирован, иначе сгенерируется вариация и второй стрим дублирует
            // только что выданный вопрос.
            const advanceTable =
              raven === "muninn" ? "task_progress" : "goal_step_progress";
            const { data: lastCompletedRow } = await supabase
              .from(advanceTable)
              .select("completed_at")
              .eq("session_id", sessionId)
              .not("completed_at", "is", null)
              .order("completed_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const sinceAt =
              (lastCompletedRow as { completed_at: string } | null)
                ?.completed_at ?? null;
            let userMsgsSinceAdvance = 0;
            {
              const q = supabase
                .from("chat_messages")
                .select("id", { count: "exact", head: true })
                .eq("session_id", sessionId)
                .eq("role", "user");
              const { count } = await (sinceAt
                ? q.gt("created_at", sinceAt)
                : q);
              userMsgsSinceAdvance = count ?? 0;
            }
            console.log(
              "[GATE] userMsgsSinceAdvance:",
              userMsgsSinceAdvance,
              "sinceAt:",
              sinceAt,
            );

            const isTaskContext =
              sessionState?.current_step_type === "task" ||
              raven === "muninn";
            // Гейт: пропускаем маркер только на самом первом сообщении сессии
            // (часто это приветствие — модель не должна сразу advance'иться).
            // Дальше доверяем модели: маркер означает advance.
            if (!isFirstRequest) {
              console.log(
                "[GATE] passed first-message gate. hasTaskDone:",
                hasTaskDone,
                "hasStepDone:",
                hasStepDone,
                "msgsOnStep:",
                msgsOnStep,
                "isTaskContext:",
                isTaskContext,
              );
              if (hasTaskDone && isTaskContext && userMsgsSinceAdvance < 2) {
                // Мунин поставил <task_done/>, но ученик ещё не отвечал на текущую
                // задачу (после последнего advance). Скорее всего модель ошиблась и
                // прилепила маркер к сообщению где сама же выдала задачу. Игнорируем
                // — иначе сгенерируется вариация и второй стрим продублирует вопрос.
                console.log(
                  "[GATE] task_done suppressed — only",
                  userMsgsSinceAdvance,
                  "user msg(s) since last advance (need ≥ 2)",
                );
              } else if (hasTaskDone && isTaskContext) {
                console.log(
                  "[MARKER] activeVariation:",
                  !!activeVariation,
                  "currentTaskData:",
                  !!currentTaskData,
                  "topic:",
                  !!topic,
                );
                console.log(
                  "[VARIATION] checking activeVariation:",
                  !!activeVariation,
                );
                if (activeVariation) {
                  console.log(
                    "[VARIATION] deleting variation marker and advancing",
                  );
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
                  console.log(
                    "[ADVANCE] result:",
                    JSON.stringify(stepResult),
                  );
                } else if (currentTaskData && topic) {
                  // Оригинальная задача решена — генерируем вариацию через Sonnet
                  try {
                    console.log(
                      "[VARIATION] generating new variation for task:",
                      currentTaskData?.question,
                    );
                    const variation = await generateTaskVariation(
                      currentTaskData.question,
                      currentTaskData.answer,
                      (topic as Topic).name,
                    );
                    console.log(
                      "[VARIATION] generated:",
                      JSON.stringify(variation),
                    );
                    await supabase.from("chat_messages").insert({
                      session_id: sessionId,
                      role: "system",
                      content: "VARIATION:" + JSON.stringify(variation),
                    });
                    console.log(
                      "[VARIATION] saved, starting second stream",
                    );

                    // --- Второй стрим CASE 1: Мунин выдаёт сгенерированную вариацию ---
                    // Запускается ТОЛЬКО здесь — после успешной генерации вариации
                    // через Sonnet, до advance (ученик решает вариацию следующим
                    // сообщением). После activeVariation-блока (delete + advance)
                    // никакого второго стрима для Мунина не запускается — следующая
                    // задача выдаётся обычным main-стримом на следующем сообщении.
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
                      if (parser2.hasTaskDone()) {
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
                        console.log(
                          "[ADVANCE] result:",
                          JSON.stringify(stepResult),
                        );
                      }
                    } catch (streamErr) {
                      console.log(
                        "[VARIATION] second stream FAILED:",
                        streamErr,
                      );
                      console.error(
                        "Variation second stream failed:",
                        streamErr,
                      );
                      // VARIATION-маркер сохранён, не advance — следующий запрос ученика получит вариацию
                    }
                  } catch (err) {
                    console.log("[VARIATION] generation FAILED:", err);
                    console.error("Variation generation failed:", err);
                    stepResult = await advanceStep(
                      supabase,
                      sessionId,
                      topicId,
                      raven,
                      sessionState as SessionState | null,
                    );
                    console.log(
                      "[ADVANCE] result:",
                      JSON.stringify(stepResult),
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
                  console.log(
                    "[ADVANCE] result:",
                    JSON.stringify(stepResult),
                  );
                }
              } else {
                console.log(
                  "[GATE] not task_done or not task type, checking step_done",
                );
                // Хугин step_done → advance напрямую. Второй стрим автопере-
                // хода к следующей цели УБРАН: он выдавал next-goal слишком
                // быстро (ученик не успевал прочитать первый bubble) и иногда
                // второй стрим повторял тот же вопрос вместо нового. Теперь
                // ученик отправляет следующее сообщение и Хугин начинает
                // новую цель в main-стриме — как у Мунина.
                stepResult = await advanceStep(
                  supabase,
                  sessionId,
                  topicId,
                  raven,
                  sessionState as SessionState | null,
                );
                console.log("[ADVANCE] result:", JSON.stringify(stepResult));
              }
            }
            // Первое сообщение сессии — игнорируем маркер (приветствие, не настоящий ответ)
          }
          } catch (err) {
            console.error("[CRITICAL] marker processing crashed:", err);
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
              console.log("[ADVANCE] result:", JSON.stringify(stepResult));
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


