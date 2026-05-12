"use client";

import { useState, useEffect } from "react";

interface UploadResult {
  topic_id: string;
  subject_id: string;
  created: {
    goals: number;
    huginn_steps: number;
    tasks: number;
  };
}

const EXAMPLE_JSON = `{
  "subject": "Математика",
  "grade": 10,
  "section": "Комбинаторика",
  "topic_name": "Перестановки, размещения, сочетания",
  "sort_order": 1,
  "theory_text": "Комбинаторика изучает способы подсчёта вариантов выбора...",
  "huginn_instructions": "",
  "muninn_instructions": "",
  "goals": [
    {
      "text": "Ученик понимает, что такое факториал",
      "sort_order": 1,
      "huginn_steps": [
        {
          "sort_order": 1,
          "explanation": "Представь, что у тебя 3 разные книги: красная, синяя и зелёная. Сколькими способами их можно расставить на полке?",
          "check_question": "Сколько способов? Умножь 3 × 2 × 1",
          "correct_answer": "6",
          "hint": "3 × 2 × 1 = ?"
        }
      ]
    }
  ],
  "tasks": [
    {
      "sort_order": 1,
      "difficulty": 1,
      "question": "Вычисли 5!",
      "answer": "120",
      "steps": "5 × 4 × 3 × 2 × 1 = 120",
      "template": "Вычисли \${n}!",
      "params": { "n": [4, 5, 6, 7] },
      "answer_formula": "factorial(n)"
    }
  ]
}`;

export default function AdminLibraryPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("corvian_admin_password");
    if (stored) {
      setPassword(stored);
      setAuthenticated(true);
    }
  }, []);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    sessionStorage.setItem("corvian_admin_password", password);
    setAuthenticated(true);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("corvian_admin_password");
    setPassword("");
    setAuthenticated(false);
    setJsonInput("");
    setResult(null);
    setError(null);
  };

  const handleUpload = async () => {
    setError(null);
    setResult(null);

    if (!jsonInput.trim()) {
      setError("JSON не может быть пустым");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonInput);
    } catch (err) {
      setError(`Невалидный JSON: ${err instanceof Error ? err.message : "ошибка парсинга"}`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/library/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
        },
        body: JSON.stringify(parsed),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setError("Неверный пароль. Выйди и введи заново.");
          sessionStorage.removeItem("corvian_admin_password");
          setAuthenticated(false);
        } else {
          setError(data.error || `Ошибка ${res.status}`);
        }
        return;
      }

      setResult(data as UploadResult);
      setJsonInput("");
    } catch (err) {
      setError(`Сетевая ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadExample = () => {
    setJsonInput(EXAMPLE_JSON);
    setError(null);
    setResult(null);
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#09090B] text-[#F4F4F5] flex items-center justify-center p-6">
        <form
          onSubmit={handleAuth}
          className="w-full max-w-md rounded-2xl border border-[rgba(139,92,246,0.15)] bg-[#18181B] p-8 shadow-2xl"
        >
          <h1 className="text-2xl font-bold mb-2">🔐 Админ-доступ</h1>
          <p className="text-sm text-[#71717A] mb-6">
            Введите пароль для загрузки тем в библиотеку.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="ADMIN_PASSWORD"
            autoFocus
            className="w-full rounded-lg border border-[rgba(139,92,246,0.2)] bg-[#09090B] px-4 py-3 text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[#8B5CF6] focus:outline-none"
          />
          <button
            type="submit"
            className="mt-4 w-full rounded-lg bg-[#8B5CF6] px-4 py-3 font-medium text-white transition hover:bg-[#7C3AED]"
          >
            Войти
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F4F4F5] p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">📚 Библиотека — загрузка темы</h1>
            <p className="mt-1 text-sm text-[#71717A]">
              Вставь JSON структуру темы и нажми «Загрузить»
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-[rgba(139,92,246,0.2)] px-4 py-2 text-sm text-[#A1A1AA] transition hover:bg-[rgba(139,92,246,0.05)]"
          >
            Выйти
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          <button
            onClick={handleLoadExample}
            className="rounded-lg border border-[rgba(139,92,246,0.2)] bg-[#18181B] px-3 py-1.5 text-xs text-[#A1A1AA] transition hover:bg-[rgba(139,92,246,0.05)]"
          >
            📋 Загрузить пример
          </button>
          <button
            onClick={() => {
              setJsonInput("");
              setError(null);
              setResult(null);
            }}
            className="rounded-lg border border-[rgba(139,92,246,0.2)] bg-[#18181B] px-3 py-1.5 text-xs text-[#A1A1AA] transition hover:bg-[rgba(139,92,246,0.05)]"
          >
            🗑️ Очистить
          </button>
        </div>

        <textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          placeholder="Вставь JSON структуру темы..."
          spellCheck={false}
          className="h-[500px] w-full rounded-xl border border-[rgba(139,92,246,0.15)] bg-[#18181B] p-4 font-mono text-sm text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[#8B5CF6] focus:outline-none"
        />

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleUpload}
            disabled={loading || !jsonInput.trim()}
            className="rounded-lg bg-[#8B5CF6] px-6 py-3 font-medium text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Загружаем..." : "🚀 Загрузить в библиотеку"}
          </button>
          <span className="text-xs text-[#71717A]">
            Длина JSON: {jsonInput.length} символов
          </span>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <div className="font-medium text-red-400">❌ Ошибка</div>
            <div className="mt-1 text-sm text-red-300">{error}</div>
          </div>
        )}

        {result && (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="font-medium text-emerald-400">✅ Тема загружена</div>
            <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-[#71717A]">Цели</div>
                <div className="text-lg font-bold text-[#F4F4F5]">
                  {result.created.goals}
                </div>
              </div>
              <div>
                <div className="text-[#71717A]">Шаги Хугина</div>
                <div className="text-lg font-bold text-[#F4F4F5]">
                  {result.created.huginn_steps}
                </div>
              </div>
              <div>
                <div className="text-[#71717A]">Задачи</div>
                <div className="text-lg font-bold text-[#F4F4F5]">
                  {result.created.tasks}
                </div>
              </div>
            </div>
            <div className="mt-3 text-xs text-[#71717A]">
              topic_id: <code className="text-[#A1A1AA]">{result.topic_id}</code>
            </div>
          </div>
        )}

        <div className="mt-8 rounded-xl border border-[rgba(139,92,246,0.1)] bg-[#18181B] p-5 text-sm text-[#A1A1AA]">
          <div className="mb-2 font-medium text-[#F4F4F5]">💡 Подсказки</div>
          <ul className="space-y-1.5">
            <li>• Subject + grade ищется или создаётся автоматически (UNIQUE по name+grade)</li>
            <li>• Каждая загрузка создаёт НОВУЮ тему — не пытайся «обновить» существующую через эту форму</li>
            <li>• difficulty задач: 1 (легко) → 4 (сложно)</li>
            <li>• Шаблоны (template + params + answer_formula) опциональны</li>
            <li>• Пароль хранится в sessionStorage — закроешь вкладку, введёшь заново</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
