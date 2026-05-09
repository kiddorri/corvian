import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type TopicPlan = {
  name: string;
  theory: string;
  learning_goals: string[];
  huginn_steps: {
    explanation: string;
    question: string;
    correct_answer: string;
    hint: string;
  }[];
  tasks: {
    question: string;
    answer: string;
    steps?: string;
    difficulty: number;
  }[];
};

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

      const huginnInstructions =
        topicPlan.huginn_steps
          ?.map(
            (s, i) =>
              `ШАГ ${i + 1}:\nОбъясни: ${s.explanation}\nСпроси: ${s.question}\nПравильный ответ: ${s.correct_answer}\nПодсказка: ${s.hint}`,
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

      if (topicPlan.learning_goals?.length) {
        await supabase.from("learning_goals").insert(
          topicPlan.learning_goals.map((text, i) => ({
            topic_id: topicId,
            text,
            sort_order: i,
          })),
        );
      }

      if (topicPlan.tasks?.length) {
        await supabase.from("tasks").insert(
          topicPlan.tasks.map((t, i) => ({
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
