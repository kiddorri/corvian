import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hashPassword } from "@/lib/auth/library-auth";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const { email, display_name, password } = await req.json();

    if (typeof email !== "string" || !email.includes("@") || email.length < 5) {
      return Response.json({ error: "Невалидный email" }, { status: 400 });
    }
    if (typeof display_name !== "string" || display_name.trim().length < 2) {
      return Response.json({ error: "Имя должно быть от 2 символов" }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 6) {
      return Response.json({ error: "Пароль должен быть от 6 символов" }, { status: 400 });
    }

    const supabase = getSupabase();
    const normalizedEmail = email.trim().toLowerCase();

    const { data: existing } = await supabase
      .from("library_students")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existing) {
      return Response.json({ error: "Пользователь с таким email уже существует" }, { status: 409 });
    }

    const password_hash = hashPassword(password);

    const { data: student, error } = await supabase
      .from("library_students")
      .insert({
        email: normalizedEmail,
        display_name: display_name.trim(),
        password_hash,
        last_login_at: new Date().toISOString(),
      })
      .select("id, email, display_name")
      .single();

    if (error || !student) {
      return Response.json({ error: `Ошибка создания: ${error?.message}` }, { status: 500 });
    }

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
