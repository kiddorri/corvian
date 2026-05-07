"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  SlidersHorizontal,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ClassRow = { id: string; name: string };
type TopicRow = {
  id: string;
  name: string;
  section: string;
  is_calibrated: boolean;
  sort_order: number;
  created_at: string;
};
type Stats = {
  studentCount: number;
  totalTopics: number;
  calibratedTopics: number;
  avgScore: number | null;
};

const inputClass =
  "w-full rounded-lg border border-[rgba(139,92,246,0.08)] bg-[#09070F] px-[0.85rem] py-[0.65rem] text-base text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[rgba(139,92,246,0.25)] focus:outline-none";
const labelClass = "mb-1 block text-sm text-[#A1A1AA]";
const cardClass =
  "rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-5";
const selectChevronStyle: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23A1A1AA' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
};

function StatTile({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className={cardClass}>
      <div className="flex items-center gap-2">
        <Icon size={20} className="text-[#71717A]" />
        <span className="text-xs uppercase tracking-wider text-[#71717A]">
          {label}
        </span>
      </div>
      <p className="mt-3 font-mono text-2xl font-bold text-[#F4F4F5]">
        {value}
      </p>
      <p className="mt-1 text-xs text-[#52525B]">{caption}</p>
    </div>
  );
}

export default function TeacherDashboardPage() {
  const router = useRouter();

  const [teacherName, setTeacherName] = useState<string>("");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [loadingClassData, setLoadingClassData] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/register");
        return;
      }

      const { data: teacher, error: teacherError } = await supabase
        .from("teachers")
        .select("id, full_name")
        .eq("user_id", user.id)
        .single();
      if (teacherError || !teacher) {
        router.push("/register");
        return;
      }
      if (cancelled) return;
      setTeacherName(teacher.full_name);

      const { data, error } = await supabase
        .from("classes")
        .select("id, name")
        .eq("teacher_id", teacher.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        setBootstrapError("Не удалось загрузить классы.");
      } else {
        const list = (data ?? []) as ClassRow[];
        setClasses(list);
        if (list.length >= 1) {
          setSelectedClassId(list[0].id);
        }
      }
      setLoadingBootstrap(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedClassId) {
      setStats(null);
      setTopics([]);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    setLoadingClassData(true);

    (async () => {
      const [studentsRes, topicsRes] = await Promise.all([
        supabase
          .from("students")
          .select("*", { count: "exact", head: true })
          .eq("class_id", selectedClassId),
        supabase
          .from("topics")
          .select("id, name, section, is_calibrated, sort_order, created_at")
          .eq("class_id", selectedClassId)
          .order("sort_order", { ascending: true }),
      ]);

      if (cancelled) return;
      const topicRows = (topicsRes.data ?? []) as TopicRow[];
      setTopics(topicRows);

      const totalTopics = topicRows.length;
      const calibratedTopics = topicRows.filter((t) => t.is_calibrated).length;
      const topicIds = topicRows.map((t) => t.id);

      let avgScore: number | null = null;
      if (topicIds.length > 0) {
        const { data: progress } = await supabase
          .from("student_progress")
          .select("score")
          .in("topic_id", topicIds)
          .not("score", "is", null);
        if (cancelled) return;
        if (progress && progress.length > 0) {
          const sum = progress.reduce(
            (acc, row) => acc + (row.score ?? 0),
            0,
          );
          avgScore = Math.round(sum / progress.length);
        }
      }

      setStats({
        studentCount: studentsRes.count ?? 0,
        totalTopics,
        calibratedTopics,
        avgScore,
      });
      setLoadingClassData(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedClassId]);

  const recentTopics = topics.slice(0, 5);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Добро пожаловать!</h1>
      {teacherName && (
        <p className="mt-1 text-sm text-[#A1A1AA]">{teacherName}</p>
      )}

      {bootstrapError && (
        <p className="mt-4 text-sm text-[#EF4444]">{bootstrapError}</p>
      )}

      {loadingBootstrap ? (
        <p className="mt-6 text-sm text-[#71717A]">Загружаю...</p>
      ) : classes.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-[rgba(139,92,246,0.15)] bg-[#0F0D17] p-8 text-center">
          <p className="text-sm text-[#A1A1AA]">У вас пока нет классов.</p>
          <Link
            href="/teacher/classes"
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-8 py-[0.85rem] text-base font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)]"
          >
            Создать класс
          </Link>
        </div>
      ) : (
        <>
          {classes.length > 1 && (
            <div className="mt-6 max-w-md">
              <label htmlFor="class-select" className={labelClass}>
                Класс
              </label>
              <select
                id="class-select"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className={`${inputClass} appearance-none bg-[length:16px] bg-[right_0.85rem_center] bg-no-repeat pr-10`}
                style={selectChevronStyle}
              >
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              icon={Users}
              label="Учеников"
              value={
                loadingClassData || !stats ? "—" : String(stats.studentCount)
              }
              caption="в классе"
            />
            <StatTile
              icon={BookOpen}
              label="Тем"
              value={
                loadingClassData || !stats ? "—" : String(stats.totalTopics)
              }
              caption="создано"
            />
            <StatTile
              icon={SlidersHorizontal}
              label="Откалибровано"
              value={
                loadingClassData || !stats
                  ? "—"
                  : String(stats.calibratedTopics)
              }
              caption={stats ? `из ${stats.totalTopics} тем` : "из тем"}
            />
            <StatTile
              icon={TrendingUp}
              label="Средний балл"
              value={
                loadingClassData || !stats || stats.avgScore === null
                  ? "—"
                  : String(stats.avgScore)
              }
              caption="по всем темам"
            />
          </div>

          <section className="mt-10">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-[#F4F4F5]">
                Темы класса
              </h2>
              {topics.length > 0 && (
                <Link
                  href="/teacher/calibrate"
                  className="text-sm text-[#818CF8] transition-colors hover:underline"
                >
                  Все темы →
                </Link>
              )}
            </div>

            {loadingClassData ? (
              <p className="mt-4 text-sm text-[#71717A]">Загружаю темы...</p>
            ) : recentTopics.length === 0 ? (
              <p className="mt-4 text-sm text-[#71717A]">
                Создайте первую тему в разделе{" "}
                <Link
                  href="/teacher/calibrate"
                  className="text-[#818CF8] hover:underline"
                >
                  Калибровка
                </Link>
                .
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {recentTopics.map((topic) => (
                  <li
                    key={topic.id}
                    className="flex items-center gap-4 rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-4 transition-colors hover:border-[rgba(139,92,246,0.15)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[#F4F4F5]">
                        {topic.name}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-[#A1A1AA]">
                        {topic.section}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-[0.6rem] py-[0.2rem] text-xs font-semibold ${
                          topic.is_calibrated
                            ? "border-[#22C55E40] bg-[#22C55E26] text-[#22C55E]"
                            : "border-[rgba(113,113,122,0.4)] bg-transparent text-[#71717A]"
                        }`}
                      >
                        {topic.is_calibrated ? "Откалибровано" : "Не настроено"}
                      </span>
                      <Link
                        href={`/teacher/calibrate/${topic.id}`}
                        className="inline-flex items-center justify-center rounded-lg border border-[rgba(139,92,246,0.25)] bg-transparent px-[1rem] py-[0.4rem] text-sm font-medium text-[#F4F4F5] transition-all hover:border-[rgba(139,92,246,0.4)] hover:bg-[rgba(139,92,246,0.05)]"
                      >
                        Настроить
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
