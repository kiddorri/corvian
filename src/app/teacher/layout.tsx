"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  GitBranch,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/teacher", label: "Обзор", icon: LayoutDashboard },
  { href: "/teacher/classes", label: "Мои классы", icon: GraduationCap },
  { href: "/teacher/calibrate", label: "Калибровка", icon: SlidersHorizontal },
  { href: "/teacher/interventions", label: "Интервенции", icon: GitBranch },
  { href: "/teacher/misconceptions", label: "Заблуждения", icon: AlertTriangle },
  { href: "/teacher/library", label: "Библиотека", icon: BookOpen },
  { href: "/teacher/insights", label: "AI-инсайты", icon: Lightbulb },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/teacher") return pathname === "/teacher";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Logo({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <div
      className={`font-mono font-bold tracking-tight ${
        size === "lg" ? "text-base" : "text-sm"
      }`}
    >
      <span aria-hidden="true">🪶 </span>
      <span className="bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
        CORVIAN
      </span>
    </div>
  );
}

function SidebarContent({
  pathname,
  onNavigate,
  onSignOut,
  signingOut,
  showActiveBorder,
}: {
  pathname: string;
  onNavigate?: () => void;
  onSignOut: () => void;
  signingOut: boolean;
  showActiveBorder: boolean;
}) {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="pb-4">
        <Logo />
      </div>
      <div className="border-b border-[rgba(139,92,246,0.08)]" />

      <nav className="mt-4 flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? `bg-[rgba(139,92,246,0.12)] font-medium text-[#8B5CF6] ${
                      showActiveBorder
                        ? "border-r-2 border-[#8B5CF6]"
                        : ""
                    }`
                  : "text-[#A1A1AA] hover:bg-[rgba(139,92,246,0.05)] hover:text-[#F4F4F5]"
              }`}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 border-t border-[rgba(139,92,246,0.08)] pt-4">
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#71717A] transition-colors hover:bg-[rgba(139,92,246,0.05)] hover:text-[#F4F4F5] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut size={16} />
          <span>{signingOut ? "Выхожу..." : "Выйти"}</span>
        </button>
      </div>
    </div>
  );
}

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[rgba(139,92,246,0.08)] bg-[#0F0D17] px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Открыть меню"
          className="-ml-2 rounded-lg p-2 text-[#A1A1AA] transition-colors hover:bg-[rgba(139,92,246,0.05)] hover:text-[#F4F4F5]"
        >
          <Menu size={20} />
        </button>
        <Logo />
        <div className="w-9" aria-hidden="true" />
      </header>

      <aside className="fixed left-0 top-0 hidden h-screen w-[220px] border-r border-[rgba(139,92,246,0.08)] bg-[#0F0D17] lg:block">
        <SidebarContent
          pathname={pathname}
          onSignOut={handleSignOut}
          signingOut={signingOut}
          showActiveBorder
        />
      </aside>

      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="animate-fade-in fixed left-0 top-0 z-50 h-full w-[260px] border-r border-[rgba(139,92,246,0.08)] bg-[#0F0D17] lg:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Закрыть меню"
              className="absolute right-3 top-3 rounded-lg p-2 text-[#A1A1AA] transition-colors hover:bg-[rgba(139,92,246,0.05)] hover:text-[#F4F4F5]"
            >
              <X size={18} />
            </button>
            <SidebarContent
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
              onSignOut={handleSignOut}
              signingOut={signingOut}
              showActiveBorder={false}
            />
          </aside>
        </>
      )}

      <main className="px-4 py-4 lg:ml-[220px] lg:px-8 lg:py-6">{children}</main>
    </div>
  );
}
