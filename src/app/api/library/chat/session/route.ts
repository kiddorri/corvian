import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const { library_student_id, library_topic_id } = await req.json();
    if (typeof library_student_id !== "string" || typeof library_topic_id !== "string") {
      return Response.json({ error: "library_student_id и library_topic_id обязательны" }, { status: 400 });
    }

    const supabase = getSupabase();

    // 1. Открытая сессия?
    const { data: openSession } = await supabase
      .from("library_chat_sessions")
      .select("id, raven, current_step_type, current_step_id, step_index, step_status")
      .eq("library_student_id", library_student_id)
      .eq("library_topic_id", library_topic_id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openSession) {
      return Response.json({ session: openSession, created: false });
    }

    // 2. Была ли завершённая Huginn-сессия?
    const { data: prevHuginn } = await supabase
      .from("library_chat_sessions")
      .select("id")
      .eq("library_student_id", library_student_id)
      .eq("library_topic_id", library_topic_id)
      .eq("raven", "huginn")
      .not("ended_at", "is", null)
      .limit(1)
      .maybeSingle();

    const startRaven = prevHuginn ? "muninn" : "huginn";

    const { data: newSession, error } = await supabase
      .from("library_chat_sessions")
      .insert({
        library_student_id,
        library_topic_id,
        raven: startRaven,
      })
      .select("id, raven, current_step_type, current_step_id, step_index, step_status")
      .single();

    if (error || !newSession) {
      return Response.json({ error: error?.message ?? "Не удалось создать сессию" }, { status: 500 });
    }

    return Response.json({ session: newSession, created: true });
  } catch (err) {
    return Response.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
