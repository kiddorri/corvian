import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { parseFile } from "@/lib/parse-file";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    let classId: string;
    let sectionName: string;
    let grade: string;
    let subject: string;
    const fileBlocks: Anthropic.ContentBlockParam[] = [];

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      classId = body.classId;
      sectionName = body.sectionName;
      grade = body.grade;
      subject = body.subject;

      for (const tf of (body.textFiles ?? []) as Array<{
        name: string;
        text: string;
      }>) {
        const raw = tf.text || "";
        const trimmed = raw.slice(0, 15000);
        fileBlocks.push({
          type: "text",
          text: `[Файл: ${tf.name}]\n\n${trimmed}${raw.length > 15000 ? "\n[...обрезан...]" : ""}`,
        });
      }
    } else {
      const formData = await req.formData();
      classId = formData.get("classId") as string;
      sectionName = formData.get("sectionName") as string;
      grade = formData.get("grade") as string;
      subject = formData.get("subject") as string;

      const textFilesJson = formData.get("textFiles") as string | null;
      if (textFilesJson) {
        const textFiles = JSON.parse(textFilesJson) as Array<{
          name: string;
          text: string;
        }>;
        for (const tf of textFiles) {
          const raw = tf.text || "";
          const trimmed = raw.slice(0, 15000);
          fileBlocks.push({
            type: "text",
            text: `[Файл: ${tf.name}]\n\n${trimmed}${raw.length > 15000 ? "\n[...обрезан...]" : ""}`,
          });
        }
      }

      const files = formData.getAll("files") as File[];
      for (const file of files) {
        const parsed = await parseFile(file);
        if (parsed.base64 && parsed.mediaType) {
          const base64SizeMB =
            (parsed.base64.length * 3) / 4 / 1024 / 1024;
          if (base64SizeMB > 5) {
            fileBlocks.push({
              type: "text",
              text: `[Файл: ${parsed.name} — слишком большой (${base64SizeMB.toFixed(1)} MB), пропущен]`,
            });
            continue;
          }
          if (parsed.mediaType === "application/pdf") {
            fileBlocks.push({
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: parsed.base64,
              },
            });
          } else {
            fileBlocks.push({
              type: "image",
              source: {
                type: "base64",
                media_type: parsed.mediaType as
                  | "image/png"
                  | "image/jpeg"
                  | "image/gif"
                  | "image/webp",
                data: parsed.base64,
              },
            });
          }
          fileBlocks.push({ type: "text", text: `[Файл: ${parsed.name}]` });
        } else if (parsed.text) {
          const trimmedText = parsed.text.slice(0, 15000);
          fileBlocks.push({
            type: "text",
            text: `[Файл: ${parsed.name}]\n\n${trimmedText}${parsed.text.length > 15000 ? "\n[...обрезан...]" : ""}`,
          });
        }
      }
    }

    if (!classId || !sectionName || fileBlocks.length === 0) {
      return NextResponse.json(
        {
          error:
            "Нужен classId, sectionName и хотя бы один файл с содержимым",
        },
        { status: 400 },
      );
    }

    // Собрать весь текст из файлов для компактного использования в ЭТАПЕ 2
    const allFileTexts = fileBlocks
      .filter(
        (b): b is Anthropic.TextBlockParam =>
          b.type === "text" && typeof b.text === "string",
      )
      .map((b) => b.text)
      .join("\n\n");

    // Ограничить общий текст 8000 символов для ЭТАПА 2
    let compactFileText = allFileTexts.slice(0, 8000);

    // Fallback: при PDF-only загрузке parseFile возвращает пустой text для PDF,
    // и compactFileText содержит только метки [Файл: name]. Дополняем именами
    // файлов и контекстом раздела чтобы Haiku имел подсказки для генерации.
    if (compactFileText.length < 200) {
      const fileNames: string[] = [];
      for (const block of fileBlocks) {
        if (block.type === "text" && typeof block.text === "string") {
          const match = block.text.match(/\[Файл:\s*([^\]\n]+?)\s*\]/);
          if (match) fileNames.push(match[1]);
        }
      }
      if (fileNames.length > 0) {
        compactFileText = `Загруженные файлы:\n${fileNames
          .map((n) => `- ${n}`)
          .join(
            "\n",
          )}\n\nРаздел: ${sectionName}\nКласс: ${grade}\nПредмет: ${subject}\n\n(Полное содержимое файлов недоступно в этом этапе — опирайся на имена файлов, тему раздела и стандартную школьную программу.)`;
      }
    }

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
- Язык: русский

Используй имена загруженных файлов как подсказку для разбиения на темы. Например, если файл называется 'Тригонометрия_синус_косинус.pdf' — это подсказка что есть тема про синус и косинус. Но не ограничивайся только именами — анализируй содержимое.`,
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

    const batchSize = 2;
    for (let i = 0; i < topicsToProcess.length; i += batchSize) {
      const batch = topicsToProcess.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(async (topicOutline) => {
          const step2Content: Anthropic.ContentBlockParam[] = [
            {
              type: "text",
              text: `МАТЕРИАЛЫ ИЗ ФАЙЛОВ:\n\n${compactFileText}`,
            },
            {
              type: "text",
              text: `Ты — методист. Создай ПОЛНЫЙ план урока для ОДНОЙ темы.

ТЕМА: ${topicOutline.name}
ОПИСАНИЕ: ${topicOutline.description || ""}
РАЗДЕЛ: ${sectionName}
КЛАСС: ${grade}
ПРЕДМЕТ: ${subject}

ЦЕЛИ ОБУЧЕНИЯ:
${topicOutline.learning_goals.map((g, idx) => `${idx + 1}. ${g}`).join("\n")}

Верни ТОЛЬКО валидный JSON:

{
  "theory": "Теоретический материал. Markdown + LaTeX. 200-400 слов.",
  "huginn_steps": [
    {"explanation": "Что объяснить", "question": "Вопрос с числами", "correct_answer": "Ответ", "hint": "Подсказка"}
  ],
  "tasks": [
    {"question": "Задача с числами", "answer": "Ответ", "steps": "Решение", "difficulty": 1}
  ]
}

ПРАВИЛА:
- huginn_steps: 5-8 шагов
- tasks: 5-10 задач, difficulty 1-5
- Конкретные числа, LaTeX, русский язык`,
            },
          ];

          const step2Response = await anthropic.messages.create(
            {
              model: "claude-haiku-4-5-20251001",
              max_tokens: 4096,
              messages: [{ role: "user", content: step2Content }],
            },
            { timeout: 55000 },
          );

          if (step2Response.stop_reason === "max_tokens") {
            throw new Error("Response truncated (max_tokens)");
          }

          const step2Text = step2Response.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("");

          console.log(
            `[STEP2] Topic: "${topicOutline.name}", stop_reason: ${step2Response.stop_reason}, text_len: ${step2Text.length}`,
          );

          const step2Match = step2Text.match(/\{[\s\S]*\}/);
          if (step2Match) {
            const topicDetail = JSON.parse(step2Match[0]);
            return {
              name: topicOutline.name,
              learning_goals: topicOutline.learning_goals,
              theory: topicDetail.theory || "",
              huginn_steps: topicDetail.huginn_steps || [],
              tasks: topicDetail.tasks || [],
            };
          }

          throw new Error("No JSON in response");
        }),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const topicOutline = batch[j];

        if (result.status === "fulfilled") {
          fullTopics.push(result.value);
          continue;
        }

        console.error(
          `Failed for topic: ${topicOutline.name}`,
          result.reason,
        );

        try {
          const retryResponse = await anthropic.messages.create(
            {
              model: "claude-haiku-4-5-20251001",
              max_tokens: 4096,
              messages: [
                {
                  role: "user",
                  content: `МАТЕРИАЛЫ:\n${compactFileText.slice(0, 4000)}\n\nСоздай план урока. Тема: "${topicOutline.name}". Класс: ${grade}, ${subject}.

Цели: ${topicOutline.learning_goals.join("; ")}

Верни ТОЛЬКО JSON:
{
  "theory": "теория 150-300 слов с LaTeX",
  "huginn_steps": [{"explanation":"...","question":"вопрос с числами","correct_answer":"...","hint":"..."}],
  "tasks": [{"question":"задача с числами","answer":"...","steps":"решение","difficulty":1}]
}

5 шагов, 5 задач. Русский язык.`,
                },
              ],
            },
            { timeout: 45000 },
          );
          const retryText = retryResponse.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("");
          console.log(
            `[RETRY] Topic: "${topicOutline.name}", stop_reason: ${retryResponse.stop_reason}, text_len: ${retryText.length}`,
          );
          const retryMatch = retryText.match(/\{[\s\S]*\}/);
          if (retryMatch) {
            fullTopics.push({
              name: topicOutline.name,
              learning_goals: topicOutline.learning_goals,
              ...JSON.parse(retryMatch[0]),
            });
          } else {
            console.warn(
              `[EMPTY] Topic "${topicOutline.name}" produced with empty content`,
            );
            fullTopics.push({
              name: topicOutline.name,
              learning_goals: topicOutline.learning_goals,
              theory: "",
              huginn_steps: [],
              tasks: [],
            });
          }
        } catch (retryError) {
          console.error(
            `Retry failed for topic: ${topicOutline.name}`,
            retryError,
          );
          console.warn(
            `[EMPTY] Topic "${topicOutline.name}" produced with empty content`,
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
    }

    return NextResponse.json({
      section: sectionName,
      topics: fullTopics,
      fileCount: fileBlocks.filter((b) => b.type === "text").length,
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
