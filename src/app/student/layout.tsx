"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpen,
  Home,
  Route,
  User,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Student } from "@/types";

type StudentContextValue = {
  student: Student | null;
  refreshStudent: () => void;
};

export const StudentContext = createContext<StudentContextValue>({
  student: null,
  refreshStudent: () => {},
});

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { href: "/student", label: "Главная", icon: Home },
  { href: "/student/path", label: "Путь", icon: Route },
  { href: "/student/library", label: "Библиотека", icon: BookOpen },
  { href: "/student/profile", label: "Профиль", icon: User },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/student") return pathname === "/student";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function StudentLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isChatPage = pathname.startsWith("/student/chat");
  const [student, setStudent] = useState<Student | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshStudent = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const studentId =
      typeof window !== "undefined"
        ? localStorage.getItem("corvian_student_id")
        : null;
    if (!studentId) {
      router.push("/join");
      return;
    }

    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("students")
        .select("*, classes(id, name, subject, grade)")
        .eq("id", studentId)
        .single();

      if (cancelled) return;
      if (!data) {
        localStorage.removeItem("corvian_student_id");
        router.push("/join");
        return;
      }
      setStudent(data as Student);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, refreshKey]);

  return (
    <StudentContext.Provider value={{ student, refreshStudent }}>
      <div className="min-h-screen pb-[calc(56px+env(safe-area-inset-bottom))] lg:pb-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[rgba(139,92,246,0.08)] bg-[#0F0D17] px-4">
          <Link
            href="/student"
            aria-label="На главную"
            className="text-lg leading-none"
          >
            🪶
          </Link>

          <nav className="hidden lg:block">
            <ul className="flex items-center gap-8">
              {NAV_ITEMS.map(({ href, label }) => {
                const active = isActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`pb-[3px] text-sm transition-colors ${
                        active
                          ? "border-b-2 border-[#8B5CF6] font-medium text-[#F4F4F5]"
                          : "text-[#A1A1AA] hover:text-[#F4F4F5]"
                      }`}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-[#F97316]">
              🔥 {student?.streak_days ?? 0}
            </span>
            <span className="font-mono text-sm text-[#8B5CF6]">
              ⚡ {student?.xp ?? 0}
            </span>
          </div>
        </header>

        <main className={`mx-auto ${isChatPage ? "max-w-none" : "max-w-3xl p-4 lg:px-6 lg:py-6"}`}>{children}</main>

        <nav
          className="fixed bottom-0 left-0 right-0 z-30 border-t border-[rgba(139,92,246,0.08)] bg-[#0F0D17] pb-[env(safe-area-inset-bottom)] lg:hidden"
          aria-label="Основная навигация"
        >
          <ul className="flex h-14 items-stretch">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href} className="flex-1">
                  <Link
                    href={href}
                    className={`flex h-full flex-col items-center justify-center gap-1 transition-colors ${
                      active ? "text-[#8B5CF6]" : "text-[#52525B]"
                    }`}
                  >
                    <Icon size={20} />
                    <span className="text-xs">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </StudentContext.Provider>
  );
}
