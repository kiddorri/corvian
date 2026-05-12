import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { parseFile } from "@/lib/parse-file";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export const maxDuration = 300;

// Парсер JSON с восстановлением после обрыва (stop_reason: max_tokens).
// Идёт по тексту посимвольно, ведёт стек скобок и запоминает последнюю
// «безопасную» позицию — конец полностью закрытого объекта внутри массива
// или закрытого массива внутри объекта. Дорезает остаток и закрывает
// нужные скобки. Если ничего безопасного нет — null.
function tryParseTruncatedJson(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  const raw = text.slice(start);

  try {
    return JSON.parse(raw);
  } catch {
    // упало — попробуем восстановить
  }

  const stack: string[] = [];
  let inStr = false;
  let escape = false;
  let lastSafeEnd = -1;
  let lastSafeStack: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === "{" || c === "[") {
      stack.push(c);
    } else if (c === "}") {
      if (stack[stack.length - 1] !== "{") break;
      stack.pop();
      if (stack[stack.length - 1] === "[") {
        lastSafeEnd = i + 1;
        lastSafeStack = [...stack];
      }
    } else if (c === "]") {
      if (stack[stack.length - 1] !== "[") break;
      stack.pop();
      if (stack[stack.length - 1] === "{") {
        lastSafeEnd = i + 1;
        lastSafeStack = [...stack];
      }
    }
  }

  if (lastSafeEnd <= 0) return null;

  let candidate = raw.slice(0, lastSafeEnd);
  for (let i = lastSafeStack.length - 1; i >= 0; i--) {
    candidate += lastSafeStack[i] === "{" ? "}" : "]";
  }
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

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
    // файлов и контекстом раздела чтобы Sonnet имел подсказки для генерации.
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

    // Дальше — стриминговый ответ (SSE). Это позволяет начать слать байты в
    // первые секунды, чтобы Vercel Hobby (60s function timeout) не убил запрос
    // во время долгой генерации Sonnet'ом.
    type HuginnStep = {
      goal: string;
      explanation: string;
      check_question: string;
      correct_answer: string;
      hint: string;
    };
    type TaskPlan = {
      question: string;
      answer: string;
      steps: string;
      difficulty: number;
      template: string | null;
      params: Record<string, unknown> | null;
      answer_formula: string | null;
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        };

        try {
          // ========== ЭТАП 1: Определить темы (Sonnet) ==========
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
              model: "claude-sonnet-4-6",
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
            send({ type: "error", message: "AI не определил темы" });
            controller.close();
            return;
          }

          const topicsPlan = JSON.parse(step1Match[0]) as {
            topics?: Array<{
              name: string;
              description: string;
              learning_goals: string[];
            }>;
          };
          if (!topicsPlan.topics?.length) {
            send({ type: "error", message: "AI не нашёл тем в материалах" });
            controller.close();
            return;
          }

          // Ограничить до 6 тем чтобы уложиться по времени
          const topicsToProcess = topicsPlan.topics.slice(0, 6);
          const truncated = topicsPlan.topics.length > topicsToProcess.length;

          send({
            type: "outline",
            topics: topicsToProcess.map((t) => t.name),
          });

          // ========== ЭТАП 2: По одной теме за раз ==========
          let producedCount = 0;
          for (let idx = 0; idx < topicsToProcess.length; idx++) {
            const topicOutline = topicsToProcess[idx];
            const tStart = Date.now();
            console.log("[GENERATE] Starting topic:", topicOutline.name);

            let pushed:
              | {
                  name: string;
                  learning_goals: string[];
                  theory: string;
                  huginn_steps: HuginnStep[];
                  tasks: TaskPlan[];
                }
              | null = null;
            let primaryError: unknown = null;

            try {
              const step2Content: Anthropic.ContentBlockParam[] = [
                {
                  type: "text",
                  text: `МАТЕРИАЛЫ ИЗ ФАЙЛОВ:\n\n${compactFileText}`,
                },
                {
                  type: "text",
                  text: `Ты — эксперт по образованию. Создай полный план урока по теме.

Генерируй столько задач сколько есть в материале учителя. Если в файлах есть задачи разных уровней (A/B/C или лёгкие/средние/сложные) — сохрани эту структуру. Максимум 5 huginn_steps и 10 tasks. Theory — максимум 400 слов.

Входные данные:
- Тема: ${topicOutline.name}
- Цели: ${JSON.stringify(topicOutline.learning_goals)}
- Раздел: ${sectionName}
- Класс: ${grade}
- Предмет: ${subject}
- Материал учителя: см. блок "МАТЕРИАЛЫ ИЗ ФАЙЛОВ" выше

Верни JSON (без markdown):
{
  "theory": "Объяснение темы в markdown+LaTeX. МАКСИМУМ 400 слов. Используй $...$ для инлайн формул, $$...$$ для блочных.",

  "huginn_steps": [
    {
      "goal": "текст цели (точно как в learning_goals)",
      "explanation": "Что Хугин должен объяснить ученику. 2-3 предложения. Конкретно, с примерами.",
      "check_question": "Проверочный вопрос с ЧИСЛОВЫМ ответом если возможно",
      "correct_answer": "Точный ответ. Для чисел — одно число или дробь.",
      "hint": "Подсказка если ученик ответит неправильно"
    }
  ],

  "tasks": [
    {
      "question": "Текст задачи",
      "answer": "Точный ответ (одно число, дробь или короткая фраза)",
      "steps": "Пошаговое решение для подсказок",
      "difficulty": 1,
      "template": "{a} + {b} = ?",
      "params": {"a": [1, 100], "b": [1, 100]},
      "answer_formula": "a + b"
    }
  ]
}

Правила для tasks:
- template, params, answer_formula — ТОЛЬКО для математических/числовых задач
- Для нечисловых задач (история, биология) — template/params/answer_formula = null
- answer должен быть МАКСИМАЛЬНО простым: число, дробь, или 1-3 слова
- Бери задачи из материала учителя. Если структура A/B/C (или лёгкие/средние/сложные) — сохраняй порядок и маппи в difficulty (A=1-2, B=3, C=4-5).
- МАКСИМУМ 10 задач, difficulty от 1 до 5

Правила для huginn_steps:
- МАКСИМУМ 5 шагов. Если целей больше — объедини связанные в один шаг
- check_question должен иметь ОДНОЗНАЧНЫЙ ответ
- correct_answer — точный, проверяемый ответ
- explanation — НЕ весь урок, а конкретное объяснение этой цели

Язык: русский.`,
                },
              ];

              const step2Response = await anthropic.messages.create(
                {
                  model: "claude-sonnet-4-6",
                  max_tokens: 8192,
                  messages: [{ role: "user", content: step2Content }],
                },
                { timeout: 60000 },
              );

              const step2Text = step2Response.content
                .filter((b): b is Anthropic.TextBlock => b.type === "text")
                .map((b) => b.text)
                .join("");

              const truncatedByTokens =
                step2Response.stop_reason === "max_tokens";

              console.log(
                `[STEP2-SONNET] Topic: "${topicOutline.name}", stop_reason: ${step2Response.stop_reason}, text_len: ${step2Text.length}`,
              );

              let topicDetail: {
                theory?: string;
                huginn_steps?: HuginnStep[];
                tasks?: TaskPlan[];
              } | null = null;

              if (!truncatedByTokens) {
                const step2Match = step2Text.match(/\{[\s\S]*\}/);
                if (step2Match) {
                  try {
                    topicDetail = JSON.parse(step2Match[0]);
                  } catch {
                    topicDetail = null;
                  }
                }
              }

              if (!topicDetail) {
                const repaired = tryParseTruncatedJson(step2Text);
                if (repaired && typeof repaired === "object") {
                  console.warn(
                    `[STEP2-SONNET] Recovered truncated JSON for "${topicOutline.name}"`,
                  );
                  topicDetail = repaired as {
                    theory?: string;
                    huginn_steps?: HuginnStep[];
                    tasks?: TaskPlan[];
                  };
                }
              }

              if (topicDetail) {
                pushed = {
                  name: topicOutline.name,
                  learning_goals: topicOutline.learning_goals,
                  theory: topicDetail.theory || "",
                  huginn_steps: (topicDetail.huginn_steps ||
                    []) as HuginnStep[],
                  tasks: (topicDetail.tasks || []) as TaskPlan[],
                };
              } else {
                primaryError = new Error(
                  truncatedByTokens
                    ? "Response truncated (max_tokens) and unrecoverable"
                    : "No JSON in response",
                );
              }
            } catch (err) {
              primaryError = err;
            }

            if (!pushed) {
              console.error(
                `Failed for topic: ${topicOutline.name}`,
                primaryError,
              );
              try {
                const retryResponse = await anthropic.messages.create(
                  {
                    model: "claude-sonnet-4-6",
                    max_tokens: 4096,
                    messages: [
                      {
                        role: "user",
                        content: `МАТЕРИАЛЫ:\n${compactFileText.slice(0, 4000)}\n\nСократи план урока. Тема: "${topicOutline.name}". Класс: ${grade}, ${subject}.

Цели: ${topicOutline.learning_goals.join("; ")}

Верни ТОЛЬКО JSON:
{
  "theory": "теория МАКСИМУМ 200 слов с LaTeX",
  "huginn_steps": [{"goal":"текст цели как выше","explanation":"...","check_question":"вопрос с числами","correct_answer":"...","hint":"..."}],
  "tasks": [{"question":"задача","answer":"...","steps":"решение","difficulty":1,"template":null,"params":null,"answer_formula":null}]
}

Сократи: РОВНО 3 huginn_steps, РОВНО 5 tasks, theory 200 слов. Русский язык.`,
                      },
                    ],
                  },
                  { timeout: 55000 },
                );
                const retryText = retryResponse.content
                  .filter((b): b is Anthropic.TextBlock => b.type === "text")
                  .map((b) => b.text)
                  .join("");
                console.log(
                  `[RETRY-SONNET] Topic: "${topicOutline.name}", stop_reason: ${retryResponse.stop_reason}, text_len: ${retryText.length}`,
                );
                let parsedRetry: {
                  theory?: string;
                  huginn_steps?: HuginnStep[];
                  tasks?: TaskPlan[];
                } | null = null;
                if (retryResponse.stop_reason !== "max_tokens") {
                  const retryMatch = retryText.match(/\{[\s\S]*\}/);
                  if (retryMatch) {
                    try {
                      parsedRetry = JSON.parse(retryMatch[0]);
                    } catch {
                      parsedRetry = null;
                    }
                  }
                }
                if (!parsedRetry) {
                  const repaired = tryParseTruncatedJson(retryText);
                  if (repaired && typeof repaired === "object") {
                    console.warn(
                      `[RETRY-SONNET] Recovered truncated JSON for "${topicOutline.name}"`,
                    );
                    parsedRetry = repaired as {
                      theory?: string;
                      huginn_steps?: HuginnStep[];
                      tasks?: TaskPlan[];
                    };
                  }
                }

                if (parsedRetry) {
                  pushed = {
                    name: topicOutline.name,
                    learning_goals: topicOutline.learning_goals,
                    theory: parsedRetry.theory || "",
                    huginn_steps: (parsedRetry.huginn_steps ||
                      []) as HuginnStep[],
                    tasks: (parsedRetry.tasks || []) as TaskPlan[],
                  };
                } else {
                  console.warn(
                    `[EMPTY] Topic "${topicOutline.name}" produced with empty content`,
                  );
                  pushed = {
                    name: topicOutline.name,
                    learning_goals: topicOutline.learning_goals,
                    theory: "",
                    huginn_steps: [],
                    tasks: [],
                  };
                }
              } catch (retryError) {
                console.error(
                  `Retry failed for topic: ${topicOutline.name}`,
                  retryError,
                );
                console.warn(
                  `[EMPTY] Topic "${topicOutline.name}" produced with empty content`,
                );
                pushed = {
                  name: topicOutline.name,
                  learning_goals: topicOutline.learning_goals,
                  theory: "",
                  huginn_steps: [],
                  tasks: [],
                };
              }
            }

            console.log(
              "[GENERATE] Finished topic:",
              topicOutline.name,
              "in",
              Date.now() - tStart,
              "ms",
            );

            send({ type: "topic", index: idx, data: pushed });
            producedCount++;
          }

          send({
            type: "done",
            section: sectionName,
            fileCount: fileBlocks.filter((b) => b.type === "text").length,
            ...(truncated
              ? {
                  warning: `Обработано ${producedCount} тем из ${topicsPlan.topics.length} (ограничение времени).`,
                }
              : {}),
          });
        } catch (err) {
          console.error("generate-section stream error:", err);
          send({
            type: "error",
            message:
              err instanceof Error ? err.message : "Неизвестная ошибка сервера",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });

  } catch (error: unknown) {
    console.error("generate-section error:", error);
    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка сервера";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
