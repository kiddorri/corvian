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
      // Проверить есть ли предыдущая Хугин-сессия с прогрессом
      const { data: prevSessions } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("topic_id", topicId)
        .eq("raven", "huginn")
        .neq("id", sessionId)
        .not("ended_at", "is", null)
        .order("ended_at", { ascending: false })
        .limit(1);

      let completedGoalIds: string[] = [];
      if (prevSessions && prevSessions.length > 0) {
        const { data: prevProgress } = await supabase
          .from("goal_step_progress")
          .select("goal_id, status")
          .eq("session_id", prevSessions[0].id)
          .eq("status", "completed");
        if (prevProgress) {
          completedGoalIds = (
            prevProgress as Array<{ goal_id: string }>
          ).map((p) => p.goal_id);
        }
      }

      await supabase.from("goal_step_progress").insert(
        goals.map((g: { id: string }) => ({
          session_id: sessionId,
          goal_id: g.id,
          status: completedGoalIds.includes(g.id) ? "completed" : "pending",
        })),
      );

      const firstPendingIndex = (
        goals as Array<{ id: string }>
      ).findIndex((g) => !completedGoalIds.includes(g.id));

      if (firstPendingIndex >= 0) {
        const firstPendingGoal = goals[firstPendingIndex] as { id: string };
        await supabase
          .from("chat_sessions")
          .update({
            current_step_type: "goal",
            current_step_id: firstPendingGoal.id,
            step_index: firstPendingIndex,
            step_status: "teaching",
          })
          .eq("id", sessionId);
      } else {
        await supabase
          .from("chat_sessions")
          .update({ step_status: "completed" })
          .eq("id", sessionId);
      }
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

  const currentIndex = sessionState.step_index ?? 0;

  if (raven === "huginn") {
    await supabase
      .from("goal_step_progress")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId)
      .eq("goal_id", sessionState.current_step_id);

    const { data: allGoals } = await supabase
      .from("learning_goals")
      .select("id")
      .eq("topic_id", topicId)
      .order("sort_order", { ascending: true });

    const nextIndex = currentIndex + 1;

    if (!allGoals || nextIndex >= allGoals.length) {
      const { data: finished } = await supabase
        .from("chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId)
        .eq("step_index", currentIndex)
        .select("id");
      if (!finished || finished.length === 0) {
        return { advanced: false, finished: false, nextStepId: null };
      }
      return { advanced: true, finished: true, nextStepId: null };
    }

    const nextGoal = allGoals[nextIndex] as { id: string };
    const { data: updated } = await supabase
      .from("chat_sessions")
      .update({
        current_step_id: nextGoal.id,
        step_index: nextIndex,
        step_status: "teaching",
      })
      .eq("id", sessionId)
      .eq("step_index", currentIndex)
      .select("id");

    if (!updated || updated.length === 0) {
      return { advanced: false, finished: false, nextStepId: null };
    }

    return { advanced: true, finished: false, nextStepId: nextGoal.id };
  } else if (raven === "muninn") {
    await supabase
      .from("task_progress")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId)
      .eq("task_id", sessionState.current_step_id);

    const { data: allTasks } = await supabase
      .from("tasks")
      .select("id")
      .eq("topic_id", topicId)
      .order("sort_order", { ascending: true });

    const nextIndex = currentIndex + 1;

    if (!allTasks || nextIndex >= allTasks.length) {
      const { data: finished } = await supabase
        .from("chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId)
        .eq("step_index", currentIndex)
        .select("id");
      if (!finished || finished.length === 0) {
        return { advanced: false, finished: false, nextStepId: null };
      }
      return { advanced: true, finished: true, nextStepId: null };
    }

    const nextTask = allTasks[nextIndex] as { id: string };
    const { data: updated } = await supabase
      .from("chat_sessions")
      .update({
        current_step_id: nextTask.id,
        step_index: nextIndex,
        step_status: "teaching",
      })
      .eq("id", sessionId)
      .eq("step_index", currentIndex)
      .select("id");

    if (!updated || updated.length === 0) {
      return { advanced: false, finished: false, nextStepId: null };
    }

    return { advanced: true, finished: false, nextStepId: nextTask.id };
  }

  return { advanced: false, finished: false, nextStepId: null };
}
