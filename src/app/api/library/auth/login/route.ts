import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyPassword } from "@/lib/auth/library-auth";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (typeof email !== "string" || typeof password !== "string") {
      return Response.json({ error: "Введи email и пароль" }, { status: 400 });
    }

    const supabase = getSupabase();
    const normalizedEmail = email.trim().toLowerCase();

    const { data: student } = await supabase
      .from("library_students")
      .select("id, email, display_name, password_hash")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (!student) {
      return Response.json({ error: "Неверный email или пароль" }, { status: 401 });
    }

    if (!verifyPassword(password, student.password_hash)) {
      return Response.json({ error: "Неверный email или пароль" }, { status: 401 });
    }

    await supabase
      .from("library_students")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", student.id);

    return Response.json({
      id: student.id,
      email: student.email,
      display_name: student.display_name,
    });
  } catch (err) {
    return Response.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
