import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { parseFile } from "@/lib/parse-file";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
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

    const fileBlocks: Anthropic.ContentBlockParam[] = [];
    for (const pf of parsedFiles) {
      if (pf.base64 && pf.mediaType) {
        const base64SizeMB = (pf.base64.length * 3) / 4 / 1024 / 1024;
        if (base64SizeMB > 5) {
          fileBlocks.push({
            type: "text",
            text: `[Файл: ${pf.name} — слишком большой (${base64SizeMB.toFixed(1)} MB), пропущен]`,
          });
          continue;
        }
        if (pf.mediaType === "application/pdf") {
          fileBlocks.push({
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pf.base64,
            },
          });
        } else {
          fileBlocks.push({
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
        fileBlocks.push({ type: "text", text: `[Файл: ${pf.name}]` });
      } else if (pf.text) {
        const trimmedText = pf.text.slice(0, 15000);
        fileBlocks.push({
          type: "text",
          text: `[Файл: ${pf.name}]\n\n${trimmedText}${pf.text.length > 15000 ? "\n[...обрезан...]" : ""}`,
        });
      }
    }

    // Собрать весь текст из файлов для компактного использования в ЭТАПЕ 2
    const allFileTexts = fileBlocks
      .filter(
        (b): b is Anthropic.TextBlockParam =>
          b.type === "text" && typeof b.text === "string",
      )
      .map((b) => b.text)
      .join("\n\n");

    // Ограничить общий текст 20000 символов для ЭТАПА 2
    const compactFileText = allFileTexts.slice(0, 20000);

    // ========== ЭТАП 1: Определить темы ==========
    const step1Content: Anthropic.ContentBlockParam[] = [
      ...fileBlocks,
      {
        type: "text",
        text: `Ты — методист. Проанализируй загруженные материалы и определи логические темы для раздела.

РАЗДЕЛ: ${sectionName}
КЛАСС: ${grade}
ПРЕДМЕТ: ${subject}

Верни ТОЛЬКО валидный JSON (без markdown-обёртки):

{
  "topics": [
    {
      "name": "Название темы",
      "description": "Краткое описание что входит в тему (1-2 предложения)",
      "learning_goals": [
        "Ученик понимает...",
        "Ученик может..."
      ]
    }
  ]
}

ПРАВИЛА:
- От 3 до 8 тем, в логическом порядке от простого к сложному
- Каждая тема: 3-7 learning_goals
- НЕ дублируй материал между темами
- Если файлы содержат нумерацию уроков — используй её для разбиения
- Язык: русский`,
      },
    ];

    const step1Response = await anthropic.messages.create(
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: step1Content }],
      },
      { timeout: 60000 },
    );

    const step1Text = step1Response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const step1Match = step1Text.match(/\{[\s\S]*\}/);
    if (!step1Match) {
      return NextResponse.json(
        { error: "AI не определил темы" },
        { status: 500 },
      );
    }

    const topicsPlan = JSON.parse(step1Match[0]) as {
      topics?: Array<{
        name: string;
        description: string;
        learning_goals: string[];
      }>;
    };
    if (!topicsPlan.topics?.length) {
      return NextResponse.json(
        { error: "AI не нашёл тем в материалах" },
        { status: 500 },
      );
    }

    // Ограничить до 6 тем чтобы уложиться в таймаут
    const topicsToProcess = topicsPlan.topics.slice(0, 6);
    const truncated = topicsPlan.topics.length > topicsToProcess.length;

    // ========== ЭТАП 2: Полные планы для каждой темы ==========
    const fullTopics: Array<{
      name: string;
      learning_goals: string[];
      theory: string;
      huginn_steps: unknown[];
      tasks: unknown[];
    }> = [];

    for (const topicOutline of topicsToProcess) {
      const step2Content: Anthropic.ContentBlockParam[] = [
        {
          type: "text",
          text: `МАТЕРИАЛЫ ИЗ ФАЙЛОВ:\n\n${compactFileText}`,
        },
        {
          type: "text",
          text: `Ты — методист. Создай ПОЛНЫЙ план урока для ОДНОЙ темы из материалов выше.

ТЕМА: ${topicOutline.name}
ОПИСАНИЕ: ${topicOutline.description}
РАЗДЕЛ: ${sectionName}
КЛАСС: ${grade}
ПРЕДМЕТ: ${subject}

ЦЕЛИ ОБУЧЕНИЯ (уже определены):
${topicOutline.learning_goals.map((g, i) => `${i + 1}. ${g}`).join("\n")}

Верни ТОЛЬКО валидный JSON:

{
  "theory": "Теоретический материал по ЭТОЙ теме. Markdown + LaTeX ($формула$). 200-400 слов.",
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

ПРАВИЛА:
- theory: используй информацию из материалов, относящуюся к ЭТОЙ теме
- huginn_steps: 5-8 шагов
- tasks: 5-10 задач, difficulty 1-5
- Все вопросы с КОНКРЕТНЫМИ числами
- Язык: русский`,
        },
      ];

      try {
        const step2Response = await anthropic.messages.create(
          {
            model: "claude-haiku-4-5-20251001",
            max_tokens: 4096,
            messages: [{ role: "user", content: step2Content }],
          },
          { timeout: 30000 },
        );

        const step2Text = step2Response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");

        const step2Match = step2Text.match(/\{[\s\S]*\}/);
        if (step2Match) {
          const topicDetail = JSON.parse(step2Match[0]);
          fullTopics.push({
            name: topicOutline.name,
            learning_goals: topicOutline.learning_goals,
            theory: topicDetail.theory || "",
            huginn_steps: topicDetail.huginn_steps || [],
            tasks: topicDetail.tasks || [],
          });
        } else {
          fullTopics.push({
            name: topicOutline.name,
            learning_goals: topicOutline.learning_goals,
            theory: "",
            huginn_steps: [],
            tasks: [],
          });
        }
      } catch (topicError) {
        console.error(
          `Failed to generate details for topic: ${topicOutline.name}`,
          topicError,
        );
        fullTopics.push({
          name: topicOutline.name,
          learning_goals: topicOutline.learning_goals,
          theory: "",
          huginn_steps: [],
          tasks: [],
        });
      }
    }

    return NextResponse.json({
      section: sectionName,
      topics: fullTopics,
      fileCount: files.length,
      ...(truncated
        ? {
            warning: `Обработано ${fullTopics.length} тем из ${topicsPlan.topics.length} (ограничение времени).`,
          }
        : {}),
    });
  } catch (error: unknown) {
    console.error("generate-section error:", error);
    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка сервера";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
