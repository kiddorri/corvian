import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseLike = SupabaseClient<any, any, any>;

export type SessionState = {
  current_step_type: string | null;
  current_step_id: string | null;
  step_index: number | null;
  step_status: string | null;
};

export async function initSessionSteps(
  supabase: SupabaseLike,
  sessionId: string,
  topicId: string,
  raven: string,
) {
  if (raven === "huginn") {
    const { data: goals } = await supabase
      .from("learning_goals")
      .select("id, text, sort_order")
      .eq("topic_id", topicId)
      .order("sort_order", { ascending: true });

    if (goals && goals.length > 0) {
      await supabase.from("goal_step_progress").insert(
        goals.map((g: { id: string }) => ({
          session_id: sessionId,
          goal_id: g.id,
          status: "pending",
        })),
      );

      await supabase
        .from("chat_sessions")
        .update({
          current_step_type: "goal",
          current_step_id: (goals[0] as { id: string }).id,
          step_index: 0,
          step_status: "teaching",
        })
        .eq("id", sessionId);
    } else {
      // Нет целей — Хугин сразу "завершён", переход к Мунину
      await supabase
        .from("chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId);
    }
  } else if (raven === "muninn") {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, question, sort_order")
      .eq("topic_id", topicId)
      .order("sort_order", { ascending: true });

    if (tasks && tasks.length > 0) {
      await supabase.from("task_progress").insert(
        tasks.map((t: { id: string }) => ({
          session_id: sessionId,
          task_id: t.id,
          status: "pending",
        })),
      );

      await supabase
        .from("chat_sessions")
        .update({
          current_step_type: "task",
          current_step_id: tasks[0].id,
          step_index: 0,
          step_status: "teaching",
        })
        .eq("id", sessionId);
    }

    if (!tasks || tasks.length === 0) {
      await supabase
        .from("chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId);
    }
  }
}

// advanceStep: помечает текущий шаг как completed и переходит к следующему
// pending шагу. Используется COUNT-based detection вместо
// step_index+1 boundary check — устраняет class бага "finished:false на
// последней задаче" из-за рассинхрона step_index и реального прогресса.
//
// Идемпотентен: повторный вызов с уже-completed шагом ничего не сломает.
// Нет CAS-гейтов: финиш — это терминальное состояние, повторный апдейт
// step_status="completed" безопасен.
export async function advanceStep(
  supabase: SupabaseLike,
  sessionId: string,
  topicId: string,
  raven: string,
  sessionState: SessionState | null,
): Promise<{
  advanced: boolean;
  finished: boolean;
  nextStepId: string | null;
}> {
  if (!sessionState?.current_step_id) {
    return { advanced: false, finished: false, nextStepId: null };
  }

  if (raven === "huginn") {
    // 1. Помечаем текущую цель completed (идемпотентно).
    await supabase
      .from("goal_step_progress")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId)
      .eq("goal_id", sessionState.current_step_id);

    // 2. Загружаем прогресс + полный список целей по порядку.
    const [progressRes, goalsRes] = await Promise.all([
      supabase
        .from("goal_step_progress")
        .select("goal_id, status")
        .eq("session_id", sessionId),
      supabase
        .from("learning_goals")
        .select("id")
        .eq("topic_id", topicId)
        .order("sort_order", { ascending: true }),
    ]);

    const progress = (progressRes.data ?? []) as Array<{
      goal_id: string;
      status: string;
    }>;
    const allGoals = (goalsRes.data ?? []) as Array<{ id: string }>;

    const completedSet = new Set(
      progress.filter((p) => p.status === "completed").map((p) => p.goal_id),
    );
    const total = allGoals.length;
    const completedCount = completedSet.size;

    console.log(
      "[ADVANCE-INTERNAL] raven:huginn currentStepId:",
      sessionState.current_step_id,
      "total:",
      total,
      "completed:",
      completedCount,
      "willFinish:",
      total === 0 || completedCount >= total,
    );

    if (total === 0 || completedCount >= total) {
      await supabase
        .from("chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId);
      return { advanced: true, finished: true, nextStepId: null };
    }

    // Найти первую цель в sort-order которая ещё НЕ completed.
    let nextGoalId: string | null = null;
    let nextIndex = -1;
    for (let i = 0; i < allGoals.length; i++) {
      if (!completedSet.has(allGoals[i].id)) {
        nextGoalId = allGoals[i].id;
        nextIndex = i;
        break;
      }
    }

    if (nextGoalId === null) {
      // Защитный fallback: количество completed < total, но pending не нашли.
      // Считаем сессию завершённой.
      await supabase
        .from("chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId);
      return { advanced: true, finished: true, nextStepId: null };
    }

    await supabase
      .from("chat_sessions")
      .update({
        current_step_id: nextGoalId,
        step_index: nextIndex,
        step_status: "teaching",
      })
      .eq("id", sessionId);

    return { advanced: true, finished: false, nextStepId: nextGoalId };
  } else if (raven === "muninn") {
    // 1. Помечаем текущую задачу completed (идемпотентно).
    await supabase
      .from("task_progress")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId)
      .eq("task_id", sessionState.current_step_id);

    // 2. Загружаем прогресс + полный список задач по порядку.
    const [progressRes, tasksRes] = await Promise.all([
      supabase
        .from("task_progress")
        .select("task_id, status")
        .eq("session_id", sessionId),
      supabase
        .from("tasks")
        .select("id")
        .eq("topic_id", topicId)
        .order("sort_order", { ascending: true }),
    ]);

    const progress = (progressRes.data ?? []) as Array<{
      task_id: string;
      status: string;
    }>;
    const allTasks = (tasksRes.data ?? []) as Array<{ id: string }>;

    const completedSet = new Set(
      progress.filter((p) => p.status === "completed").map((p) => p.task_id),
    );
    const total = allTasks.length;
    const completedCount = completedSet.size;

    console.log(
      "[ADVANCE-INTERNAL] raven:muninn currentStepId:",
      sessionState.current_step_id,
      "total:",
      total,
      "completed:",
      completedCount,
      "willFinish:",
      total === 0 || completedCount >= total,
    );

    if (total === 0 || completedCount >= total) {
      await supabase
        .from("chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId);
      return { advanced: true, finished: true, nextStepId: null };
    }

    let nextTaskId: string | null = null;
    let nextIndex = -1;
    for (let i = 0; i < allTasks.length; i++) {
      if (!completedSet.has(allTasks[i].id)) {
        nextTaskId = allTasks[i].id;
        nextIndex = i;
        break;
      }
    }

    if (nextTaskId === null) {
      await supabase
        .from("chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId);
      return { advanced: true, finished: true, nextStepId: null };
    }

    await supabase
      .from("chat_sessions")
      .update({
        current_step_id: nextTaskId,
        step_index: nextIndex,
        step_status: "teaching",
      })
      .eq("id", sessionId);

    return { advanced: true, finished: false, nextStepId: nextTaskId };
  }

  return { advanced: false, finished: false, nextStepId: null };
}
