import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

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
    const file = formData.get("file") as File | null;
    const topicName = formData.get("topicName") as string;
    const topicSection = formData.get("topicSection") as string;
    const grade = formData.get("grade") as string;
    const subject = formData.get("subject") as string;
    const topicId = formData.get("topicId") as string;

    if (!file) {
      return NextResponse.json({ error: "Файл не загружен" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const mediaType = file.type || "application/pdf";

    const fileName = `${topicId}/${Date.now()}-${file.name}`;
    await supabase.storage
      .from("calibration-files")
      .upload(fileName, Buffer.from(bytes), { contentType: mediaType });

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

    const isImage = mediaType.startsWith("image/");
    const fileBlock: Anthropic.ContentBlockParam = isImage
      ? {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as
              | "image/png"
              | "image/jpeg"
              | "image/gif"
              | "image/webp",
            data: base64,
          },
        }
      : {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64,
          },
        };

    const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [
      fileBlock,
      {
        type: "text",
        text: `Ты — методист. На основе загруженного материала создай структурированный план урока.

ТЕМА: ${topicName}
РАЗДЕЛ: ${topicSection}
КЛАСС: ${grade}
ПРЕДМЕТ: ${subject}

Верни ТОЛЬКО валидный JSON (без markdown-обёртки, без \`\`\`json), строго в таком формате:

{
  "theory": "Теоретический материал по теме. Используй Markdown для форматирования и LaTeX ($формула$) для математических формул. Пиши понятно для ученика ${grade} класса.",
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
- huginn_steps: 5-8 шагов от простого к сложному, каждый с конкретным вопросом
- tasks: 5-10 задач от простых (difficulty 1) к сложным (difficulty 5)
- Все вопросы и задачи должны иметь КОНКРЕТНЫЕ числа, не абстрактные
- Формулы в LaTeX: $sin(30°) = \\frac{1}{2}$
- Язык: русский`,
      },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const plan = JSON.parse(cleaned);

    return NextResponse.json({ plan, fileName });
  } catch (error: unknown) {
    console.error("Generate lesson error:", error);
    const message = error instanceof Error ? error.message : "Ошибка генерации";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
