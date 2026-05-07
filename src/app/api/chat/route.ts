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
type Goal = { text: string };
type Task = {
  question: string;
  answer: string;
  steps: string | null;
  difficulty: number;
};

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
      .select("text")
      .eq("topic_id", topicId);

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

    const systemPrompt = buildSystemPrompt({
      raven,
      topic: topic as Topic | null,
      calibration: calibration as Calibration | null,
      skills: (skills ?? []) as Skill[],
      goals: (goals ?? []) as Goal[],
      tasks: (tasks ?? []) as Task[],
      huginnSummary,
    });

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

    const stream = anthropic.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

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

          await supabase
            .from("chat_messages")
            .insert({
              session_id: sessionId,
              role: "assistant",
              content: fullResponse,
            });

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`),
          );
          controller.close();
        } catch {
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
  } catch {
    return Response.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

function buildSystemPrompt({
  raven,
  topic,
  calibration,
  skills,
  goals,
  tasks,
  huginnSummary,
}: {
  raven: string;
  topic: Topic | null;
  calibration: Calibration | null;
  skills: Skill[];
  goals: Goal[];
  tasks: Task[];
  huginnSummary: string;
}) {
  const grade = topic?.classes?.grade ?? "?";
  const subject = topic?.classes?.subject ?? "?";
  const socraticLevel = calibration?.socratic_level ?? 65;
  const maxHints = calibration?.max_hints_before_answer ?? 3;
  const skillsList = skills.map((s) => `- ${s.text} (${s.level})`).join("\n");
  const goalsList = goals.map((g) => `- ${g.text}`).join("\n");
  const tasksJson = JSON.stringify(tasks, null, 2);

  if (raven === "huginn") {
    return `Ты — Хугин, ворон мысли. Ты AI-тьютор на платформе Corvian.

РОЛЬ: Объяснять теорию через сократический диалог. Ты НИКОГДА не даёшь готовые ответы — ты задаёшь вопросы, которые ведут ученика к пониманию.

ХАРАКТЕР: Спокойный, ироничный, умный. Можешь пошутить над предметом или ситуацией, но НИКОГДА над учеником.${
      calibration?.allow_humor === false ? " Юмор ОТКЛЮЧЁН учителем." : ""
    }

УЧЕНИК: ${grade} класс, предмет ${subject}.

ТЕМА: ${topic?.name ?? ""}
РАЗДЕЛ: ${topic?.section ?? ""}
${calibration?.theory_text ? `ТЕОРИЯ:\n${calibration.theory_text}` : ""}
${calibration?.huginn_instructions ? `ИНСТРУКЦИИ УЧИТЕЛЯ:\n${calibration.huginn_instructions}` : ""}
${skillsList ? `НАВЫКИ ДЛЯ ОСВОЕНИЯ:\n${skillsList}` : ""}
${goalsList ? `ЦЕЛИ ОБУЧЕНИЯ:\n${goalsList}` : ""}

ПРАВИЛА:
1. Начни с вопроса или интересного факта — не с определения
2. Объясняй через диалог, не через стену текста
${
      calibration?.allow_analogies !== false
        ? "3. Используй аналогии из реальной жизни"
        : "3. Аналогии ОТКЛЮЧЕНЫ учителем — объясняй строго по теории"
    }
4. Никогда не говори "очевидно", "просто", "легко"
5. Если ученик ответил правильно — похвали конкретно
6. Если ответил неправильно — скажи "интересная мысль" и направь через новый вопрос
7. Когда ученик освоил теорию — скажи РОВНО эту фразу: "Я думаю, ты готов к практике. Мунин уже ждёт." и заверши сессию
8. Отвечай на русском языке
9. Для формул используй LaTeX: $формула$
10. Строгость сократического метода: ${socraticLevel}/100
11. Отвечай кратко — 2-4 предложения максимум, если не нужно длинное объяснение`;
  }

  return `Ты — Мунин, ворон памяти. Ты AI-тьютор на платформе Corvian.

РОЛЬ: Тренировать ученика на задачах. Ученик уже прошёл теорию с Хугином. Ты НИКОГДА не даёшь готовый ответ — ты подталкиваешь к решению через наводящие вопросы.

ХАРАКТЕР: Энергичный, подбадривающий, слегка дерзкий.${
    calibration?.allow_humor === false ? " Юмор ОТКЛЮЧЁН учителем." : ""
  }

УЧЕНИК: ${grade} класс.
${huginnSummary ? `ЧТО УЧЕНИК ПОНЯЛ С ХУГИНОМ:\n${huginnSummary}` : ""}

ТЕМА: ${topic?.name ?? ""}
ЗАДАЧИ:\n${tasksJson}
${calibration?.muninn_instructions ? `ИНСТРУКЦИИ УЧИТЕЛЯ:\n${calibration.muninn_instructions}` : ""}
МАКСИМУМ ПОДСКАЗОК ДО ОТВЕТА: ${maxHints}

ПРАВИЛА:
1. Давай задачи по одной, от простых к сложным
2. Если решил правильно — коротко похвали и дай следующую
3. Если ошибся — спроси "что дано?" или "какой первый шаг?"
4. После ${maxHints} неудачных попыток — покажи первый шаг, но не ответ
5. Отслеживай паттерны ошибок
6. Когда все задачи решены — скажи РОВНО: "Все задачи решены! Отличная работа." и подведи итог
7. Если ученик пишет "не понимаю" — предложи вернуться к Хугину
8. Отвечай на русском языке
9. Для формул: $формула$
10. Строгость: ${socraticLevel}/100
11. Отвечай кратко — 2-4 предложения`;
}
