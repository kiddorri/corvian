"use client";

import Link from "next/link";
import { useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StudentContext } from "../layout";

type LibraryTopic = {
  id: string;
  name: string;
  section: string;
  sort_order: number;
};

type ProgressRow = {
  topic_id: string;
  status: "not_started" | "in_progress" | "completed";
  score: number | null;
};

type FilterKey = "all" | "not_started" | "in_progress" | "completed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "not_started", label: "Не начатые" },
  { key: "in_progress", label: "В процессе" },
  { key: "completed", label: "Завершённые" },
];

function scoreColor(score: number): string {
  if (score >= 80) return "border-[#22C55E40] bg-[#22C55E26] text-[#22C55E]";
  if (score >= 50) return "border-[#F59E0B40] bg-[#F59E0B26] text-[#F59E0B]";
  return "border-[#EF444440] bg-[#EF444426] text-[#EF4444]";
}

export default function StudentLibrary() {
  const { student } = useContext(StudentContext);
  const [topics, setTopics] = useState<LibraryTopic[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, ProgressRow>>(
    {},
  );
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!student?.classes?.id) return;
    let cancelled = false;
    const supabase = createClient();
    setLoading(true);

    (async () => {
      const [topicsRes, progressRes] = await Promise.all([
        supabase
          .from("topics")
          .select("id, name, section, sort_order")
          .eq("class_id", student.classes!.id)
          .eq("is_calibrated", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("student_progress")
          .select("topic_id, status, score")
          .eq("student_id", student.id),
      ]);

      if (cancelled) return;
      setTopics((topicsRes.data ?? []) as LibraryTopic[]);
      const map: Record<string, ProgressRow> = {};
      for (const row of (progressRes.data ?? []) as ProgressRow[]) {
        map[row.topic_id] = row;
      }
      setProgressMap(map);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [student]);

  const filtered = useMemo(() => {
    if (filter === "all") return topics;
    return topics.filter((t) => {
      const status = progressMap[t.id]?.status ?? "not_started";
      return status === filter;
    });
  }, [topics, progressMap, filter]);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Библиотека</h1>

      <div className="mt-5 -mx-4 overflow-x-auto px-4">
        <div className="flex min-w-max items-center gap-2">
          {FILTERS.map(({ key, label }) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  active
                    ? "border-transparent bg-[rgba(139,92,246,0.12)] text-[#8B5CF6]"
                    : "border-[rgba(139,92,246,0.15)] bg-transparent text-[#A1A1AA] hover:text-[#F4F4F5]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-[#71717A]">Загружаю темы...</p>
      ) : topics.length === 0 ? (
        <p className="mt-8 text-center text-sm text-[#71717A]">
          Учитель пока не добавил тем
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-[#71717A]">
          В этой категории пока ничего нет
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {filtered.map((topic) => {
            const progress = progressMap[topic.id];
            const status = progress?.status ?? "not_started";
            const score = progress?.score ?? null;
            return (
              <li key={topic.id}>
                <Link
                  href={`/student/chat/${topic.id}`}
                  className="flex items-center gap-4 rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-4 transition-colors hover:border-[rgba(139,92,246,0.25)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[#F4F4F5]">
                      {topic.name}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-[#A1A1AA]">
                      {topic.section}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {status === "not_started" && (
                      <span className="inline-flex items-center rounded-full border border-[rgba(113,113,122,0.4)] bg-transparent px-[0.6rem] py-[0.2rem] text-xs font-semibold text-[#71717A]">
                        Не начата
                      </span>
                    )}
                    {status === "in_progress" && (
                      <span className="inline-flex items-center rounded-full border border-[#F59E0B40] bg-[#F59E0B26] px-[0.6rem] py-[0.2rem] text-xs font-semibold text-[#F59E0B]">
                        В процессе{score !== null ? ` · ${score}` : ""}
                      </span>
                    )}
                    {status === "completed" && score !== null && (
                      <span
                        className={`inline-flex items-center rounded-full border px-[0.6rem] py-[0.2rem] text-xs font-semibold ${scoreColor(
                          score,
                        )}`}
                      >
                        Завершено · {score}
                      </span>
                    )}
                    {status === "completed" && score === null && (
                      <span className="inline-flex items-center rounded-full border border-[#22C55E40] bg-[#22C55E26] px-[0.6rem] py-[0.2rem] text-xs font-semibold text-[#22C55E]">
                        Завершено
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
