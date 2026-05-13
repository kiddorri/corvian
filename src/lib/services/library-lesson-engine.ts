import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseLike = SupabaseClient<any, any, any>;

export type LibrarySessionState = {
  current_step_type: string | null;
  current_step_id: string | null;
  step_index: number | null;
  step_status: string | null;
};

export async function initLibrarySessionSteps(
  supabase: SupabaseLike,
  sessionId: string,
  topicId: string,
  raven: string,
) {
  if (raven === "huginn") {
    const { data: goals } = await supabase
      .from("library_goals")
      .select("id, sort_order")
      .eq("topic_id", topicId)
      .order("sort_order", { ascending: true });

    if (goals && goals.length > 0) {
      await supabase.from("library_goal_progress").insert(
        goals.map((g: { id: string }) => ({
          session_id: sessionId,
          goal_id: g.id,
          status: "pending",
        })),
      );
      await supabase
        .from("library_chat_sessions")
        .update({
          current_step_type: "goal",
          current_step_id: (goals[0] as { id: string }).id,
          step_index: 0,
          step_status: "teaching",
        })
        .eq("id", sessionId);
    } else {
      await supabase
        .from("library_chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId);
    }
  } else if (raven === "muninn") {
    const { data: tasks } = await supabase
      .from("library_tasks")
      .select("id, sort_order")
      .eq("topic_id", topicId)
      .order("sort_order", { ascending: true });

    if (tasks && tasks.length > 0) {
      await supabase.from("library_task_progress").insert(
        tasks.map((t: { id: string }) => ({
          session_id: sessionId,
          task_id: t.id,
          status: "pending",
        })),
      );
      await supabase
        .from("library_chat_sessions")
        .update({
          current_step_type: "task",
          current_step_id: (tasks[0] as { id: string }).id,
          step_index: 0,
          step_status: "teaching",
        })
        .eq("id", sessionId);
    } else {
      await supabase
        .from("library_chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId);
    }
  }
}

export async function advanceLibraryStep(
  supabase: SupabaseLike,
  sessionId: string,
  topicId: string,
  raven: string,
  sessionState: LibrarySessionState | null,
): Promise<{
  advanced: boolean;
  finished: boolean;
  nextStepId: string | null;
}> {
  if (!sessionState?.current_step_id) {
    return { advanced: false, finished: false, nextStepId: null };
  }

  if (raven === "huginn") {
    await supabase
      .from("library_goal_progress")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId)
      .eq("goal_id", sessionState.current_step_id);

    const [progressRes, goalsRes] = await Promise.all([
      supabase
        .from("library_goal_progress")
        .select("goal_id, status")
        .eq("session_id", sessionId),
      supabase
        .from("library_goals")
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

    if (allGoals.length === 0 || completedSet.size >= allGoals.length) {
      await supabase
        .from("library_chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId);
      return { advanced: true, finished: true, nextStepId: null };
    }

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
      await supabase
        .from("library_chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId);
      return { advanced: true, finished: true, nextStepId: null };
    }

    await supabase
      .from("library_chat_sessions")
      .update({
        current_step_id: nextGoalId,
        step_index: nextIndex,
        step_status: "teaching",
      })
      .eq("id", sessionId);

    return { advanced: true, finished: false, nextStepId: nextGoalId };
  } else if (raven === "muninn") {
    await supabase
      .from("library_task_progress")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId)
      .eq("task_id", sessionState.current_step_id);

    const [progressRes, tasksRes] = await Promise.all([
      supabase
        .from("library_task_progress")
        .select("task_id, status")
        .eq("session_id", sessionId),
      supabase
        .from("library_tasks")
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

    if (allTasks.length === 0 || completedSet.size >= allTasks.length) {
      await supabase
        .from("library_chat_sessions")
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
        .from("library_chat_sessions")
        .update({ step_status: "completed" })
        .eq("id", sessionId);
      return { advanced: true, finished: true, nextStepId: null };
    }

    await supabase
      .from("library_chat_sessions")
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
