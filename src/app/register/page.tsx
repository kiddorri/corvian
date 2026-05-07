"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SCHOOL_OPTIONS = ["НИШ", "КТЛ", "РФМШ", "Другая"] as const;
type School = (typeof SCHOOL_OPTIONS)[number] | "";

const inputClass =
  "w-full rounded-lg border border-[rgba(139,92,246,0.08)] bg-[#09070F] px-[0.85rem] py-[0.65rem] text-base text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[rgba(139,92,246,0.25)] focus:outline-none";
const labelClass = "mb-1 block text-sm text-[#A1A1AA]";

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState<School>("");
  const [customSchool, setCustomSchool] = useState("");
  const [subject, setSubject] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (fullName.trim().length < 3) return "Введите ФИО (минимум 3 символа).";
    if (!school) return "Выберите школу.";
    if (school === "Другая" && customSchool.trim().length === 0)
      return "Укажите название школы.";
    if (subject.trim().length === 0) return "Укажите предмет.";
    if (!email.includes("@")) return "Введите корректный email.";
    if (password.length < 6) return "Пароль должен быть не короче 6 символов.";
    if (inviteCode.trim().length === 0) return "Введите код приглашения.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (inviteCode.trim().toUpperCase() !== "PROJECTCORVINUS") {
      setError("Неверный код приглашения. Обратитесь к администратору.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (authError || !authData.user) {
      setLoading(false);
      setError(
        authError?.message ??
          "Не получилось создать аккаунт. Попробуйте ещё раз.",
      );
      return;
    }

    const { error: teacherError } = await supabase.from("teachers").insert({
      user_id: authData.user.id,
      full_name: fullName.trim(),
      school: school === "Другая" ? customSchool.trim() : school,
      subject: subject.trim(),
    });

    if (teacherError) {
      setLoading(false);
      setError("Аккаунт создан, но не удалось сохранить профиль учителя.");
      return;
    }

    router.push("/teacher");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 py-10">
      <div className="animate-fade-in mx-auto w-full max-w-[440px]">
        <Link
          href="/"
          className="inline-block text-sm text-[#A1A1AA] transition-colors hover:text-[#F4F4F5]"
        >
          ← Назад
        </Link>

        <div className="mt-6 text-center font-mono text-lg font-bold tracking-tight">
          <span aria-hidden="true">🪶 </span>
          <span className="bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
            CORVIAN
          </span>
        </div>

        <div className="mt-6 rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-6">
          <h1 className="text-center text-xl font-bold text-[#F4F4F5]">
            Регистрация учителя
          </h1>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor="fullName" className={labelClass}>
                ФИО
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Иванова Айгуль Серикбаевна"
                autoComplete="name"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="school" className={labelClass}>
                Школа
              </label>
              <select
                id="school"
                value={school}
                onChange={(e) => setSchool(e.target.value as School)}
                className={`${inputClass} appearance-none bg-[length:16px] bg-[right_0.85rem_center] bg-no-repeat pr-10`}
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23A1A1AA' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
                }}
              >
                <option value="" disabled>
                  Выберите школу
                </option>
                {SCHOOL_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {school === "Другая" && (
              <div>
                <label htmlFor="customSchool" className={labelClass}>
                  Название школы
                </label>
                <input
                  id="customSchool"
                  type="text"
                  value={customSchool}
                  onChange={(e) => setCustomSchool(e.target.value)}
                  placeholder="Например, Школа №1"
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label htmlFor="subject" className={labelClass}>
                Предмет
              </label>
              <input
                id="subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Математика"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@school.kz"
                autoComplete="email"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="password" className={labelClass}>
                Пароль
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                autoComplete="new-password"
                minLength={6}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="inviteCode" className={labelClass}>
                Код приглашения
              </label>
              <input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Введите код приглашения"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-8 py-[0.85rem] text-base font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]"
            >
              {loading ? "Регистрация..." : "Зарегистрироваться"}
            </button>

            {error && <p className="text-sm text-[#EF4444]">{error}</p>}
          </form>
        </div>
      </div>
    </main>
  );
}
