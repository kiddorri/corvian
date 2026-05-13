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
    const { sessionId } = await req.json();
    if (!sessionId) {
      return Response.json({ error: "sessionId обязателен" }, { status: 400 });
    }
    const supabase = getSupabase();
    await supabase
      .from("library_chat_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
