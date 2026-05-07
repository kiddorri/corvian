"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, GraduationCap, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { generateClassCode } from "@/lib/utils/classCode";

type ClassRow = {
  id: string;
  name: string;
  code: string;
  grade: number;
  subject: string;
  is_open: boolean;
  created_at: string;
  students: { count: number }[];
};

const GRADES = [6, 7, 8, 9, 10, 11, 12];

const inputClass =
  "w-full rounded-lg border border-[rgba(139,92,246,0.08)] bg-[#09070F] px-[0.85rem] py-[0.65rem] text-base text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[rgba(139,92,246,0.25)] focus:outline-none";
const labelClass = "mb-1 block text-sm text-[#A1A1AA]";

export default function TeacherClassesPage() {
  const router = useRouter();

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newClassCode, setNewClassCode] = useState<string | null>(null);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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
        .select("*, students(count)")
        .eq("teacher_id", teacher.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        setBootstrapError("Не удалось загрузить классы.");
      } else {
        setClasses((data ?? []) as ClassRow[]);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function openModal() {
    setName("");
    setSubject("");
    setGrade("");
    setFormError(null);
    setNewClassCode(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (submitting) return;
    setModalOpen(false);
    setNewClassCode(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !teacherId) return;
    setFormError(null);

    if (name.trim().length === 0) {
      setFormError("Укажите название класса.");
      return;
    }
    if (subject.trim().length === 0) {
      setFormError("Укажите предмет.");
      return;
    }
    const gradeNum = parseInt(grade, 10);
    if (!GRADES.includes(gradeNum)) {
      setFormError("Выберите класс.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const code = generateClassCode();

    const { data, error } = await supabase
      .from("classes")
      .insert({
        teacher_id: teacherId,
        name: name.trim(),
        code,
        grade: gradeNum,
        subject: subject.trim(),
      })
      .select("*, students(count)")
      .single();

    setSubmitting(false);

    if (error || !data) {
      setFormError("Не удалось создать класс. Попробуйте ещё раз.");
      return;
    }

    setClasses((prev) => [data as ClassRow, ...prev]);
    setNewClassCode(data.code);
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => {
        setCopiedCode((current) => (current === code ? null : current));
      }, 2000);
    } catch {
      // ignore — clipboard may be unavailable
    }
  }

  const showEmptyState = !loading && classes.length === 0;

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Мои классы</h1>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center justify-center rounded-lg bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-[1.3rem] py-[0.55rem] text-sm font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)]"
        >
          + Создать класс
        </button>
      </div>

      {bootstrapError && (
        <p className="mt-4 text-sm text-[#EF4444]">{bootstrapError}</p>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-[#71717A]">Загружаю классы...</p>
      ) : showEmptyState ? (
        <div className="mt-16 flex flex-col items-center justify-center text-center">
          <GraduationCap size={48} className="text-[#52525B]" />
          <p className="mt-4 text-base text-[#A1A1AA]">
            У вас пока нет классов
          </p>
          <button
            type="button"
            onClick={openModal}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-8 py-[0.85rem] text-base font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)]"
          >
            Создать первый класс
          </button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((cls) => {
            const studentCount = cls.students?.[0]?.count ?? 0;
            const copied = copiedCode === cls.code;
            return (
              <article
                key={cls.id}
                className="rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-5 transition-colors hover:border-[rgba(139,92,246,0.15)]"
              >
                <h2 className="text-lg font-semibold text-[#F4F4F5]">
                  {cls.name}
                </h2>
                <p className="mt-1 text-sm text-[#A1A1AA]">
                  {cls.subject} · {cls.grade} класс
                </p>

                <div className="mt-4 flex items-center gap-2">
                  <span className="font-mono text-sm text-[#818CF8]">
                    {cls.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyCode(cls.code)}
                    aria-label={`Скопировать код ${cls.code}`}
                    className="inline-flex items-center gap-1 rounded-md p-1 text-[#71717A] transition-colors hover:bg-[rgba(139,92,246,0.05)] hover:text-[#F4F4F5]"
                  >
                    {copied ? (
                      <>
                        <Check size={14} className="text-[#22C55E]" />
                        <span className="text-xs text-[#22C55E]">
                          Скопировано!
                        </span>
                      </>
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-[#A1A1AA]">
                    <Users size={16} />
                    <span>{studentCount}</span>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-[0.6rem] py-[0.2rem] text-xs font-semibold ${
                      cls.is_open
                        ? "border-[#22C55E40] bg-[#22C55E26] text-[#22C55E]"
                        : "border-[rgba(113,113,122,0.4)] bg-[rgba(113,113,122,0.15)] text-[#71717A]"
                    }`}
                  >
                    {cls.is_open ? "Открыт" : "Закрыт"}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
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
            aria-labelledby="create-class-title"
          >
            <div className="flex items-start justify-between gap-4">
              <h2
                id="create-class-title"
                className="text-lg font-semibold text-[#F4F4F5]"
              >
                {newClassCode ? "Класс создан" : "Новый класс"}
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

            {newClassCode ? (
              <div className="mt-6">
                <p className="text-sm text-[#A1A1AA]">Код класса:</p>
                <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-[rgba(139,92,246,0.15)] bg-[#09070F] px-4 py-3">
                  <span className="font-mono text-2xl font-bold tracking-wider text-[#818CF8]">
                    {newClassCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyCode(newClassCode)}
                    aria-label="Скопировать код"
                    className="inline-flex items-center gap-1 rounded-md p-2 text-[#71717A] transition-colors hover:bg-[rgba(139,92,246,0.05)] hover:text-[#F4F4F5]"
                  >
                    {copiedCode === newClassCode ? (
                      <>
                        <Check size={16} className="text-[#22C55E]" />
                        <span className="text-xs text-[#22C55E]">
                          Скопировано!
                        </span>
                      </>
                    ) : (
                      <Copy size={18} />
                    )}
                  </button>
                </div>
                <p className="mt-3 text-sm text-[#71717A]">
                  Передайте этот код ученикам — они введут его на странице
                  входа.
                </p>
                <button
                  type="button"
                  onClick={closeModal}
                  className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-8 py-[0.85rem] text-base font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)]"
                >
                  Готово
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="mt-6 flex flex-col gap-4">
                <div>
                  <label htmlFor="className" className={labelClass}>
                    Название класса
                  </label>
                  <input
                    id="className"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="9Б Математика"
                    autoFocus
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="classSubject" className={labelClass}>
                    Предмет
                  </label>
                  <input
                    id="classSubject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Математика"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="classGrade" className={labelClass}>
                    Класс
                  </label>
                  <select
                    id="classGrade"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className={`${inputClass} appearance-none bg-[length:16px] bg-[right_0.85rem_center] bg-no-repeat pr-10`}
                    style={{
                      backgroundImage:
                        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23A1A1AA' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
                    }}
                  >
                    <option value="" disabled>
                      Выберите класс
                    </option>
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-8 py-[0.85rem] text-base font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]"
                >
                  {submitting ? "Создаю..." : "Создать"}
                </button>

                {formError && (
                  <p className="text-sm text-[#EF4444]">{formError}</p>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
