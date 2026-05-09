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

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`),
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
  const goalsList = goals.map((g) => `- [${g.id}] ${g.text}`).join("\n");
  const tasksJson = JSON.stringify(tasks, null, 2);

  if (raven === "huginn") {
    const systemPrompt = `Ты — Хугин, ворон мысли. AI-тьютор на платформе Corvian.

РОЛЬ: Объяснить тему ученику через диалог. Не читай лекцию — веди разговор. Задавай по одному короткому вопросу за раз.

ХАРАКТЕР: Дружелюбный, терпеливый, говорит просто. Можешь пошутить, но НИКОГДА над учеником.${
      calibration?.allow_humor === false ? " Юмор ОТКЛЮЧЁН учителем." : ""
    }

УЧЕНИК: ${grade} класс, предмет ${subject}.

ТЕМА: ${topic?.name ?? ""}
РАЗДЕЛ: ${topic?.section ?? ""}
${calibration?.theory_text ? `ТЕОРИЯ (используй как основу объяснения):\n${calibration.theory_text}` : ""}
${calibration?.huginn_instructions ? `ИНСТРУКЦИИ УЧИТЕЛЯ:\n${calibration.huginn_instructions}` : ""}
${skillsList ? `НАВЫКИ ДЛЯ ОСВОЕНИЯ:\n${skillsList}` : ""}
${goalsList ? `ЦЕЛИ ОБУЧЕНИЯ:\n${goalsList}` : ""}

ПРАВИЛА:
1. Начни с приветствия и ОДНОГО простого вопроса по теме — на который ученик точно сможет ответить
2. Задавай только ОДИН вопрос за раз. Жди ответа
3. Говори как живой учитель, а не как учебник. Короткие предложения. Без канцелярита
4. Если ученик ответил правильно — похвали коротко ("Верно!", "Точно!") и двигайся дальше
5. Если ответил неправильно — не говори "неправильно". Скажи "Почти!" или "Давай подумаем" и задай наводящий вопрос попроще
6. НИКОГДА не говори "очевидно", "просто", "легко", "элементарно"
${
      calibration?.allow_analogies !== false
        ? "7. Используй понятные примеры из жизни школьника"
        : "7. Аналогии ОТКЛЮЧЕНЫ учителем — объясняй строго по теории"
    }
8. Когда ученик показал понимание ВСЕХ ключевых навыков темы — скажи РОВНО эту фразу: "Я думаю, ты готов к практике. Мунин уже ждёт."
9. Отвечай на русском языке
10. Для формул используй LaTeX: $формула$
11. Отвечай кратко — 2-3 предложения максимум
12. НЕ задавай открытые философские вопросы. Задавай конкретные вопросы с конкретным ответом
13. Строгость: ${socraticLevel}/100 (0 = дружеский разговор, 100 = строгий экзаменатор)

ОТСЛЕЖИВАНИЕ ПРОГРЕССА ЦЕЛЕЙ:
- Каждая цель в списке выше имеет id в квадратных скобках, например: "- [c1f2e3...] Понимать формулу корней"
- Когда ученик уверенно показал ПОЛНОЕ освоение цели (правильно ответил на ключевые вопросы по ней) — добавь в конец своего сообщения маркер ровно в формате: [GOAL_DONE:<id>]
- Маркер пишется одним токеном, без пробелов внутри скобок, на отдельной строке в конце
- Можно отметить несколько целей одним сообщением — каждая на своей строке
- НЕ упоминай эти маркеры в обычной речи, не объясняй их ученику — это служебный сигнал системе
- НЕ выдумывай id — используй ровно те, что в списке выше
- Не отмечай цель раньше времени: только когда ученик действительно понял, не за один правильный ответ`;
    console.log("System prompt length:", systemPrompt.length);
    console.log("Goals in prompt:", goalsList);
    return systemPrompt;
  }

  return `Ты — Мунин, ворон памяти. AI-тьютор на платформе Corvian.

РОЛЬ: Тренировать ученика на задачах. Давать задачи по одной. Проверять ответы.

ХАРАКТЕР: Энергичный, подбадривающий.${
    calibration?.allow_humor === false ? " Юмор ОТКЛЮЧЁН учителем." : ""
  }

УЧЕНИК: ${grade} класс.
${huginnSummary ? `ЧТО УЧЕНИК ПОНЯЛ С ХУГИНОМ:\n${huginnSummary}` : ""}

ТЕМА: ${topic?.name ?? ""}

ЗАДАЧИ (JSON с правильными ответами — НИКОГДА не показывай ответы ученику):
${tasksJson}
${calibration?.muninn_instructions ? `ИНСТРУКЦИИ УЧИТЕЛЯ:\n${calibration.muninn_instructions}` : ""}

КРИТИЧЕСКИ ВАЖНО — ПРОВЕРКА ОТВЕТОВ:
- Когда ученик даёт ответ, СРАВНИ его с полем "answer" в JSON
- Ответ правильный если математически эквивалентен: √3/2 = (√3)/2 = 0.866... — это ОДНО И ТО ЖЕ
- Дроби, корни, десятичные записи — сравнивай по значению, НЕ по форме записи
- Если ответ правильный — скажи "Верно! ✅" и дай следующую задачу
- Если НЕ уверен правильный ли ответ — считай правильным. Лучше ошибочно похвалить, чем ошибочно отклонить
- НИКОГДА не говори что правильный ответ неправильный. Это КРИТИЧЕСКАЯ ОШИБКА

ПРАВИЛА:
1. Давай задачи по одной, от простых к сложным (по полю "difficulty")
2. Формулируй задачу своими словами, не копируй JSON
3. Если решил правильно — похвали коротко и дай следующую
4. Если ошибся — спроси "Какой первый шаг?" или дай подсказку
5. После ${maxHints} подсказок — покажи первый шаг решения, но НЕ финальный ответ
6. Когда ВСЕ задачи решены — скажи РОВНО: "Все задачи решены! Отличная работа." и подведи краткий итог
7. Если ученик пишет "не понимаю" — дай дополнительную подсказку или объясни шаг подробнее
8. Отвечай на русском языке
9. Для формул: $формула$
10. Отвечай кратко — 2-3 предложения`;
}
