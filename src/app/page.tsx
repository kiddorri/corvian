import Link from "next/link";

export default function Home() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[400px] w-[400px] -translate-x-1/2 -translate-y-[60%]"
        style={{
          background:
            "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="animate-fade-in mx-auto w-full max-w-md text-center">
        <div className="font-mono text-2xl font-bold tracking-tight">
          <span aria-hidden="true">🪶 </span>
          <span className="bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
            CORVIAN
          </span>
        </div>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-[#F4F4F5] md:text-4xl">
          Два ворона. Один результат.
        </h1>

        <p className="mt-3 text-base text-[#A1A1AA]">
          AI-тьютор для учеников НИШ, КТЛ, РФМШ
        </p>

        <div className="mt-10 flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-center">
          <Link
            href="/join"
            className="inline-flex items-center justify-center rounded-xl border border-[rgba(139,92,246,0.25)] bg-transparent px-8 py-[0.85rem] text-base font-medium text-[#F4F4F5] transition-all hover:border-[rgba(139,92,246,0.4)] hover:bg-[rgba(139,92,246,0.05)] md:min-w-[200px]"
          >
            Я ученик
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-8 py-[0.85rem] text-base font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] md:min-w-[200px]"
          >
            Я учитель
          </Link>
        </div>

        <p className="mt-4 text-sm text-[#71717A]">
          Уже есть аккаунт учителя?{" "}
          <Link
            href="/login"
            className="text-[#A1A1AA] transition-colors hover:text-[#F4F4F5]"
          >
            Войти
          </Link>
        </p>
      </div>
    </main>
  );
}
