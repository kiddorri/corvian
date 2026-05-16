import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { buildSystemPrompt } from "@/lib/services/prompt-builder";
import { StreamParser } from "@/lib/services/stream-parser";
import {
  initLibrarySessionSteps,
  advanceLibraryStep,
  type LibrarySessionState,
} from "@/lib/services/library-lesson-engine";
import { generateTaskVariation } from "@/lib/services/task-generator";
import { isMathematicallyEqual } from "@/lib/services/math-validator";

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type LibraryTopicRow = {
  id: string;
  name: string;
  section: string;
  subject_id: string;
};

type LibrarySubjectRow = {
  name: string;
  grade: number;
};

export async function POST(req: NextRequest) {
  try {
    const { sessionId, message, raven, topicId, libraryStudentId, autoStart } = await req.json();
    if (!sessionId || !message || !raven || !topicId || !libraryStudentId) {
      return Response.json({ error: "Не хватает обязательных полей" }, { status: 400 });
    }
    const isAutoStart = autoStart === true;

    const supabase = getSupabase();

    const { data: calibration } = await supabase
      .from("library_calibrations")
      .select("*")
      .eq("topic_id", topicId)
      .single();

    const { data: topicRow } = await supabase
      .from("library_topics")
      .select("id, name, section, subject_id")
      .eq("id", topicId)
      .single();

    const topicTyped = topicRow as LibraryTopicRow | null;

    let subjectRow: LibrarySubjectRow | null = null;
    if (topicTyped) {
      const { data: sub } = await supabase
        .from("library_subjects")
        .select("name, grade")
        .eq("id", topicTyped.subject_id)
        .single();
      subjectRow = sub as LibrarySubjectRow | null;
    }

    // Топик в формате который ожидает buildSystemPrompt
    const topic = topicTyped
      ? {
          name: topicTyped.name,
          section: topicTyped.section,
          classes: subjectRow
            ? { grade: subjectRow.grade, subject: subjectRow.name }
            : null,
        }
      : null;

    const { data: goals } = await supabase
      .from("library_goals")
      .select("id, text, sort_order")
      .eq("topic_id", topicId)
      .order("sort_order", { ascending: true });

    const { data: history } = await supabase
      .from("library_chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (!history || history.length === 0) {
      await initLibrarySessionSteps(supabase, sessionId, topicId, raven);
    }

    const { data: sessionState } = await supabase
      .from("library_chat_sessions")
      .select("current_step_type, current_step_id, step_index, step_status")
      .eq("id", sessionId)
      .single();

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
                    ? "У этой темы нет отдельных целей. Переходим к практике!"
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

    let currentStepData: { text: string; id: string } | null = null;
    let currentHuginnStep: {
      explanation: string;
      check_question: string;
      correct_answer: string;
      hint: string | null;
    } | null = null;
    let currentTaskData: {
      question: string;
      answer: string;
      steps: string | null;
      id: string;
      template: string | null;
      params: Record<string, unknown> | null;
      answer_formula: string | null;
    } | null = null;
    const stepProgress = { total: 0, completed: 0 };

    if (
      sessionState?.current_step_type === "goal" &&
      sessionState.current_step_id
    ) {
      const { data: goalData } = await supabase
        .from("library_goals")
        .select("id, text")
        .eq("id", sessionState.current_step_id)
        .single();
      currentStepData = goalData as { id: string; text: string } | null;

      if (raven === "huginn") {
        const { data: stepData } = await supabase
          .from("library_huginn_steps")
          .select("explanation, check_question, correct_answer, hint")
          .eq("goal_id", sessionState.current_step_id)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (stepData) {
          currentHuginnStep = stepData as {
            explanation: string;
            check_question: string;
            correct_answer: string;
            hint: string | null;
          };
        }
      }

      const { data: allProgress } = await supabase
        .from("library_goal_progress")
        .select("status")
        .eq("session_id", sessionId);
      if (allProgress) {
        stepProgress.total = allProgress.length;
        stepProgress.completed = allProgress.filter(
          (p: { status: string }) => p.status === "completed",
        ).length;
      }
    } else if (
      sessionState?.current_step_type === "task" &&
      sessionState.current_step_id
    ) {
      const { data: taskData } = await supabase
        .from("library_tasks")
        .select("id, question, answer, steps, template, params, answer_formula")
        .eq("id", sessionState.current_step_id)
        .single();
      currentTaskData = taskData as {
        id: string;
        question: string;
        answer: string;
        steps: string | null;
        template: string | null;
        params: Record<string, unknown> | null;
        answer_formula: string | null;
      } | null;

      const { data: allProgress } = await supabase
        .from("library_task_progress")
        .select("status")
        .eq("session_id", sessionId);
      if (allProgress) {
        stepProgress.total = allProgress.length;
        stepProgress.completed = allProgress.filter(
          (p: { status: string }) => p.status === "completed",
        ).length;
      }
    }

    let huginnSummary = "";
    if (raven === "muninn") {
      const { data: huginnSession } = await supabase
        .from("library_chat_sessions")
        .select("summary")
        .eq("library_student_id", libraryStudentId)
        .eq("library_topic_id", topicId)
        .eq("raven", "huginn")
        .not("summary", "is", null)
        .order("ended_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      huginnSummary = (huginnSession?.summary as string) || "";
    }

    let activeVariation: { question: string; answer: string } | null = null;
    if (sessionState?.current_step_type === "task") {
      const { data: variationMsg } = await supabase
        .from("library_chat_messages")
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
            activeVariation = { question: parsed.question, answer: parsed.answer };
          }
        } catch {}
      }
    }

    const promptCurrentTask =
      activeVariation && currentTaskData
        ? {
            id: currentTaskData.id,
            question: activeVariation.question,
            answer: activeVariation.answer,
            steps: null,
          }
        : currentTaskData;

    const muninnValidated =
      raven === "muninn" &&
      promptCurrentTask !== null &&
      typeof message === "string" &&
      isMathematicallyEqual(message, promptCurrentTask.answer);
    const huginnValidated =
      raven === "huginn" &&
      !!currentHuginnStep?.correct_answer &&
      typeof message === "string" &&
      isMathematicallyEqual(message, currentHuginnStep.correct_answer);
    const serverValidatedCorrect = muninnValidated || huginnValidated;

    const systemPrompt = buildSystemPrompt({
      raven,
      topic,
      calibration: calibration as Parameters<typeof buildSystemPrompt>[0]["calibration"],
      goals: (goals ?? []) as { id: string; text: string }[],
      currentGoal: currentStepData,
      currentStep: currentHuginnStep,
      currentTask: promptCurrentTask,
      stepProgress,
      huginnSummary: huginnSummary || undefined,
      isVariation: false,
      serverValidatedCorrect,
    });

    if (!isAutoStart) {
      await supabase
        .from("library_chat_messages")
        .insert({ session_id: sessionId, role: "user", content: message });
    }

    let claudeHistory = ((history ?? []) as { role: string; content: string }[])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // Если в БД первое user-сообщение не сохранено (автостарт случался ранее),
    // история начинается с assistant — Claude API такого не допускает.
    // Подкладываем виртуальное "Начни урок." только для API-вызова.
    if (claudeHistory.length > 0 && claudeHistory[0].role === "assistant") {
      claudeHistory = [
        { role: "user" as const, content: "Начни урок." },
        ...claudeHistory,
      ];
    }

    const messages = [
      ...claudeHistory,
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
                  encoder.encode(`data: ${JSON.stringify({ text: cleaned })}\n\n`),
                );
              }
            }
          }
          const remaining = parser.flush();
          if (remaining) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: remaining })}\n\n`),
            );
          }
          clearTimeout(timeout);

          const cleanedResponse = parser.getCleanedResponse();
          await supabase
            .from("library_chat_messages")
            .insert({ session_id: sessionId, role: "assistant", content: cleanedResponse });

          let hasStepDone = false;
          let hasTaskDone = false;
          let stepResult: {
            advanced: boolean;
            finished: boolean;
            nextStepId: string | null;
          } = { advanced: false, finished: false, nextStepId: null };

          try {
            console.log("[LIB-RAW-TAIL]", JSON.stringify(parser.getRawTail(80)));
            hasStepDone = parser.hasStepDone();
            hasTaskDone = parser.hasTaskDone();
            console.log("[LIB-MARKER] hasStepDone:", hasStepDone, "hasTaskDone:", hasTaskDone);

            // Rescue: math-валидатор подтвердил правильность ответа,
            // но модель забыла поставить маркер. Форсируем нужный маркер,
            // чтобы ученик не застрял.
            if (serverValidatedCorrect && !hasStepDone && !hasTaskDone) {
              if (raven === "huginn") {
                hasStepDone = true;
                console.log("[LIB-MARKER-RESCUE] forcing step_done — answer validated but marker missing");
              } else if (raven === "muninn") {
                hasTaskDone = true;
                console.log("[LIB-MARKER-RESCUE] forcing task_done — answer validated but marker missing");
              }
            }

            if (hasStepDone || hasTaskDone) {
              const isFirstRequest = !history || history.length === 0;

              const advanceTable =
                raven === "muninn" ? "library_task_progress" : "library_goal_progress";
              const { data: lastCompletedRow } = await supabase
                .from(advanceTable)
                .select("completed_at")
                .eq("session_id", sessionId)
                .not("completed_at", "is", null)
                .order("completed_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              const sinceAt =
                (lastCompletedRow as { completed_at: string } | null)?.completed_at ??
                null;
              let userMsgsSinceAdvance = 0;
              {
                const q = supabase
                  .from("library_chat_messages")
                  .select("id", { count: "exact", head: true })
                  .eq("session_id", sessionId)
                  .eq("role", "user");
                const { count } = await (sinceAt ? q.gt("created_at", sinceAt) : q);
                userMsgsSinceAdvance = count ?? 0;
              }

              const isTaskContext =
                sessionState?.current_step_type === "task" || raven === "muninn";

              if (!isFirstRequest) {
                if (hasTaskDone && isTaskContext && userMsgsSinceAdvance < 1) {
                  // подавляем: task_done пришёл без единого ответа ученика
                } else if (hasTaskDone && isTaskContext) {
                  if (activeVariation) {
                    await supabase
                      .from("library_chat_messages")
                      .delete()
                      .eq("session_id", sessionId)
                      .eq("role", "system")
                      .ilike("content", "VARIATION:%");
                    stepResult = await advanceLibraryStep(
                      supabase,
                      sessionId,
                      topicId,
                      raven,
                      sessionState as LibrarySessionState | null,
                    );
                  } else if (currentTaskData && topic) {
                    // Защита: если модель в основном ответе уже сама дала новую задачу
                    // (есть вопросительный знак + длинное содержание после короткого подтверждения),
                    // вариация не нужна — просто advance и пусть ученик отвечает на эту задачу.
                    const hasQuestionMark = cleanedResponse.includes("?");
                    const responseTooLong = cleanedResponse.length > 80;
                    const modelAlreadyGaveNewTask = hasQuestionMark && responseTooLong;

                    if (modelAlreadyGaveNewTask) {
                      console.log(
                        "[VARIATION-SKIP] model already gave new question in main response, advancing without variation. response length:",
                        cleanedResponse.length,
                      );
                      stepResult = await advanceLibraryStep(
                        supabase,
                        sessionId,
                        topicId,
                        raven,
                        sessionState as LibrarySessionState | null,
                      );
                    } else {
                      try {
                      const variation = await generateTaskVariation(
                        currentTaskData.question,
                        currentTaskData.answer,
                        topic.name,
                      );
                      await supabase.from("library_chat_messages").insert({
                        session_id: sessionId,
                        role: "system",
                        content: "VARIATION:" + JSON.stringify(variation),
                      });

                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify({ newBubble: true })}\n\n`,
                        ),
                      );

                      const variationPrompt = buildSystemPrompt({
                        raven: "muninn",
                        topic,
                        calibration: calibration as Parameters<typeof buildSystemPrompt>[0]["calibration"],
                        goals: (goals ?? []) as { id: string; text: string }[],
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
                        { role: "assistant" as const, content: cleanedResponse },
                        { role: "user" as const, content: "Дай похожую задачу для закрепления." },
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
                          const cleaned = parser2.processChunk(event.delta.text);
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
                        await supabase.from("library_chat_messages").insert({
                          session_id: sessionId,
                          role: "assistant",
                          content: variationText,
                        });
                      }
                      if (parser2.hasTaskDone()) {
                        await supabase
                          .from("library_chat_messages")
                          .delete()
                          .eq("session_id", sessionId)
                          .eq("role", "system")
                          .ilike("content", "VARIATION:%");
                        stepResult = await advanceLibraryStep(
                          supabase,
                          sessionId,
                          topicId,
                          raven,
                          sessionState as LibrarySessionState | null,
                        );
                      }
                    } catch (streamErr) {
                      console.error("Library variation stream failed:", streamErr);
                    }
                    }
                  } else {
                    stepResult = await advanceLibraryStep(
                      supabase,
                      sessionId,
                      topicId,
                      raven,
                      sessionState as LibrarySessionState | null,
                    );
                  }
                } else {
                  // huginn step_done
                  stepResult = await advanceLibraryStep(
                    supabase,
                    sessionId,
                    topicId,
                    raven,
                    sessionState as LibrarySessionState | null,
                  );
                }
              }
            }
          } catch (err) {
            console.error("Library marker processing failed:", err);
          }

          // Fallback: 8+ user сообщений
          if (
            !stepResult.advanced &&
            !hasStepDone &&
            !hasTaskDone &&
            sessionState?.current_step_id
          ) {
            const userMessagesInSession =
              ((history ?? []) as { role: string }[]).filter(
                (m) => m.role === "user",
              ).length + 1;
            const estimated = (sessionState.step_index ?? 0) * 4;
            const onStep = userMessagesInSession - estimated;
            if (onStep >= 8) {
              stepResult = await advanceLibraryStep(
                supabase,
                sessionId,
                topicId,
                raven,
                sessionState as LibrarySessionState | null,
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
          console.error("Library chat stream error:", err);
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
    console.error("Library chat error:", err);
    return Response.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
