"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-lg border border-[rgba(139,92,246,0.08)] bg-[#09070F] px-[0.85rem] py-[0.65rem] text-base text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[rgba(139,92,246,0.25)] focus:outline-none";
const labelClass = "mb-1 block text-sm text-[#A1A1AA]";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (!email.includes("@")) {
      setError("Введите корректный email.");
      return;
    }
    if (password.length === 0) {
      setError("Введите пароль.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (authError) {
      setError("Неверный email или пароль");
      return;
    }
    router.push("/teacher");
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
          <h1 className="text-center text-xl font-bold text-[#F4F4F5]">
            Вход для учителя
          </h1>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor="login-email" className={labelClass}>
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@school.kz"
                autoComplete="email"
                autoFocus
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="login-password" className={labelClass}>
                Пароль
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введите пароль"
                autoComplete="current-password"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-8 py-[0.85rem] text-base font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]"
            >
              {loading ? "Вхожу..." : "Войти"}
            </button>

            {error && <p className="text-sm text-[#EF4444]">{error}</p>}
          </form>

          <p className="mt-6 text-center text-sm text-[#A1A1AA]">
            Нет аккаунта?{" "}
            <Link
              href="/register"
              className="text-[#818CF8] transition-colors hover:underline"
            >
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
