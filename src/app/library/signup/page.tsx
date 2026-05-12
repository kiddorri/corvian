"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setLibraryStudent } from "@/lib/auth/library-session";

export default function LibrarySignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/library/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, display_name: displayName, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка регистрации");
        return;
      }
      setLibraryStudent({
        id: data.id,
        email: data.email,
        display_name: data.display_name,
      });
      router.push("/library");
    } catch (err) {
      setError(`Сетевая ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F4F4F5] flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-[rgba(139,92,246,0.15)] bg-[#18181B] p-8 shadow-2xl"
      >
        <h1 className="text-2xl font-bold mb-2">📚 Регистрация в библиотеке</h1>
        <p className="text-sm text-[#71717A] mb-6">
          Создай аккаунт чтобы заниматься с Хугином и Мунином
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[#A1A1AA] mb-1.5">Имя</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Как тебя зовут"
              required
              minLength={2}
              className="w-full rounded-lg border border-[rgba(139,92,246,0.2)] bg-[#09090B] px-4 py-3 text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[#8B5CF6] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-[#A1A1AA] mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full rounded-lg border border-[rgba(139,92,246,0.2)] bg-[#09090B] px-4 py-3 text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[#8B5CF6] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-[#A1A1AA] mb-1.5">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              required
              minLength={6}
              className="w-full rounded-lg border border-[rgba(139,92,246,0.2)] bg-[#09090B] px-4 py-3 text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[#8B5CF6] focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-[#8B5CF6] px-4 py-3 font-medium text-white transition hover:bg-[#7C3AED] disabled:opacity-50"
        >
          {loading ? "Создаём аккаунт..." : "Создать аккаунт"}
        </button>

        <div className="mt-4 text-center text-sm text-[#71717A]">
          Уже есть аккаунт?{" "}
          <Link href="/library/login" className="text-[#8B5CF6] hover:underline">
            Войти
          </Link>
        </div>
      </form>
    </div>
  );
}
