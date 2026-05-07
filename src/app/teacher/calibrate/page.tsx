"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ClassRow = { id: string; name: string };
type CalibrationRow = { topic_id: string };
type TopicRow = {
  id: string;
  class_id: string;
  section: string;
  name: string;
  sort_order: number;
  is_calibrated: boolean;
  calibrations: CalibrationRow[] | null;
};

const inputClass =
  "w-full rounded-lg border border-[rgba(139,92,246,0.08)] bg-[#09070F] px-[0.85rem] py-[0.65rem] text-base text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[rgba(139,92,246,0.25)] focus:outline-none";
const labelClass = "mb-1 block text-sm text-[#A1A1AA]";
const selectChevronStyle: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23A1A1AA' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
};

export default function CalibratePage() {
  const router = useRouter();

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [section, setSection] = useState("");
  const [topicName, setTopicName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (teacherError || !teacher) {
        router.push("/register");
        return;
      }
      if (cancelled) return;
      setTeacherId(teacher.id);

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
        if (list.length === 1) {
          setSelectedClassId(list[0].id);
        }
      }
      setLoadingClasses(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedClassId) {
      setTopics([]);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    setLoadingTopics(true);

    (async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("*, calibrations(topic_id)")
        .eq("class_id", selectedClassId)
        .order("sort_order", { ascending: true });

      if (cancelled) return;
      if (error) {
        setTopics([]);
      } else {
        setTopics((data ?? []) as TopicRow[]);
      }
      setLoadingTopics(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedClassId]);

  function openModal() {
    setSection("");
    setTopicName("");
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (submitting) return;
    setModalOpen(false);
  }

  async function handleAddTopic(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !selectedClassId) return;
    setFormError(null);

    if (section.trim().length === 0) {
      setFormError("Укажите раздел.");
      return;
    }
    if (topicName.trim().length === 0) {
      setFormError("Укажите название темы.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("topics")
      .insert({
        class_id: selectedClassId,
        section: section.trim(),
        name: topicName.trim(),
        sort_order: topics.length,
      })
      .select("*, calibrations(topic_id)")
      .single();
    setSubmitting(false);

    if (error || !data) {
      setFormError("Не удалось добавить тему. Попробуйте ещё раз.");
      return;
    }

    setTopics((prev) => [...prev, data as TopicRow]);
    setModalOpen(false);
  }

  function isTopicCalibrated(topic: TopicRow): boolean {
    return topic.is_calibrated && (topic.calibrations?.length ?? 0) > 0;
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Калибровка</h1>
        <p className="mt-1 text-sm text-[#A1A1AA]">
          Настройте AI-тьютора под каждую тему
        </p>
      </div>

      {bootstrapError && (
        <p className="mt-4 text-sm text-[#EF4444]">{bootstrapError}</p>
      )}

      <div className="mt-6 max-w-md">
        <label htmlFor="class-select" className={labelClass}>
          Класс
        </label>
        {loadingClasses ? (
          <p className="text-sm text-[#71717A]">Загружаю классы...</p>
        ) : classes.length === 0 ? (
          <p className="text-sm text-[#71717A]">
            У вас пока нет классов.{" "}
            <Link
              href="/teacher/classes"
              className="text-[#818CF8] hover:underline"
            >
              Создайте класс
            </Link>
            , чтобы начать калибровку.
          </p>
        ) : (
          <select
            id="class-select"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className={`${inputClass} appearance-none bg-[length:16px] bg-[right_0.85rem_center] bg-no-repeat pr-10`}
            style={selectChevronStyle}
          >
            <option value="" disabled>
              Выберите класс
            </option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedClassId && (
        <section className="mt-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-[#F4F4F5]">Темы</h2>
            <button
              type="button"
              onClick={openModal}
              className="inline-flex items-center justify-center rounded-lg bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-[1.3rem] py-[0.55rem] text-sm font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)]"
            >
              + Добавить тему
            </button>
          </div>

          {loadingTopics ? (
            <p className="mt-6 text-sm text-[#71717A]">Загружаю темы...</p>
          ) : topics.length === 0 ? (
            <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(139,92,246,0.15)] bg-[#0F0D17] py-12 text-center">
              <p className="text-base text-[#A1A1AA]">
                Добавьте первую тему для калибровки
              </p>
              <button
                type="button"
                onClick={openModal}
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-8 py-[0.85rem] text-base font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)]"
              >
                Добавить тему
              </button>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {topics.map((topic, index) => {
                const calibrated = isTopicCalibrated(topic);
                return (
                  <li
                    key={topic.id}
                    className="flex items-center gap-4 rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-4 transition-colors hover:border-[rgba(139,92,246,0.15)]"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#181525] font-mono text-xs text-[#A1A1AA]">
                      {index + 1}
                    </span>

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
                          calibrated
                            ? "border-[#22C55E40] bg-[#22C55E26] text-[#22C55E]"
                            : "border-[rgba(113,113,122,0.4)] bg-transparent text-[#71717A]"
                        }`}
                      >
                        {calibrated ? "Откалибровано" : "Не настроено"}
                      </span>
                      <Link
                        href={`/teacher/calibrate/${topic.id}`}
                        className="inline-flex items-center justify-center rounded-lg border border-[rgba(139,92,246,0.25)] bg-transparent px-[1rem] py-[0.4rem] text-sm font-medium text-[#F4F4F5] transition-all hover:border-[rgba(139,92,246,0.4)] hover:bg-[rgba(139,92,246,0.05)]"
                      >
                        Настроить
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[rgba(139,92,246,0.15)] bg-[#181525] p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-topic-title"
          >
            <div className="flex items-start justify-between gap-4">
              <h2
                id="add-topic-title"
                className="text-lg font-semibold text-[#F4F4F5]"
              >
                Новая тема
              </h2>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Закрыть"
                className="-m-1 rounded-lg p-1 text-[#A1A1AA] transition-colors hover:bg-[rgba(139,92,246,0.05)] hover:text-[#F4F4F5]"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddTopic} className="mt-6 flex flex-col gap-4">
              <div>
                <label htmlFor="topicSection" className={labelClass}>
                  Раздел
                </label>
                <input
                  id="topicSection"
                  type="text"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  placeholder="Тригонометрия"
                  autoFocus
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="topicName" className={labelClass}>
                  Название темы
                </label>
                <input
                  id="topicName"
                  type="text"
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  placeholder="Синус и косинус"
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-8 py-[0.85rem] text-base font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]"
              >
                {submitting ? "Добавляю..." : "Добавить"}
              </button>

              {formError && (
                <p className="text-sm text-[#EF4444]">{formError}</p>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
