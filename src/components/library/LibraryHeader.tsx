"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getLibraryStudent,
  clearLibraryStudent,
  type LibraryStudent,
} from "@/lib/auth/library-session";

export function LibraryHeader() {
  const [student, setStudent] = useState<LibraryStudent | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setStudent(getLibraryStudent());
  }, []);

  const handleLogout = () => {
    clearLibraryStudent();
    setStudent(null);
  };

  return (
    <header className="border-b border-[rgba(139,92,246,0.1)] bg-[#09090B]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/library" className="flex items-center gap-2 text-lg font-bold text-[#F4F4F5]">
          <span>📚</span>
          <span>Corvian Library</span>
        </Link>
        <div className="flex items-center gap-3">
          {mounted && student ? (
            <>
              <span className="text-sm text-[#A1A1AA]">
                Привет, <span className="text-[#F4F4F5]">{student.display_name}</span>
              </span>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-[rgba(139,92,246,0.2)] px-3 py-1.5 text-sm text-[#A1A1AA] transition hover:bg-[rgba(139,92,246,0.05)]"
              >
                Выйти
              </button>
            </>
          ) : mounted ? (
            <>
              <Link
                href="/library/login"
                className="text-sm text-[#A1A1AA] hover:text-[#F4F4F5]"
              >
                Войти
              </Link>
              <Link
                href="/library/signup"
                className="rounded-lg bg-[#8B5CF6] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#7C3AED]"
              >
                Регистрация
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
