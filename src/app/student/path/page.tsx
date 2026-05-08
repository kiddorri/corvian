"use client";

import Link from "next/link";
import { useContext, useEffect, useMemo, useState } from "react";
import { Check, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StudentContext } from "../layout";

type PathTopic = {
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

type NodeStatus = "completed" | "current" | "locked";

function scoreColor(score: number): string {
  if (score >= 80) return "text-[#22C55E]";
  if (score >= 50) return "text-[#F59E0B]";
  return "text-[#EF4444]";
}

export default function LearningPath() {
  const { student } = useContext(StudentContext);
  const [topics, setTopics] = useState<PathTopic[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, ProgressRow>>(
    {},
  );
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
      setTopics((topicsRes.data ?? []) as PathTopic[]);
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

  const nodes = useMemo(() => {
    // Find the current node:
    // - first topic with status === 'in_progress', otherwise
    // - first topic without 'completed' status
    let currentIdx = topics.findIndex(
      (t) => progressMap[t.id]?.status === "in_progress",
    );
    if (currentIdx === -1) {
      currentIdx = topics.findIndex(
        (t) => progressMap[t.id]?.status !== "completed",
      );
    }

    return topics.map((topic, i) => {
      const progress = progressMap[topic.id];
      let status: NodeStatus;
      if (progress?.status === "completed") {
        status = "completed";
      } else if (i === currentIdx) {
        status = "current";
      } else if (currentIdx === -1 || i > currentIdx) {
        status = "locked";
      } else {
        status = "current";
      }
      return { topic, progress: progress ?? null, status };
    });
  }, [topics, progressMap]);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Мой путь</h1>

      {loading ? (
        <p className="mt-6 text-sm text-[#71717A]">Загружаю...</p>
      ) : topics.length === 0 ? (
        <p className="mt-8 text-center text-sm text-[#71717A]">
          Учитель пока не добавил тем
        </p>
      ) : (
        <ol className="mt-6">
          {nodes.map(({ topic, progress, status }, i) => {
            const isLast = i === nodes.length - 1;
            const lineColor =
              status === "completed"
                ? "bg-[#22C55E]"
                : status === "current"
                  ? "bg-[#52525B]"
                  : "bg-[#181525]";

            const score = progress?.score ?? null;

            return (
              <li
                key={topic.id}
                className="relative pb-8 pl-14 last:pb-0"
              >
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-[19px] top-10 bottom-0 w-[2px] ${lineColor}`}
                  />
                )}

                {status === "completed" && (
                  <div
                    aria-label="Тема завершена"
                    className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-[#22C55E]"
                  >
                    <Check size={20} className="text-white" />
                  </div>
                )}

                {status === "current" && (
                  <div
                    aria-label="Текущая тема"
                    className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#8B5CF6] bg-[#0F0D17]"
                    style={{
                      animation: "pathPulse 2s infinite",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="block h-3 w-3 rounded-full bg-[#8B5CF6]"
                    />
                  </div>
                )}

                {status === "locked" && (
                  <div
                    aria-label="Тема заблокирована"
                    className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(139,92,246,0.08)] bg-[#181525]"
                  >
                    <Lock size={16} className="text-[#52525B]" />
                  </div>
                )}

                {status === "completed" && (
                  <Link
                    href={`/student/chat/${topic.id}`}
                    className="block rounded-lg p-1 transition-colors hover:bg-[rgba(139,92,246,0.05)]"
                  >
                    <p className="font-medium text-[#F4F4F5]">{topic.name}</p>
                    <p className="text-xs text-[#A1A1AA]">{topic.section}</p>
                    {score !== null && (
                      <p
                        className={`mt-1 font-mono text-sm ${scoreColor(score)}`}
                      >
                        {score}
                      </p>
                    )}
                  </Link>
                )}

                {status === "current" && (
                  <div className="rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-4">
                    <p className="font-medium text-[#F4F4F5]">{topic.name}</p>
                    <p className="text-xs text-[#A1A1AA]">{topic.section}</p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      {progress?.status === "in_progress" && (
                        <span className="inline-flex items-center rounded-full border border-[#F59E0B40] bg-[#F59E0B26] px-[0.6rem] py-[0.2rem] text-xs font-semibold text-[#F59E0B]">
                          В процессе
                        </span>
                      )}
                      <Link
                        href={`/student/chat/${topic.id}`}
                        className="ml-auto inline-flex items-center justify-center rounded-lg bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-[1.3rem] py-[0.55rem] text-sm font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)]"
                      >
                        {progress?.status === "in_progress"
                          ? "Продолжить"
                          : "Начать"}
                      </Link>
                    </div>
                  </div>
                )}

                {status === "locked" && (
                  <div className="p-1">
                    <p className="font-medium text-[#71717A]">{topic.name}</p>
                    <p className="text-xs text-[#52525B]">{topic.section}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
