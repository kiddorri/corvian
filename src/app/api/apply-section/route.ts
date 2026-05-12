import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type HuginnStepPlan = {
  goal: string;
  explanation: string;
  check_question: string;
  correct_answer: string;
  hint: string;
};

type TaskPlan = {
  question: string;
  answer: string;
  steps?: string;
  difficulty: number;
  template?: string | null;
  params?: Record<string, unknown> | null;
  answer_formula?: string | null;
};

type TopicPlan = {
  name: string;
  theory: string;
  learning_goals: string[];
  huginn_steps: HuginnStepPlan[];
  tasks: TaskPlan[];
};

function normGoalText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabase();
    const body = await req.json();
    const { classId, sectionName, topics } = body as {
      classId: string;
      sectionName: string;
      topics: TopicPlan[];
    };

    if (!classId || !sectionName || !topics?.length) {
      return NextResponse.json(
        { error: "Нужен classId, sectionName и topics" },
        { status: 400 },
      );
    }

    const { data: existingTopics } = await supabase
      .from("topics")
      .select("sort_order")
      .eq("class_id", classId)
      .order("sort_order", { ascending: false })
      .limit(1);

    let sortOrder = (existingTopics?.[0]?.sort_order ?? -1) + 1;

    const createdTopics: { id: string; name: string }[] = [];

    for (const topicPlan of topics) {
      const { data: newTopic, error: topicError } = await supabase
        .from("topics")
        .insert({
          class_id: classId,
          section: sectionName,
          name: topicPlan.name,
          sort_order: sortOrder++,
          is_calibrated: true,
        })
        .select("id")
        .single();

      if (topicError || !newTopic) {
        console.error("Failed to create topic:", topicPlan.name, topicError);
        continue;
      }

      const topicId = newTopic.id;
      createdTopics.push({ id: topicId, name: topicPlan.name });

      // 1. Сохранить цели обучения и получить их ID для маппинга на huginn_steps
      let insertedGoals: { id: string; text: string; sort_order: number }[] = [];
      if (topicPlan.learning_goals?.length) {
        const { data: goalsData, error: goalsError } = await supabase
          .from("learning_goals")
          .insert(
            topicPlan.learning_goals.map((text, i) => ({
              topic_id: topicId,
              text,
              sort_order: i,
            })),
          )
          .select("id, text, sort_order");

        if (goalsError) {
          console.error(
            "Failed to insert learning_goals for topic:",
            topicPlan.name,
            goalsError,
          );
        } else if (goalsData) {
          insertedGoals = goalsData as {
            id: string;
            text: string;
            sort_order: number;
          }[];
        }
      }

      // 2. Сохранить структурированные huginn_steps в новую таблицу
      const huginnSteps = topicPlan.huginn_steps ?? [];
      if (huginnSteps.length > 0 && insertedGoals.length > 0) {
        const goalByText = new Map<string, string>();
        for (const g of insertedGoals) {
          goalByText.set(normGoalText(g.text), g.id);
        }
        const goalBySortOrder = new Map<number, string>();
        for (const g of insertedGoals) {
          goalBySortOrder.set(g.sort_order, g.id);
        }

        const stepsToInsert: Array<{
          topic_id: string;
          goal_id: string;
          sort_order: number;
          explanation: string;
          check_question: string;
          correct_answer: string;
          hint: string | null;
        }> = [];

        for (let i = 0; i < huginnSteps.length; i++) {
          const step = huginnSteps[i];
          // 1) точное совпадение по тексту цели
          let goalId = goalByText.get(normGoalText(step.goal ?? ""));
          // 2) fallback — по индексу (sort_order)
          if (!goalId) {
            goalId = goalBySortOrder.get(i);
          }
          if (!goalId) continue;

          stepsToInsert.push({
            topic_id: topicId,
            goal_id: goalId,
            sort_order: i,
            explanation: step.explanation ?? "",
            check_question: step.check_question ?? "",
            correct_answer: step.correct_answer ?? "",
            hint: step.hint ?? null,
          });
        }

        if (stepsToInsert.length > 0) {
          const { error: stepsError } = await supabase
            .from("huginn_steps")
            .insert(stepsToInsert);
          if (stepsError) {
            console.error(
              "Failed to insert huginn_steps for topic:",
              topicPlan.name,
              stepsError,
            );
          }
        }
      }

      // 3. Plain-text fallback для calibrations.huginn_instructions
      //    (на случай если код где-то ещё читает старое поле)
      const huginnInstructions =
        huginnSteps
          ?.map(
            (s, i) =>
              `ШАГ ${i + 1}:\nЦель: ${s.goal ?? ""}\nОбъясни: ${s.explanation ?? ""}\nСпроси: ${s.check_question ?? ""}\nПравильный ответ: ${s.correct_answer ?? ""}\nПодсказка: ${s.hint ?? ""}`,
          )
          .join("\n\n") ?? "";

      await supabase.from("calibrations").upsert(
        {
          topic_id: topicId,
          theory_text: topicPlan.theory || "",
          huginn_instructions: huginnInstructions,
        },
        { onConflict: "topic_id" },
      );

      // 4. Задачи — с новыми полями template / params / answer_formula
      if (topicPlan.tasks?.length) {
        await supabase.from("tasks").insert(
          topicPlan.tasks.map((t, i) => ({
            topic_id: topicId,
            question: t.question,
            answer: t.answer,
            steps: t.steps || null,
            difficulty: t.difficulty || 1,
            sort_order: i,
            template: t.template ?? null,
            params: t.params ?? null,
            answer_formula: t.answer_formula ?? null,
          })),
        );
      }
    }

    return NextResponse.json({
      success: true,
      created: createdTopics,
    });
  } catch (error) {
    console.error("apply-section error:", error);
    return NextResponse.json(
      { error: "Ошибка: " + (error as Error).message },
      { status: 500 },
    );
  }
}
