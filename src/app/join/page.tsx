"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const ALLOWED = /[A-HJ-NP-Z2-9]/;

function sanitizeCode(input: string): string {
  return input
    .toUpperCase()
    .split("")
    .filter((ch) => ALLOWED.test(ch))
    .slice(0, 3)
    .join("");
}

type ClassData = { id: string; name: string };

export default function JoinPage() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [codeSuffix, setCodeSuffix] = useState("");
  const [nickname, setNickname] = useState("");
  const [classData, setClassData] = useState<ClassData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fullCode = `KRS-${codeSuffix}`;
  const codeReady = codeSuffix.length === 3;
  const nicknameTrimmed = nickname.trim();
  const nicknameReady =
    nicknameTrimmed.length >= 2 && nicknameTrimmed.length <= 20;

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!codeReady || loading) return;
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("classes")
      .select("id, name, is_open")
      .eq("code", fullCode)
      .single();

    setLoading(false);

    if (dbError || !data) {
      setError("Класс не найден. Проверьте код у учителя.");
      return;
    }
    if (!data.is_open) {
      setError("Класс закрыт для новых учеников.");
      return;
    }

    setClassData({ id: data.id, name: data.name });
    setStep(2);
  }

  async function handleNicknameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nicknameReady || !classData || loading) return;
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("students")
      .insert({ class_id: classData.id, display_name: nicknameTrimmed })
      .select("id")
      .single();

    if (dbError || !data) {
      setLoading(false);
      setError("Не получилось войти. Попробуй ещё раз.");
      return;
    }

    localStorage.setItem("corvian_student_id", data.id);
    localStorage.setItem("corvian_class_code", fullCode);
    router.push("/student");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 py-10">
      <div className="animate-fade-in mx-auto w-full max-w-[400px]">
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
          {step === 1 ? (
            <form onSubmit={handleCodeSubmit}>
              <h1 className="text-center text-xl font-bold text-[#F4F4F5]">
                Введи код класса
              </h1>
              <p className="mt-2 text-center text-sm text-[#71717A]">
                Учитель должен был дать тебе код вида KRS-XXX
              </p>

              <div className="mt-6 flex items-stretch overflow-hidden rounded-lg border border-[rgba(139,92,246,0.08)] bg-[#09070F] focus-within:border-[rgba(139,92,246,0.25)]">
                <span className="flex items-center pl-[0.85rem] font-mono text-lg tracking-wider text-[#71717A]">
                  KRS-
                </span>
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={codeSuffix}
                  onChange={(e) => setCodeSuffix(sanitizeCode(e.target.value))}
                  placeholder="XXX"
                  maxLength={3}
                  aria-label="Код класса, три символа после KRS-"
                  className="w-full bg-transparent py-[0.65rem] pr-[0.85rem] text-center font-mono text-lg tracking-wider text-[#F4F4F5] placeholder:text-[#52525B] focus:outline-none"
                  autoFocus
                />
              </div>

              {error && (
                <p className="mt-2 text-sm text-[#EF4444]">{error}</p>
              )}

              <button
                type="submit"
                disabled={!codeReady || loading}
                className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-8 py-[0.85rem] text-base font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]"
              >
                {loading ? "Проверяю..." : "Войти в класс"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleNicknameSubmit}>
              <h1 className="text-center text-xl font-bold text-[#F4F4F5]">
                Как тебя зовут?
              </h1>
              <p className="mt-2 text-center text-sm text-[#71717A]">
                Класс:{" "}
                <span className="text-[#F4F4F5]">{classData?.name}</span>
              </p>

              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Твой никнейм"
                minLength={2}
                maxLength={20}
                aria-label="Никнейм"
                className="mt-6 w-full rounded-lg border border-[rgba(139,92,246,0.08)] bg-[#09070F] px-[0.85rem] py-[0.65rem] text-base text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[rgba(139,92,246,0.25)] focus:outline-none"
                autoFocus
              />

              {error && (
                <p className="mt-2 text-sm text-[#EF4444]">{error}</p>
              )}

              <button
                type="submit"
                disabled={!nicknameReady || loading}
                className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-8 py-[0.85rem] text-base font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]"
              >
                {loading ? "Создаю..." : "Начать учиться"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
