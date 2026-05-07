"use client";

import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StudentContext } from "../layout";

const LEVELS = [
  { name: "Новичок", minXP: 0 },
  { name: "Ученик", minXP: 500 },
  { name: "Знаток", minXP: 1500 },
  { name: "Мастер", minXP: 3500 },
  { name: "Легенда", minXP: 7000 },
];

function levelForXP(xp: number): string {
  let current = LEVELS[0].name;
  for (const level of LEVELS) {
    if (xp >= level.minXP) current = level.name;
  }
  return current;
}

type TopicLite = { id: string; name: string };
type ProgressRow = {
  topic_id: string;
  status: "not_started" | "in_progress" | "completed";
  score: number | null;
};

function barColor(score: number | null, status: string): string {
  if (status !== "completed" || score === null) return "bg-[#52525B]";
  if (score >= 80) return "bg-[#22C55E]";
  if (score >= 50) return "bg-[#F59E0B]";
  return "bg-[#EF4444]";
}

export default function StudentProfile() {
  const router = useRouter();
  const { student } = useContext(StudentContext);
  const [topics, setTopics] = useState<TopicLite[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
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
          .select("id, name")
          .eq("class_id", student.classes!.id)
          .eq("is_calibrated", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("student_progress")
          .select("topic_id, status, score")
          .eq("student_id", student.id),
      ]);

      if (cancelled) return;
      setTopics((topicsRes.data ?? []) as TopicLite[]);
      setProgress((progressRes.data ?? []) as ProgressRow[]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [student]);

  function signOut() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("corvian_student_id");
      localStorage.removeItem("corvian_class_code");
    }
    router.push("/join");
  }

  if (!student) {
    return <p className="text-sm text-[#71717A]">Загружаю...</p>;
  }

  const xp = student.xp ?? 0;
  const streak = student.streak_days ?? 0;
  const level = levelForXP(xp);
  const completedCount = progress.filter((p) => p.status === "completed").length;
  const totalTopics = topics.length;
  const classLabel = student.classes
    ? `${student.classes.name} · ${student.classes.subject}`
    : "";

  const progressByTopic = new Map(progress.map((p) => [p.topic_id, p]));

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">
        {student.display_name}
      </h1>
      {classLabel && (
        <p className="mt-1 text-sm text-[#A1A1AA]">{classLabel}</p>
      )}

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-4">
          <p className="font-mono text-xl text-[#8B5CF6]">⚡ {xp}</p>
          <p className="mt-1 text-xs text-[#52525B]">XP</p>
          <span className="mt-2 inline-flex items-center rounded-full border border-[#8B5CF640] bg-[#8B5CF626] px-[0.6rem] py-[0.2rem] text-xs font-semibold text-[#A78BFA]">
            {level}
          </span>
        </div>

        <div className="rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-4">
          <p className="font-mono text-xl text-[#F97316]">🔥 {streak}</p>
          <p className="mt-1 text-xs text-[#52525B]">дней подряд</p>
        </div>

        <div className="rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-4">
          <p className="font-mono text-xl text-[#F4F4F5]">
            {completedCount}
            <span className="text-[#71717A]"> / {totalTopics}</span>
          </p>
          <p className="mt-1 text-xs text-[#52525B]">завершено</p>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-[#F4F4F5]">
          Прогресс по темам
        </h2>

        {loading ? (
          <p className="mt-4 text-sm text-[#71717A]">Загружаю...</p>
        ) : topics.length === 0 ? (
          <p className="mt-4 text-sm text-[#71717A]">Начни первую тему!</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {topics.map((topic) => {
              const p = progressByTopic.get(topic.id);
              const score = p?.score ?? null;
              const status = p?.status ?? "not_started";
              const fillWidth =
                status === "completed" && score !== null
                  ? `${Math.min(100, score)}%`
                  : status === "in_progress"
                    ? "30%"
                    : "0%";
              return (
                <li
                  key={topic.id}
                  className="rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm text-[#F4F4F5]">
                      {topic.name}
                    </span>
                    {status === "completed" && score !== null && (
                      <span className="font-mono text-sm text-[#A1A1AA]">
                        {score}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#181525]">
                    <div
                      className={`h-full rounded-full ${barColor(score, status)}`}
                      style={{ width: fillWidth }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={signOut}
        className="mt-10 inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm text-[#71717A] transition-colors hover:bg-[rgba(139,92,246,0.05)] hover:text-[#F4F4F5]"
      >
        Выйти
      </button>
    </div>
  );
}
