import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

async function generateSummary(messages: { role: string; content: string }[]): Promise<string> {
  if (messages.length === 0) return "";
  const conversation = messages
    .slice(-20)
    .map((m) => `${m.role === "user" ? "Ученик" : "Хугин"}: ${m.content}`)
    .join("\n");

  try {
    const resp = await anthropic.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: "Ты суммируешь что ученик понял на уроке с Хугином. Пиши кратко: 3-5 предложений о ключевых идеях которые ученик освоил. Это резюме передаётся Мунину чтобы он знал что ученик знает.",
        messages: [{ role: "user", content: conversation }],
      },
      { timeout: 15000 },
    );
    const text = resp.content[0].type === "text" ? resp.content[0].text : "";
    return text.trim();
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, library_student_id, library_topic_id } = await req.json();
    if (!sessionId || !library_student_id || !library_topic_id) {
      return Response.json({ error: "Не хватает полей" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data: messages } = await supabase
      .from("library_chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true });

    const summary = await generateSummary(
      (messages ?? []) as { role: string; content: string }[],
    );

    await supabase
      .from("library_chat_sessions")
      .update({ ended_at: new Date().toISOString(), summary })
      .eq("id", sessionId);

    const { data: newSession, error } = await supabase
      .from("library_chat_sessions")
      .insert({
        library_student_id,
        library_topic_id,
        raven: "muninn",
      })
      .select("id, raven, current_step_type, current_step_id, step_index, step_status")
      .single();

    if (error || !newSession) {
      return Response.json({ error: error?.message ?? "Не удалось создать Muninn-сессию" }, { status: 500 });
    }

    return Response.json({ session: newSession });
  } catch (err) {
    return Response.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
