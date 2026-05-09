import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { parseFile } from "@/lib/parse-file";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const formData = await req.formData();
    const topicId = formData.get("topicId") as string;
    const topicName = formData.get("topicName") as string;
    const topicSection = formData.get("topicSection") as string;
    const grade = formData.get("grade") as string;
    const subject = formData.get("subject") as string;

    const files = formData.getAll("files") as File[];
    if (!files.length || !topicId) {
      return NextResponse.json(
        { error: "Нужен хотя бы один файл" },
        { status: 400 },
      );
    }

    const parsedFiles = await Promise.all(files.map(parseFile));

    // Бэкап файлов в Storage
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const pf = parsedFiles[i];
      const fileName = `${topicId}/${Date.now()}-${i}-${file.name}`;
      const bytes = await file.arrayBuffer();
      await supabase.storage
        .from("calibration-files")
        .upload(fileName, Buffer.from(bytes), {
          contentType: pf.mediaType ?? file.type ?? "application/octet-stream",
        });

      const { data: existingCal } = await supabase
        .from("calibrations")
        .select("theory_files")
        .eq("topic_id", topicId)
        .single();
      const currentFiles = (existingCal?.theory_files as string[]) || [];
      await supabase
        .from("calibrations")
        .update({ theory_files: [...currentFiles, fileName] })
        .eq("topic_id", topicId);
    }

    const contentBlocks: Anthropic.ContentBlockParam[] = [];

    for (const pf of parsedFiles) {
      if (pf.base64 && pf.mediaType) {
        if (pf.mediaType === "application/pdf") {
          contentBlocks.push({
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pf.base64,
            },
          });
        } else {
          contentBlocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: pf.mediaType as
                | "image/png"
                | "image/jpeg"
                | "image/gif"
                | "image/webp",
              data: pf.base64,
            },
          });
        }
        contentBlocks.push({ type: "text", text: `[Файл: ${pf.name}]` });
      } else if (pf.text) {
        contentBlocks.push({
          type: "text",
          text: `[Файл: ${pf.name}]\n\n${pf.text}`,
        });
      }
    }

    contentBlocks.push({
      type: "text",
      text: `Ты — методист. На основе загруженных материалов создай структурированный план урока.

ТЕМА: ${topicName}
РАЗДЕЛ: ${topicSection}
КЛАСС: ${grade}
ПРЕДМЕТ: ${subject}

Верни ТОЛЬКО валидный JSON (без markdown-обёртки, без \`\`\`json), строго в таком формате:

{
  "theory": "Теоретический материал по теме. Используй Markdown для форматирования и LaTeX ($формула$) для математических формул. Пиши понятно для ученика ${grade} класса.",
  "learning_goals": [
    "Ученик понимает определение синуса через единичную окружность",
    "Ученик может находить значения sin для стандартных углов"
  ],
  "huginn_steps": [
    {
      "explanation": "Что объяснить ученику на этом шаге",
      "question": "Конкретный вопрос с числами для проверки понимания",
      "correct_answer": "Правильный ответ",
      "hint": "Подсказка если ученик не знает"
    }
  ],
  "tasks": [
    {
      "question": "Текст задачи с конкретными числами",
      "answer": "Правильный ответ",
      "steps": "Пошаговое решение",
      "difficulty": 1
    }
  ]
}

ПРАВИЛА:
- theory: 200-500 слов, структурированная теория с формулами
- learning_goals: 3-7 целей обучения, от простых к сложным. Каждая начинается с "Ученик..."
- huginn_steps: 5-8 шагов от простого к сложному, каждый с конкретным вопросом
- tasks: 5-10 задач от простых (difficulty 1) к сложным (difficulty 5)
- Все вопросы и задачи должны иметь КОНКРЕТНЫЕ числа
- Формулы в LaTeX: $sin(30°) = \\frac{1}{2}$
- Язык: русский
- Если загружено несколько файлов — используй ВСЕ материалы для составления полного плана`,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: contentBlocks }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "AI не вернул валидный JSON" },
        { status: 500 },
      );
    }
    const plan = JSON.parse(jsonMatch[0]);

    // Создать learning_goals
    if (Array.isArray(plan.learning_goals)) {
      await supabase.from("learning_goals").delete().eq("topic_id", topicId);
      if (plan.learning_goals.length > 0) {
        await supabase.from("learning_goals").insert(
          (plan.learning_goals as string[]).map((t, i) => ({
            topic_id: topicId,
            text: t,
            sort_order: i,
          })),
        );
      }
    }

    // Автосохранить theory + huginn_instructions
    const huginnInstructions = Array.isArray(plan.huginn_steps)
      ? (
          plan.huginn_steps as Array<{
            explanation: string;
            question: string;
            correct_answer: string;
            hint: string;
          }>
        )
          .map(
            (s, i) =>
              `ШАГ ${i + 1}:\nОбъясни: ${s.explanation}\nСпроси: ${s.question}\nПравильный ответ: ${s.correct_answer}\nПодсказка: ${s.hint}`,
          )
          .join("\n\n")
      : "";

    await supabase.from("calibrations").upsert(
      {
        topic_id: topicId,
        theory_text: plan.theory || "",
        huginn_instructions: huginnInstructions,
      },
      { onConflict: "topic_id" },
    );

    // Автосохранить tasks
    if (Array.isArray(plan.tasks)) {
      await supabase.from("tasks").delete().eq("topic_id", topicId);
      if (plan.tasks.length > 0) {
        await supabase.from("tasks").insert(
          (
            plan.tasks as Array<{
              question: string;
              answer: string;
              steps?: string;
              difficulty?: number;
            }>
          ).map((t, i) => ({
            topic_id: topicId,
            question: t.question,
            answer: t.answer,
            steps: t.steps || null,
            difficulty: t.difficulty || 1,
            sort_order: i,
          })),
        );
      }
    }

    await supabase
      .from("topics")
      .update({ is_calibrated: true })
      .eq("id", topicId);

    return NextResponse.json({ plan });
  } catch (error: unknown) {
    console.error("Generate lesson error:", error);
    const message = error instanceof Error ? error.message : "Ошибка генерации";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
