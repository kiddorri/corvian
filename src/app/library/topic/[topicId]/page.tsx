import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { LibraryHeader } from "@/components/library/LibraryHeader";
import { StartLessonButton } from "@/components/library/StartLessonButton";
import { FormattedText } from "@/components/FormattedText";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ topicId: string }>;
}

async function getTopicData(topicId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: topic } = await supabase
    .from("library_topics")
    .select("id, name, section, subject_id")
    .eq("id", topicId)
    .maybeSingle();

  if (!topic) return null;

  const { data: subject } = await supabase
    .from("library_subjects")
    .select("name, grade, icon")
    .eq("id", topic.subject_id)
    .maybeSingle();

  const { data: calibration } = await supabase
    .from("library_calibrations")
    .select("theory_text")
    .eq("topic_id", topicId)
    .maybeSingle();

  const { data: goals } = await supabase
    .from("library_goals")
    .select("id, text, sort_order")
    .eq("topic_id", topicId)
    .order("sort_order", { ascending: true });

  const { data: tasks } = await supabase
    .from("library_tasks")
    .select("difficulty")
    .eq("topic_id", topicId);

  const tasksByDifficulty: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const t of tasks ?? []) {
    const d = t.difficulty ?? 1;
    if (d >= 1 && d <= 4) tasksByDifficulty[d]++;
  }

  return {
    topic,
    subject,
    theory: calibration?.theory_text ?? "",
    goals: goals ?? [],
    tasksByDifficulty,
    totalTasks: tasks?.length ?? 0,
  };
}

const DIFFICULTY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Базовый", color: "text-emerald-400" },
  2: { label: "Средний", color: "text-blue-400" },
  3: { label: "Продвинутый", color: "text-amber-400" },
  4: { label: "Сложный", color: "text-red-400" },
};

export default async function TopicPage({ params }: PageProps) {
  const { topicId } = await params;
  const data = await getTopicData(topicId);
  if (!data) notFound();

  const { topic, subject, theory, goals, tasksByDifficulty, totalTasks } = data;

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F4F4F5]">
      <LibraryHeader />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-2 text-sm text-[#71717A]">
          {subject?.icon} {subject?.name} {subject?.grade} класс · {topic.section}
        </div>
        <h1 className="text-3xl font-bold">{topic.name}</h1>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-[rgba(139,92,246,0.15)] bg-[#18181B] p-5">
            <div className="text-xs uppercase tracking-wider text-[#71717A]">Целей обучения</div>
            <div className="mt-1 text-3xl font-bold text-[#F4F4F5]">{goals.length}</div>
          </div>
          <div className="rounded-2xl border border-[rgba(139,92,246,0.15)] bg-[#18181B] p-5">
            <div className="text-xs uppercase tracking-wider text-[#71717A]">Задач для практики</div>
            <div className="mt-1 text-3xl font-bold text-[#F4F4F5]">{totalTasks}</div>
          </div>
          <div className="rounded-2xl border border-[rgba(139,92,246,0.15)] bg-[#18181B] p-5">
            <div className="text-xs uppercase tracking-wider text-[#71717A]">Примерное время</div>
            <div className="mt-1 text-3xl font-bold text-[#F4F4F5]">
              ~{Math.max(15, goals.length * 5 + totalTasks * 2)} мин
            </div>
          </div>
        </div>

        {theory && (
          <section className="mt-8 rounded-2xl border border-[rgba(139,92,246,0.15)] bg-[#18181B] p-6">
            <h2 className="text-lg font-bold">О теме</h2>
            <div className="mt-3 text-sm leading-relaxed text-[#A1A1AA]">
              <FormattedText text={theory} variant="prose" className="space-y-3 text-sm leading-relaxed" />
            </div>
          </section>
        )}

        {goals.length > 0 && (
          <section className="mt-6 rounded-2xl border border-[rgba(139,92,246,0.15)] bg-[#18181B] p-6">
            <h2 className="text-lg font-bold">🎯 Что ты узнаешь</h2>
            <ul className="mt-4 space-y-3">
              {goals.map((g, i) => (
                <li key={g.id} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgba(139,92,246,0.15)] text-xs font-bold text-[#8B5CF6]">
                    {i + 1}
                  </span>
                  <div className="text-sm text-[#E4E4E7]">
                    <FormattedText text={g.text} variant="prose" className="text-sm" />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {totalTasks > 0 && (
          <section className="mt-6 rounded-2xl border border-[rgba(139,92,246,0.15)] bg-[#18181B] p-6">
            <h2 className="text-lg font-bold">📝 Задачи по уровням</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[1, 2, 3, 4].map((d) => {
                const count = tasksByDifficulty[d];
                const meta = DIFFICULTY_LABELS[d];
                return (
                  <div
                    key={d}
                    className="rounded-lg border border-[rgba(139,92,246,0.1)] bg-[#09090B] p-3"
                  >
                    <div className={`text-xs font-medium ${meta.color}`}>
                      {"★".repeat(d)}
                    </div>
                    <div className="mt-1 text-xs text-[#71717A]">{meta.label}</div>
                    <div className="mt-1 text-lg font-bold text-[#F4F4F5]">{count}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-8 flex justify-center">
          <StartLessonButton topicId={topic.id} />
        </div>
      </main>
    </div>
  );
}
