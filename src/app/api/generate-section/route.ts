import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
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

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const supabase = getSupabase();
    void supabase;
    const formData = await req.formData();
    const classId = formData.get("classId") as string;
    const sectionName = formData.get("sectionName") as string;
    const grade = formData.get("grade") as string;
    const subject = formData.get("subject") as string;
    const files = formData.getAll("files") as File[];

    if (!classId || !sectionName || files.length === 0) {
      return NextResponse.json(
        { error: "Нужен classId, sectionName и хотя бы один файл" },
        { status: 400 },
      );
    }

    const parsedFiles = await Promise.all(files.map(parseFile));

    const contentBlocks: Anthropic.ContentBlockParam[] = [];

    for (const pf of parsedFiles) {
      if (pf.base64 && pf.mediaType) {
        const base64SizeMB = (pf.base64.length * 3) / 4 / 1024 / 1024;

        if (base64SizeMB > 5) {
          contentBlocks.push({
            type: "text",
            text: `[Файл: ${pf.name} — слишком большой для обработки (${base64SizeMB.toFixed(1)} MB), пропущен]`,
          });
          continue;
        }

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
        const trimmedText = pf.text.slice(0, 10000);
        contentBlocks.push({
          type: "text",
          text: `[Файл: ${pf.name}]\n\n${trimmedText}${pf.text.length > 10000 ? "\n\n[...текст обрезан...]" : ""}`,
        });
      }
    }

    contentBlocks.push({
      type: "text",
      text: `Ты — методист. Проанализируй ВСЕ загруженные материалы и создай структурированный набор тем для раздела.

РАЗДЕЛ: ${sectionName}
КЛАСС: ${grade}
ПРЕДМЕТ: ${subject}

Разбей материал на логические темы (от 3 до 10). Для КАЖДОЙ темы создай полный план урока.

Верни ТОЛЬКО валидный JSON (без markdown-обёртки, без \`\`\`json):

{
  "topics": [
    {
      "name": "Название темы",
      "theory": "Теоретический материал. Markdown + LaTeX ($формула$). 200-500 слов.",
      "learning_goals": [
        "Ученик понимает...",
        "Ученик может..."
      ],
      "huginn_steps": [
        {
          "explanation": "Что объяснить",
          "question": "Конкретный вопрос с числами",
          "correct_answer": "Ответ",
          "hint": "Подсказка"
        }
      ],
      "tasks": [
        {
          "question": "Задача с числами",
          "answer": "Ответ",
          "steps": "Пошаговое решение",
          "difficulty": 1
        }
      ]
    }
  ]
}

ПРАВИЛА:
- Темы должны идти в логическом порядке (от простого к сложному)
- Каждая тема: 3-7 learning_goals, 5-8 huginn_steps, 5-10 tasks
- НЕ дублируй материал между темами
- Если в файлах есть готовые задачи — используй их (адаптируй формат)
- Если в файлах есть презентации — извлеки ключевые концепции для theory
- Все вопросы и задачи с КОНКРЕТНЫМИ числами
- Формулы в LaTeX
- Язык: русский`,
    });

    const response = await anthropic.messages.create(
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [{ role: "user", content: contentBlocks }],
      },
      { timeout: 110000 },
    );

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

    const result = JSON.parse(jsonMatch[0]);

    if (!result.topics || !Array.isArray(result.topics)) {
      return NextResponse.json(
        { error: "AI не вернул список тем" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      section: sectionName,
      topics: result.topics,
      fileCount: files.length,
    });
  } catch (error: unknown) {
    console.error("generate-section error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Неизвестная ошибка сервера";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
