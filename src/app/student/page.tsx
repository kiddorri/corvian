"use client";

import Link from "next/link";
import { useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StudentContext } from "./layout";

type LastProgress = {
  topic_id: string;
  status: string;
  score: number | null;
  topics: { id: string; name: string; section: string } | null;
};

const primaryFullBtn =
  "inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-8 py-[0.85rem] text-base font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)]";
const secondaryBtn =
  "inline-flex flex-1 items-center justify-center rounded-xl border border-[rgba(139,92,246,0.25)] bg-transparent px-4 py-[0.85rem] text-sm font-medium text-[#F4F4F5] transition-all hover:border-[rgba(139,92,246,0.4)] hover:bg-[rgba(139,92,246,0.05)]";

export default function StudentHome() {
  const { student } = useContext(StudentContext);
  const [last, setLast] = useState<LastProgress | null>(null);
  const [loadingLast, setLoadingLast] = useState(true);

  useEffect(() => {
    if (!student) return;
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      setLoadingLast(true);
      const { data } = await supabase
        .from("student_progress")
        .select("topic_id, status, score, topics(id, name, section)")
        .eq("student_id", student.id)
        .eq("status", "in_progress")
        .order("last_session_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      setLast((data ?? null) as LastProgress | null);
      setLoadingLast(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [student]);

  const continueWidth =
    last && last.score !== null ? `${Math.min(100, last.score)}%` : "30%";

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-6">
        <span className="text-xs uppercase tracking-wider text-[#71717A]">
          Продолжить
        </span>

        {loadingLast ? (
          <p className="mt-3 text-sm text-[#71717A]">Загружаю...</p>
        ) : last && last.topics ? (
          <>
            <h2 className="mt-2 text-lg font-semibold text-[#F4F4F5]">
              {last.topics.name}
            </h2>
            <p className="mt-1 text-sm text-[#A1A1AA]">{last.topics.section}</p>
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-[#181525]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#7C3AED,#A855F7)]"
                style={{ width: continueWidth }}
              />
            </div>
            <Link
              href={`/student/chat/${last.topic_id}`}
              className={`${primaryFullBtn} mt-5`}
            >
              Продолжить
            </Link>
          </>
        ) : (
          <>
            <h2 className="mt-2 text-lg font-semibold text-[#F4F4F5]">
              Начни новую тему
            </h2>
            <p className="mt-1 text-sm text-[#A1A1AA]">
              Выбери тему из библиотеки и начни обучение с Хугином.
            </p>
            <Link href="/student/library" className={`${primaryFullBtn} mt-5`}>
              Выбрать тему
            </Link>
          </>
        )}
      </div>

      <div className="rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-4">
        <p className="text-sm text-[#F4F4F5]">
          🔥 Реши 3 задачи, чтобы сохранить стрик
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#181525]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#F97316,#F59E0B)]"
              style={{ width: "0%" }}
            />
          </div>
          <span className="font-mono text-xs text-[#71717A]">0 / 3</span>
        </div>
      </div>

      <div className="flex gap-3">
        <Link href="/student/library" className={secondaryBtn}>
          Новая тема
        </Link>
        <Link href="/student/path" className={secondaryBtn}>
          Мой путь
        </Link>
      </div>
    </div>
  );
}
