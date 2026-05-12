import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type {
  LibraryTopicInput,
  LibraryUploadResult,
} from "@/lib/types/library";

export const maxDuration = 30;

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function validate(input: unknown): { ok: true; data: LibraryTopicInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "JSON должен быть объектом" };
  const o = input as Record<string, unknown>;
  if (typeof o.subject !== "string" || !o.subject.trim()) return { ok: false, error: "subject обязателен (строка)" };
  if (typeof o.grade !== "number" || !Number.isInteger(o.grade)) return { ok: false, error: "grade обязателен (целое число)" };
  if (typeof o.section !== "string" || !o.section.trim()) return { ok: false, error: "section обязателен (строка)" };
  if (typeof o.topic_name !== "string" || !o.topic_name.trim()) return { ok: false, error: "topic_name обязателен (строка)" };
  if (typeof o.sort_order !== "number") return { ok: false, error: "sort_order обязателен (число)" };
  if (!Array.isArray(o.goals)) return { ok: false, error: "goals должен быть массивом" };
  if (!Array.isArray(o.tasks)) return { ok: false, error: "tasks должен быть массивом" };

  for (let i = 0; i < o.goals.length; i++) {
    const g = o.goals[i] as Record<string, unknown>;
    if (typeof g?.text !== "string") return { ok: false, error: `goals[${i}].text обязателен` };
    if (typeof g?.sort_order !== "number") return { ok: false, error: `goals[${i}].sort_order обязателен` };
    if (!Array.isArray(g?.huginn_steps)) return { ok: false, error: `goals[${i}].huginn_steps должен быть массивом` };
    const steps = g.huginn_steps as unknown[];
    for (let j = 0; j < steps.length; j++) {
      const s = steps[j] as Record<string, unknown>;
      if (typeof s?.explanation !== "string") return { ok: false, error: `goals[${i}].huginn_steps[${j}].explanation обязателен` };
      if (typeof s?.check_question !== "string") return { ok: false, error: `goals[${i}].huginn_steps[${j}].check_question обязателен` };
      if (typeof s?.correct_answer !== "string") return { ok: false, error: `goals[${i}].huginn_steps[${j}].correct_answer обязателен` };
      if (typeof s?.sort_order !== "number") return { ok: false, error: `goals[${i}].huginn_steps[${j}].sort_order обязателен` };
    }
  }

  for (let i = 0; i < o.tasks.length; i++) {
    const t = o.tasks[i] as Record<string, unknown>;
    if (typeof t?.question !== "string") return { ok: false, error: `tasks[${i}].question обязателен` };
    if (typeof t?.answer !== "string") return { ok: false, error: `tasks[${i}].answer обязателен` };
    if (typeof t?.sort_order !== "number") return { ok: false, error: `tasks[${i}].sort_order обязателен` };
    if (typeof t?.difficulty !== "number") return { ok: false, error: `tasks[${i}].difficulty обязателен (1-4)` };
  }

  return { ok: true, data: o as unknown as LibraryTopicInput };
}

export async function POST(req: NextRequest) {
  // Проверка пароля
  const adminPassword = req.headers.get("x-admin-password");
  if (!process.env.ADMIN_PASSWORD) {
    return Response.json({ error: "ADMIN_PASSWORD не настроен на сервере" }, { status: 500 });
  }
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return Response.json({ error: "Неверный пароль администратора" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Невалидный JSON" }, { status: 400 });
  }

  const validation = validate(body);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }
  const input = validation.data;

  const supabase = getServiceSupabase();

  try {
    // 1. Найти или создать subject
    const { data: existingSubject } = await supabase
      .from("library_subjects")
      .select("id")
      .eq("name", input.subject)
      .eq("grade", input.grade)
      .maybeSingle();

    let subjectId: string;
    if (existingSubject) {
      subjectId = existingSubject.id;
    } else {
      const { data: newSubject, error: subjectErr } = await supabase
        .from("library_subjects")
        .insert({ name: input.subject, grade: input.grade })
        .select("id")
        .single();
      if (subjectErr || !newSubject) {
        return Response.json({ error: `Ошибка создания subject: ${subjectErr?.message}` }, { status: 500 });
      }
      subjectId = newSubject.id;
    }

    // 2. Создать topic
    const { data: topic, error: topicErr } = await supabase
      .from("library_topics")
      .insert({
        subject_id: subjectId,
        section: input.section,
        name: input.topic_name,
        sort_order: input.sort_order,
      })
      .select("id")
      .single();
    if (topicErr || !topic) {
      return Response.json({ error: `Ошибка создания topic: ${topicErr?.message}` }, { status: 500 });
    }
    const topicId = topic.id;

    // 3. Создать calibration
    const { error: calibErr } = await supabase
      .from("library_calibrations")
      .insert({
        topic_id: topicId,
        theory_text: input.theory_text ?? "",
        huginn_instructions: input.huginn_instructions ?? "",
        muninn_instructions: input.muninn_instructions ?? "",
      });
    if (calibErr) {
      // Откатываем topic
      await supabase.from("library_topics").delete().eq("id", topicId);
      return Response.json({ error: `Ошибка создания calibration: ${calibErr.message}` }, { status: 500 });
    }

    // 4. Создать goals (с возвратом id)
    const goalsToInsert = input.goals.map((g) => ({
      topic_id: topicId,
      text: g.text,
      sort_order: g.sort_order,
    }));
    const { data: insertedGoals, error: goalsErr } = await supabase
      .from("library_goals")
      .insert(goalsToInsert)
      .select("id, sort_order");
    if (goalsErr || !insertedGoals) {
      await supabase.from("library_topics").delete().eq("id", topicId);
      return Response.json({ error: `Ошибка создания goals: ${goalsErr?.message}` }, { status: 500 });
    }

    // Маппинг sort_order → goal_id (для привязки шагов)
    const goalIdBySortOrder = new Map<number, string>();
    for (const g of insertedGoals) {
      goalIdBySortOrder.set(g.sort_order, g.id);
    }

    // 5. Создать huginn_steps
    const stepsToInsert: Array<{
      topic_id: string;
      goal_id: string;
      sort_order: number;
      explanation: string;
      check_question: string;
      correct_answer: string;
      hint: string | null;
    }> = [];
    for (const g of input.goals) {
      const goalId = goalIdBySortOrder.get(g.sort_order);
      if (!goalId) continue;
      for (const s of g.huginn_steps) {
        stepsToInsert.push({
          topic_id: topicId,
          goal_id: goalId,
          sort_order: s.sort_order,
          explanation: s.explanation,
          check_question: s.check_question,
          correct_answer: s.correct_answer,
          hint: s.hint ?? null,
        });
      }
    }

    let huginnStepsCount = 0;
    if (stepsToInsert.length > 0) {
      const { error: stepsErr, count } = await supabase
        .from("library_huginn_steps")
        .insert(stepsToInsert, { count: "exact" });
      if (stepsErr) {
        await supabase.from("library_topics").delete().eq("id", topicId);
        return Response.json({ error: `Ошибка создания huginn_steps: ${stepsErr.message}` }, { status: 500 });
      }
      huginnStepsCount = count ?? stepsToInsert.length;
    }

    // 6. Создать tasks
    const tasksToInsert = input.tasks.map((t) => ({
      topic_id: topicId,
      question: t.question,
      answer: t.answer,
      steps: t.steps ?? null,
      difficulty: t.difficulty,
      sort_order: t.sort_order,
      template: t.template ?? null,
      params: t.params ?? null,
      answer_formula: t.answer_formula ?? null,
    }));

    let tasksCount = 0;
    if (tasksToInsert.length > 0) {
      const { error: tasksErr, count } = await supabase
        .from("library_tasks")
        .insert(tasksToInsert, { count: "exact" });
      if (tasksErr) {
        await supabase.from("library_topics").delete().eq("id", topicId);
        return Response.json({ error: `Ошибка создания tasks: ${tasksErr.message}` }, { status: 500 });
      }
      tasksCount = count ?? tasksToInsert.length;
    }

    const result: LibraryUploadResult = {
      topic_id: topicId,
      subject_id: subjectId,
      created: {
        goals: insertedGoals.length,
        huginn_steps: huginnStepsCount,
        tasks: tasksCount,
      },
    };
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: `Server error: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
