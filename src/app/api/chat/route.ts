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
      await supabase.from("goal_step_progress").insert(
        goals.map((g: { id: string }) => ({
          session_id: sessionId,
          goal_id: g.id,
          status: "pending",
        })),
      );

      await supabase
        .from("chat_sessions")
        .update({
          current_step_type: "goal",
          current_step_id: goals[0].id,
          step_index: 0,
          step_status: "teaching",
        })
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
  }
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

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const text = event.delta.text;
              fullResponse += text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
              );
            }
          }

          clearTimeout(timeout);

          await supabase
            .from("chat_messages")
            .insert({
              session_id: sessionId,
              role: "assistant",
              content: fullResponse,
            });

          let goalsDone: string[] = [];
          if (raven === "huginn" && goals && goals.length > 0) {
            const allMessages = [
              ...messages,
              { role: "assistant", content: fullResponse },
            ];
            goalsDone = await checkGoalProgress(
              allMessages.map((m) => ({ role: m.role, content: m.content })),
              goals as Array<{ id: string; text: string }>,
            );
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ done: true, goalsDone })}\n\n`,
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

async function checkGoalProgress(
  messages: Array<{ role: string; content: string }>,
  goals: Array<{ id: string; text: string }>,
): Promise<string[]> {
  if (goals.length === 0) return [];

  const goalsList = goals.map((g) => `[${g.id}] ${g.text}`).join("\n");
  const lastMessages = messages.slice(-6);
  const dialog = lastMessages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Проанализируй диалог учителя и ученика.

ДИАЛОГ:
${dialog}

ЦЕЛИ ОБУЧЕНИЯ:
${goalsList}

Какие цели ученик ОСВОИЛ? Цель считается освоенной если:
- Ученик правильно ответил на вопрос по этой цели
- Ученик показал понимание концепции (даже если ответ неидеальный по форме)
- Учитель подтвердил правильность ("Верно", "Точно", "Молодец", "Именно", "Отлично")

НЕ требуй идеального ответа — достаточно показать понимание сути.

Ответь ТОЛЬКО JSON массивом id освоенных целей. Никакого текста до или после JSON.
Если ни одна цель не освоена — ответь: []
Пример ответа: ["abc-123"]`,
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];

    const ids = JSON.parse(jsonMatch[0]);
    return Array.isArray(ids)
      ? ids.filter((id: unknown) => typeof id === "string")
      : [];
  } catch (err) {
    console.error("checkGoalProgress error:", err);
    return [];
  }
}
