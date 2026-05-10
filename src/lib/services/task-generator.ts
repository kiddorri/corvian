import Anthropic from "@anthropic-ai/sdk";

interface TaskVariation {
  question: string;
  answer: string;
}

export async function generateTaskVariation(
  originalQuestion: string,
  originalAnswer: string,
  topicName: string,
): Promise<TaskVariation> {
  const anthropic = new Anthropic();

  const response = await anthropic.messages.create(
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system:
        'Ты генерируешь вариации учебных задач. Отвечай ТОЛЬКО в формате JSON без markdown: {"question": "...", "answer": "..."}',
      messages: [
        {
          role: "user",
          content: `Тема: ${topicName}
Оригинальная задача: ${originalQuestion}
Правильный ответ: ${originalAnswer}

Сгенерируй ПОХОЖУЮ задачу того же типа но с ДРУГИМИ числами/данными. Задача должна быть примерно той же сложности. Ответ должен быть точным и правильным.

Ответь ТОЛЬКО JSON: {"question": "...", "answer": "..."}`,
        },
      ],
    },
    { timeout: 15000 },
  );

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const cleaned = text.replace(/```json\s*|```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.question && parsed.answer) {
      return {
        question: String(parsed.question),
        answer: String(parsed.answer),
      };
    }
  } catch (e) {
    console.error("Failed to parse variation:", text, e);
  }

  return {
    question: originalQuestion.replace(/\d+/g, () =>
      String(Math.floor(Math.random() * 50) + 1),
    ),
    answer: "проверь сам",
  };
}
