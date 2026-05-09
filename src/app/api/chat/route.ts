import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

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

type Skill = { text: string; level: string };
type Goal = { id: string; text: string };
type Task = {
  question: string;
  answer: string;
  steps: string | null;
  difficulty: number;
};
type SessionState = {
  current_step_type: string | null;
  current_step_id: string | null;
  step_index: number | null;
  step_status: string | null;
};

type SupabaseLike = ReturnType<typeof getSupabase>;

async function initSessionSteps(
  supabase: SupabaseLike,
  sessionId: string,
  topicId: string,
  raven: string,
) {
  if (raven === "huginn") {
    const { data: goals } = await supabase
      .from("learning_goals")
      .select("id, text, sort_order")
      .eq("topic_id", topicId)
      .order("sort_order", { ascending: true });

    if (goals && goals.length > 0) {
      // Проверить есть ли предыдущая Хугин-сессия с прогрессом
      const { data: prevSessions } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("topic_id", topicId)
        .eq("raven", "huginn")
        .neq("id", sessionId)
        .not("ended_at", "is", null)
        .order("ended_at", { ascending: false })
        .limit(1);

      let completedGoalIds: string[] = [];
      if (prevSessions && prevSessions.length > 0) {
        const { data: prevProgress } = await supabase
          .from("goal_step_progress")
          .select("goal_id, status")
          .eq("session_id", prevSessions[0].id)
          .eq("status", "completed");
        if (prevProgress) {
          completedGoalIds = (
            prevProgress as Array<{ goal_id: string }>
          ).map((p) => p.goal_id);
        }
      }

      await supabase.from("goal_step_progress").insert(
        goals.map((g: { id: string }) => ({
          session_id: sessionId,
          goal_id: g.id,
          status: completedGoalIds.includes(g.id) ? "completed" : "pending",
        })),
      );

      const firstPendingIndex = (
        goals as Array<{ id: string }>
      ).findIndex((g) => !completedGoalIds.includes(g.id));

      if (firstPendingIndex >= 0) {
        const firstPendingGoal = goals[firstPendingIndex] as { id: string };
        await supabase
          .from("chat_sessions")
          .update({
            current_step_type: "goal",
            current_step_id: firstPendingGoal.id,
            step_index: firstPendingIndex,
            step_status: "teaching",
          })
          .eq("id", sessionId);
      } else {
        await supabase
          .from("chat_sessions")
          .update({ step_status: "completed" })
          .eq("id", sessionId);
      }
    } else {
      // Нет целей — Хугин сразу "завершён", переход к Мунину
      await supabase
        .from("chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId);
    }
  } else if (raven === "muninn") {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, question, sort_order")
      .eq("topic_id", topicId)
      .order("sort_order", { ascending: true });

    if (tasks && tasks.length > 0) {
      await supabase.from("task_progress").insert(
        tasks.map((t: { id: string }) => ({
          session_id: sessionId,
          task_id: t.id,
          status: "pending",
        })),
      );

      await supabase
        .from("chat_sessions")
        .update({
          current_step_type: "task",
          current_step_id: tasks[0].id,
          step_index: 0,
          step_status: "teaching",
        })
        .eq("id", sessionId);
    }

    if (!tasks || tasks.length === 0) {
      await supabase
        .from("chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId);
    }
  }
}

async function advanceStep(
  supabase: SupabaseLike,
  sessionId: string,
  topicId: string,
  raven: string,
  sessionState: SessionState | null,
): Promise<{
  advanced: boolean;
  finished: boolean;
  nextStepId: string | null;
}> {
  if (!sessionState?.current_step_id) {
    return { advanced: false, finished: false, nextStepId: null };
  }

  const currentIndex = sessionState.step_index ?? 0;

  if (raven === "huginn") {
    await supabase
      .from("goal_step_progress")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId)
      .eq("goal_id", sessionState.current_step_id);

    const { data: allGoals } = await supabase
      .from("learning_goals")
      .select("id")
      .eq("topic_id", topicId)
      .order("sort_order", { ascending: true });

    const nextIndex = currentIndex + 1;

    if (!allGoals || nextIndex >= allGoals.length) {
      const { data: finished } = await supabase
        .from("chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId)
        .eq("step_index", currentIndex)
        .select("id");
      if (!finished || finished.length === 0) {
        return { advanced: false, finished: false, nextStepId: null };
      }
      return { advanced: true, finished: true, nextStepId: null };
    }

    const nextGoal = allGoals[nextIndex] as { id: string };
    const { data: updated } = await supabase
      .from("chat_sessions")
      .update({
        current_step_id: nextGoal.id,
        step_index: nextIndex,
        step_status: "teaching",
      })
      .eq("id", sessionId)
      .eq("step_index", currentIndex)
      .select("id");

    if (!updated || updated.length === 0) {
      return { advanced: false, finished: false, nextStepId: null };
    }

    return { advanced: true, finished: false, nextStepId: nextGoal.id };
  } else if (raven === "muninn") {
    await supabase
      .from("task_progress")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId)
      .eq("task_id", sessionState.current_step_id);

    const { data: allTasks } = await supabase
      .from("tasks")
      .select("id")
      .eq("topic_id", topicId)
      .order("sort_order", { ascending: true });

    const nextIndex = currentIndex + 1;

    if (!allTasks || nextIndex >= allTasks.length) {
      const { data: finished } = await supabase
        .from("chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId)
        .eq("step_index", currentIndex)
        .select("id");
      if (!finished || finished.length === 0) {
        return { advanced: false, finished: false, nextStepId: null };
      }
      return { advanced: true, finished: true, nextStepId: null };
    }

    const nextTask = allTasks[nextIndex] as { id: string };
    const { data: updated } = await supabase
      .from("chat_sessions")
      .update({
        current_step_id: nextTask.id,
        step_index: nextIndex,
        step_status: "teaching",
      })
      .eq("id", sessionId)
      .eq("step_index", currentIndex)
      .select("id");

    if (!updated || updated.length === 0) {
      return { advanced: false, finished: false, nextStepId: null };
    }

    return { advanced: true, finished: false, nextStepId: nextTask.id };
  }

  return { advanced: false, finished: false, nextStepId: null };
}

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

    const { data: skills } = await supabase
      .from("skills")
      .select("text, level")
      .eq("topic_id", topicId);

    const { data: goals } = await supabase
      .from("learning_goals")
      .select("id, text, sort_order")
      .eq("topic_id", topicId)
      .order("sort_order", { ascending: true });

    const { data: tasks } = await supabase
      .from("tasks")
      .select("question, answer, steps, difficulty")
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

    const systemPrompt = buildSystemPrompt(
      raven,
      topic as Topic | null,
      calibration as Calibration | null,
      (skills ?? []) as Skill[],
      (goals ?? []) as Goal[],
      (tasks ?? []) as Task[],
      huginnSummary,
      currentStepData,
      currentTaskData,
      stepProgress,
      sessionState as SessionState | null,
    );

    await supabase
      .from("chat_messages")
      .insert({ session_id: sessionId, role: "user", content: message });

    const messages = [
      ...((history ?? []) as { role: string; content: string }[]).map((m) => ({
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
    let fullResponse = "";
    let streamBuffer = "";
    const MARKER_MAX_LEN = 12; // длина "<step_done/>" и "<task_done/>"

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const chunk = event.delta.text;
              fullResponse += chunk;
              streamBuffer += chunk;

              const safeEnd = streamBuffer.length - MARKER_MAX_LEN;
              if (safeEnd > 0) {
                const toSend = streamBuffer.slice(0, safeEnd);
                streamBuffer = streamBuffer.slice(safeEnd);
                const cleaned = toSend
                  .replace(/<step_done\/>/g, "")
                  .replace(/<task_done\/>/g, "");
                if (cleaned) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ text: cleaned })}\n\n`,
                    ),
                  );
                }
              }
            }
          }

          // Сбросить остаток буфера
          if (streamBuffer) {
            const cleaned = streamBuffer
              .replace(/<step_done\/>/g, "")
              .replace(/<task_done\/>/g, "");
            if (cleaned) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ text: cleaned })}\n\n`,
                ),
              );
            }
            streamBuffer = "";
          }

          clearTimeout(timeout);

          const cleanedResponse = fullResponse
            .replace(/<step_done\/>/g, "")
            .replace(/<task_done\/>/g, "")
            .trim();

          await supabase
            .from("chat_messages")
            .insert({
              session_id: sessionId,
              role: "assistant",
              content: cleanedResponse,
            });

          // Обработка маркеров state machine
          const hasStepDone = fullResponse.includes("<step_done/>");
          const hasTaskDone = fullResponse.includes("<task_done/>");

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

            if (msgsOnStep >= 2) {
              stepResult = await advanceStep(
                supabase,
                sessionId,
                topicId,
                raven,
                sessionState as SessionState | null,
              );
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

function buildSystemPrompt(
  raven: string,
  topic: Topic | null,
  calibration: Calibration | null,
  skills: Skill[],
  goals: Goal[],
  tasks: Task[],
  huginnSummary: string | null,
  currentStepData: { text: string; id: string } | null,
  currentTaskData: {
    question: string;
    answer: string;
    steps: string | null;
    id: string;
  } | null,
  stepProgress: { total: number; completed: number },
  sessionState: SessionState | null,
): string {
  void skills;
  void tasks;
  void sessionState;

  if (raven === "huginn") {
    const grade = topic?.classes?.grade ?? "";
    const subject = topic?.classes?.subject ?? "";
    const socraticLevel = calibration?.socratic_level ?? 50;

    const currentGoalBlock = currentStepData
      ? `\nТЕКУЩАЯ ЦЕЛЬ (объясни именно это):\n${currentStepData.text}\n\nПРОГРЕСС: ${stepProgress.completed} из ${stepProgress.total} целей пройдено.`
      : "";

    const goalsOverview =
      goals.length > 0
        ? `\nВСЕ ЦЕЛИ УРОКА (для контекста, НЕ перескакивай):\n${goals
            .map((g, i) => `${i + 1}. ${g.text}`)
            .join("\n")}`
        : "";

    return `Ты — Хугин, ворон мысли. AI-тьютор на платформе Corvian.

УЧЕНИК: ${grade} класс, предмет ${subject}.
ТЕМА: ${topic?.name ?? ""}
РАЗДЕЛ: ${topic?.section ?? ""}
${calibration?.theory_text ? `ТЕОРИЯ:\n${calibration.theory_text}` : ""}
${calibration?.huginn_instructions ? `ИНСТРУКЦИИ УЧИТЕЛЯ:\n${calibration.huginn_instructions}` : ""}
${currentGoalBlock}
${goalsOverview}

ПРАВИЛА:
1. Объясняй ТОЛЬКО текущую цель. Не перескакивай к следующим
2. Задавай ОДИН вопрос за раз. Жди ответа
3. Говори как живой учитель — короткие предложения, без канцелярита
4. Правильный ответ → похвали коротко и продолжи объяснение текущей цели
5. Неправильный ответ → НЕ говори "неправильно". Скажи "Давай подумаем" и задай вопрос попроще
6. НИКОГДА не говори "очевидно", "просто", "легко"
${calibration?.allow_analogies !== false ? "7. Используй примеры из жизни школьника" : "7. Аналогии ОТКЛЮЧЕНЫ — объясняй строго по теории"}
${calibration?.allow_humor === false ? "8. Юмор ОТКЛЮЧЁН учителем" : "8. Можешь пошутить, но НИКОГДА над учеником"}
9. Отвечай на русском. Формулы: $формула$
10. Отвечай кратко — 2-3 предложения максимум
11. НЕ задавай открытые философские вопросы — только конкретные с конкретным ответом
12. Строгость: ${socraticLevel}/100

КОГДА УЧЕНИК ПОНЯЛ ТЕКУЩУЮ ЦЕЛЬ:
Добавь в КОНЕЦ своего ответа на отдельной строке маркер:
<step_done/>

НЕ ставь маркер если ученик ещё не показал понимание. Лучше задай ещё один вопрос.`;
  }

  // Мунин
  const grade = topic?.classes?.grade ?? "";
  const maxHints = calibration?.max_hints_before_answer ?? 3;

  const currentTaskBlock = currentTaskData
    ? `\nТЕКУЩАЯ ЗАДАЧА:\nВопрос: ${currentTaskData.question}\nПравильный ответ (НИКОГДА не показывай ученику): ${currentTaskData.answer}${currentTaskData.steps ? `\nШаги решения (для подсказок): ${currentTaskData.steps}` : ""}\n\nПРОГРЕСС: ${stepProgress.completed} из ${stepProgress.total} задач решено.`
    : "";

  return `Ты — Мунин, ворон памяти. AI-тьютор на платформе Corvian.

УЧЕНИК: ${grade} класс.
ТЕМА: ${topic?.name ?? ""}
${huginnSummary ? `ЧТО УЧЕНИК ПОНЯЛ С ХУГИНОМ:\n${huginnSummary}` : ""}
${calibration?.muninn_instructions ? `ИНСТРУКЦИИ УЧИТЕЛЯ:\n${calibration.muninn_instructions}` : ""}
${currentTaskBlock}

ПРАВИЛА:
1. Работай ТОЛЬКО с текущей задачей. НЕ переходи к следующей сам
2. Сформулируй задачу своими словами — не копируй JSON
3. ПРОВЕРКА ОТВЕТА: сравнивай по значению, НЕ по форме (√3/2 = 0.866 = одно и то же)
4. Правильный ответ → похвали коротко
5. Неправильный ответ → спроси "Какой первый шаг?" или дай подсказку
6. После ${maxHints} подсказок — покажи первый шаг решения, но НЕ финальный ответ
7. Если ученик пишет "не понимаю" — объясни шаг подробнее
8. Отвечай на русском. Формулы: $формула$
9. Отвечай кратко — 2-3 предложения
10. Если НЕ уверен правильный ли ответ — считай правильным

КОГДА УЧЕНИК РЕШИЛ ЗАДАЧУ ПРАВИЛЬНО:
Добавь в КОНЕЦ ответа на отдельной строке маркер:
<task_done/>

НЕ ставь маркер если ответ неправильный или ученик ещё не ответил.`;
}

