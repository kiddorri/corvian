"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { parseFileClient } from "@/lib/parse-file-client";

type ClassRow = {
  id: string;
  name: string;
  grade?: number;
  subject?: string;
};

type BulkTopicPlan = {
  name: string;
  theory: string;
  learning_goals: string[];
  huginn_steps: {
    goal: string;
    explanation: string;
    check_question: string;
    correct_answer: string;
    hint: string;
  }[];
  tasks: {
    question: string;
    answer: string;
    steps?: string;
    difficulty: number;
    template?: string | null;
    params?: Record<string, unknown> | null;
    answer_formula?: string | null;
  }[];
};

type BulkPlan = {
  section: string;
  topics: BulkTopicPlan[];
  fileCount: number;
};
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

  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkSectionName, setBulkSectionName] = useState("");
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");
  const [bulkPlan, setBulkPlan] = useState<BulkPlan | null>(null);
  const [bulkOutline, setBulkOutline] = useState<string[]>([]);
  const [bulkApplying, setBulkApplying] = useState(false);

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
        .select("id, name, grade, subject")
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

  async function handleDeleteTopic(
    topicId: string,
    topicName: string,
    skipConfirm = false,
  ) {
    if (
      !skipConfirm &&
      !confirm(`Удалить тему "${topicName}"? Все данные будут удалены.`)
    )
      return;

    const supabase = createClient();

    const { data: sessions } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("topic_id", topicId);

    if (sessions && sessions.length > 0) {
      const sessionIds = (sessions as Array<{ id: string }>).map((s) => s.id);
      await supabase
        .from("chat_messages")
        .delete()
        .in("session_id", sessionIds);
      await supabase
        .from("goal_step_progress")
        .delete()
        .in("session_id", sessionIds);
      await supabase
        .from("task_progress")
        .delete()
        .in("session_id", sessionIds);
      await supabase.from("chat_sessions").delete().eq("topic_id", topicId);
    }

    await supabase.from("student_progress").delete().eq("topic_id", topicId);

    const { data: goals } = await supabase
      .from("learning_goals")
      .select("id")
      .eq("topic_id", topicId);

    if (goals && goals.length > 0) {
      const goalIds = (goals as Array<{ id: string }>).map((g) => g.id);
      await supabase.from("goal_progress").delete().in("goal_id", goalIds);
    }

    await supabase.from("learning_goals").delete().eq("topic_id", topicId);
    await supabase.from("tasks").delete().eq("topic_id", topicId);
    await supabase.from("skills").delete().eq("topic_id", topicId);
    await supabase.from("calibrations").delete().eq("topic_id", topicId);
    await supabase.from("topics").delete().eq("id", topicId);

    setTopics((prev) => prev.filter((t) => t.id !== topicId));
  }

  async function handleDeleteSection(sectionName: string) {
    const sectionTopics = topics.filter((t) => t.section === sectionName);
    if (
      !confirm(
        `Удалить раздел "${sectionName}" и все ${sectionTopics.length} тем в нём?`,
      )
    )
      return;
    for (const topic of sectionTopics) {
      await handleDeleteTopic(topic.id, topic.name, true);
    }
  }

  async function handleBulkGenerate() {
    if (
      !bulkSectionName.trim() ||
      bulkFiles.length === 0 ||
      !selectedClassId
    )
      return;
    setBulkGenerating(true);
    setBulkProgress("Извлекаю текст из файлов...");

    try {
      const selectedClass = classes.find((c) => c.id === selectedClassId);

      const parsedFiles = await Promise.all(bulkFiles.map(parseFileClient));

      const hasContent = parsedFiles.some(
        (f) =>
          (f.type === "text" && f.text.trim().length > 0) ||
          f.type === "pdf" ||
          f.type === "image",
      );
      if (!hasContent) {
        throw new Error(
          "Не удалось извлечь текст ни из одного файла. Проверьте формат файлов.",
        );
      }

      setBulkProgress(
        `Отправляю ${parsedFiles.length} файлов AI для анализа...`,
      );

      const textFiles = parsedFiles.filter((f) => f.type === "text" && f.text);
      const binaryFiles = parsedFiles.filter(
        (f) => f.type === "pdf" || f.type === "image",
      );

      let res: Response;

      if (binaryFiles.length === 0) {
        res = await fetch("/api/generate-section", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classId: selectedClassId,
            sectionName: bulkSectionName.trim(),
            grade: String(selectedClass?.grade ?? ""),
            subject: selectedClass?.subject ?? "",
            textFiles: textFiles.map((f) => ({ name: f.name, text: f.text })),
          }),
        });
      } else {
        const formData = new FormData();
        formData.append("classId", selectedClassId);
        formData.append("sectionName", bulkSectionName.trim());
        formData.append("grade", String(selectedClass?.grade ?? ""));
        formData.append("subject", selectedClass?.subject ?? "");
        formData.append(
          "textFiles",
          JSON.stringify(
            textFiles.map((f) => ({ name: f.name, text: f.text })),
          ),
        );

        for (const bf of binaryFiles) {
          const originalFile = bulkFiles.find((f) => f.name === bf.name);
          if (originalFile) {
            formData.append("files", originalFile);
          }
        }

        res = await fetch("/api/generate-section", {
          method: "POST",
          body: formData,
        });
      }

      if (!res.ok) {
        // 4xx до начала стрима — ответ JSON
        let errMsg = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData?.error) errMsg = errData.error;
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Стрим недоступен");

      const decoder = new TextDecoder();
      let buffer = "";
      let outlineTopics: string[] = [];
      const collectedTopics: BulkTopicPlan[] = [];
      let streamError: string | null = null;
      let doneEvent: { warning?: string; fileCount?: number } | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE: события разделены пустой строкой, каждое начинается с "data: "
        let sepIdx: number;
        while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;

          let event: {
            type?: string;
            topics?: string[];
            index?: number;
            data?: BulkTopicPlan;
            message?: string;
            warning?: string;
            fileCount?: number;
            section?: string;
          };
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }

          if (event.type === "outline" && Array.isArray(event.topics)) {
            outlineTopics = event.topics;
            setBulkOutline(outlineTopics);
            setBulkProgress(
              `AI разбил материал на ${outlineTopics.length} тем. Генерирую планы...`,
            );
          } else if (
            event.type === "topic" &&
            typeof event.index === "number" &&
            event.data
          ) {
            collectedTopics.push(event.data);
            setBulkProgress(
              `Тема ${collectedTopics.length}/${outlineTopics.length || "?"}: ${event.data.name}`,
            );
            // Прогрессивный апдейт UI — учитель видит темы по мере появления
            setBulkPlan({
              section: bulkSectionName.trim(),
              topics: [...collectedTopics],
              fileCount: 0,
            });
          } else if (event.type === "done") {
            doneEvent = {
              warning: event.warning,
              fileCount: event.fileCount,
            };
          } else if (event.type === "error") {
            streamError = event.message ?? "Ошибка генерации";
          }
        }
      }

      if (streamError) throw new Error(streamError);

      setBulkProgress(doneEvent?.warning ? doneEvent.warning : "Готово!");
      setBulkPlan({
        section: bulkSectionName.trim(),
        topics: collectedTopics,
        fileCount: doneEvent?.fileCount ?? 0,
      });
    } catch (err) {
      alert("Ошибка: " + (err instanceof Error ? err.message : "неизвестная"));
      setBulkPlan(null);
      setBulkOutline([]);
    } finally {
      setBulkGenerating(false);
      setBulkProgress("");
    }
  }

  async function handleBulkApply() {
    if (!bulkPlan || !selectedClassId) return;
    setBulkApplying(true);

    try {
      const res = await fetch("/api/apply-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedClassId,
          sectionName: bulkPlan.section,
          topics: bulkPlan.topics,
        }),
      });

      const responseText = await res.text();
      let data: { error?: string; created?: { id: string; name: string }[] };
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(responseText.slice(0, 300) || `HTTP ${res.status}`);
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      alert(`Создано ${data.created?.length ?? 0} тем! Обновляю страницу...`);
      setBulkUploadOpen(false);
      setBulkPlan(null);
      setBulkOutline([]);
      setBulkFiles([]);
      setBulkSectionName("");
      window.location.reload();
    } catch (err) {
      alert("Ошибка: " + (err instanceof Error ? err.message : "неизвестная"));
    } finally {
      setBulkApplying(false);
    }
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBulkUploadOpen(true)}
                className="rounded-lg border border-[rgba(139,92,246,0.15)] bg-[#0F0D17] px-4 py-2 text-sm text-[#A1A1AA] transition-colors hover:border-[rgba(139,92,246,0.25)] hover:text-[#F4F4F5]"
              >
                📦 Загрузить раздел
              </button>
              <button
                type="button"
                onClick={openModal}
                className="inline-flex items-center justify-center rounded-lg bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-[1.3rem] py-[0.55rem] text-sm font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)]"
              >
                + Добавить тему
              </button>
            </div>
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
            <div className="mt-4 flex flex-col gap-6">
              {(() => {
                const groups = new Map<string, TopicRow[]>();
                for (const t of topics) {
                  const key = t.section || "Без раздела";
                  const arr = groups.get(key) ?? [];
                  arr.push(t);
                  groups.set(key, arr);
                }
                return Array.from(groups.entries()).map(
                  ([sectionName, sectionTopics]) => (
                    <div key={sectionName}>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#A1A1AA]">
                          {sectionName}
                          <span className="ml-2 text-xs text-[#52525B]">
                            ({sectionTopics.length})
                          </span>
                        </h3>
                        <button
                          type="button"
                          onClick={() => handleDeleteSection(sectionName)}
                          className="rounded-lg p-1.5 text-[#52525B] transition-colors hover:bg-red-500/10 hover:text-red-400"
                          title="Удалить раздел"
                          aria-label={`Удалить раздел ${sectionName}`}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                      <ul className="flex flex-col gap-3">
                        {sectionTopics.map((topic, index) => {
                          const calibrated = isTopicCalibrated(topic);
                          return (
                            <li
                              key={topic.id}
                              className="group relative flex items-center gap-4 rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-4 transition-colors hover:border-[rgba(139,92,246,0.15)]"
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTopic(topic.id, topic.name);
                                }}
                                className="absolute right-2 top-2 rounded-lg p-1.5 text-[#52525B] opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                                title="Удалить тему"
                                aria-label={`Удалить тему ${topic.name}`}
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>

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

                              <div className="flex shrink-0 items-center gap-3 pr-8">
                                <span
                                  className={`inline-flex items-center rounded-full border px-[0.6rem] py-[0.2rem] text-xs font-semibold ${
                                    calibrated
                                      ? "border-[#22C55E40] bg-[#22C55E26] text-[#22C55E]"
                                      : "border-[rgba(113,113,122,0.4)] bg-transparent text-[#71717A]"
                                  }`}
                                >
                                  {calibrated
                                    ? "Откалибровано"
                                    : "Не настроено"}
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
                    </div>
                  ),
                );
              })()}
            </div>
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

      {bulkUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[rgba(139,92,246,0.15)] bg-[#0A0814] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#F4F4F5]">
                📦 Загрузить раздел целиком
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (bulkGenerating || bulkApplying) return;
                  setBulkUploadOpen(false);
                  setBulkPlan(null);
                  setBulkOutline([]);
                  setBulkFiles([]);
                  setBulkSectionName("");
                }}
                className="text-[#71717A] hover:text-[#F4F4F5]"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            {!bulkPlan ? (
              <>
                <p className="mb-4 text-sm text-[#71717A]">
                  Загрузите все материалы раздела — AI автоматически разобьёт
                  их на темы и создаст планы уроков.
                </p>

                <div className="mb-4">
                  <label className={labelClass}>Название раздела</label>
                  <input
                    type="text"
                    value={bulkSectionName}
                    onChange={(e) => setBulkSectionName(e.target.value)}
                    placeholder="Тригонометрия"
                    className={inputClass}
                  />
                </div>

                <div className="mb-4">
                  <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-[rgba(139,92,246,0.2)] bg-[#09070F] p-8 transition-colors hover:border-[rgba(139,92,246,0.3)]">
                    <span className="text-2xl">📄</span>
                    <span className="text-sm text-[#A1A1AA]">
                      Нажмите чтобы загрузить файлы
                    </span>
                    <span className="text-xs text-[#52525B]">
                      PDF файлы
                    </span>
                    <input
                      type="file"
                      accept=".pdf"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const newFiles = Array.from(e.target.files ?? []);
                        setBulkFiles((prev) => [...prev, ...newFiles]);
                      }}
                    />
                  </label>
                </div>

                {bulkFiles.length > 0 && (
                  <div className="mb-4 space-y-1">
                    {bulkFiles.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg bg-[#0F0D17] px-3 py-2 text-xs text-[#A1A1AA]"
                      >
                        <span>
                          {f.name} ({(f.size / 1024 / 1024).toFixed(1)} MB)
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setBulkFiles((prev) =>
                              prev.filter((_, j) => j !== i),
                            )
                          }
                          className="text-red-400 hover:text-red-300"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <p className="text-xs text-[#52525B]">
                      {bulkFiles.length} файл(ов)
                    </p>
                  </div>
                )}

                <div>
                  <button
                    type="button"
                    onClick={handleBulkGenerate}
                    disabled={
                      !bulkSectionName.trim() ||
                      bulkFiles.length === 0 ||
                      bulkGenerating
                    }
                    className="w-full rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#8B5CF6] px-4 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-40"
                  >
                    {bulkGenerating
                      ? "AI анализирует материалы..."
                      : `✨ Разбить на темы (${bulkFiles.length} файлов)`}
                  </button>

                  {bulkGenerating && (
                    <div className="mt-3">
                      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1A1625]">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] via-[#A78BFA] to-[#7C3AED] bg-[length:200%_100%] animate-[shimmer_2s_ease-in-out_infinite]" />
                      </div>
                      <p className="text-center text-xs text-[#71717A]">
                        {bulkProgress || "Подождите..."}
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="mb-4 text-sm text-[#A1A1AA]">
                  AI предлагает{" "}
                  <strong className="text-[#F4F4F5]">
                    {bulkOutline.length || bulkPlan.topics.length} тем
                  </strong>{" "}
                  для раздела «{bulkPlan.section}»:
                </p>

                {bulkGenerating && (
                  <div className="mb-4">
                    <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1A1625]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A78BFA] transition-all"
                        style={{
                          width: `${
                            bulkOutline.length > 0
                              ? Math.round(
                                  (bulkPlan.topics.length /
                                    bulkOutline.length) *
                                    100,
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <p className="text-center text-xs text-[#71717A]">
                      {bulkProgress ||
                        `${bulkPlan.topics.length} / ${bulkOutline.length} тем готово`}
                    </p>
                  </div>
                )}

                <div className="mb-4 space-y-3">
                  {bulkPlan.topics.map((topic, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-[rgba(139,92,246,0.1)] bg-[#0F0D17] p-4"
                    >
                      <h4 className="mb-1 text-sm font-semibold text-[#F4F4F5]">
                        {i + 1}. {topic.name}
                      </h4>
                      <p className="mb-2 line-clamp-2 text-xs text-[#71717A]">
                        {topic.theory?.slice(0, 150)}...
                      </p>
                      <div className="flex gap-3 text-xs text-[#52525B]">
                        <span>🎯 {topic.learning_goals?.length ?? 0} целей</span>
                        <span>💬 {topic.huginn_steps?.length ?? 0} шагов</span>
                        <span>📝 {topic.tasks?.length ?? 0} задач</span>
                      </div>
                    </div>
                  ))}

                  {bulkGenerating &&
                    bulkOutline
                      .slice(bulkPlan.topics.length)
                      .map((name, i) => (
                        <div
                          key={`pending-${i}`}
                          className="rounded-xl border border-dashed border-[rgba(139,92,246,0.1)] bg-[#0C0A14] p-4 opacity-60"
                        >
                          <h4 className="mb-1 text-sm font-semibold text-[#71717A]">
                            {bulkPlan.topics.length + i + 1}. {name}
                          </h4>
                          <p className="text-xs text-[#52525B]">
                            Генерирую план...
                          </p>
                        </div>
                      ))}
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkPlan(null);
                      setBulkOutline([]);
                    }}
                    disabled={bulkApplying || bulkGenerating}
                    className="flex-1 rounded-lg border border-[rgba(139,92,246,0.15)] px-4 py-3 text-sm text-[#A1A1AA] hover:text-[#F4F4F5] disabled:opacity-40"
                  >
                    ← Назад
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkApply}
                    disabled={bulkApplying || bulkGenerating}
                    className="flex-1 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#8B5CF6] px-4 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-40"
                  >
                    {bulkApplying
                      ? "Создаю темы..."
                      : bulkGenerating
                        ? "Жду полной генерации..."
                        : `✅ Создать ${bulkPlan.topics.length} тем`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
