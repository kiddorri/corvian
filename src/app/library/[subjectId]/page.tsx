import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { LibraryHeader } from "@/components/library/LibraryHeader";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ subjectId: string }>;
  searchParams: Promise<{ section?: string }>;
}

interface SubjectInfo {
  id: string;
  name: string;
  grade: number;
  icon: string;
}

interface TopicInfo {
  id: string;
  section: string;
  name: string;
  sort_order: number;
  goals_count: number;
  tasks_count: number;
}

async function getSubjectAndTopics(subjectId: string): Promise<{
  subject: SubjectInfo | null;
  topics: TopicInfo[];
}> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: subject } = await supabase
    .from("library_subjects")
    .select("id, name, grade, icon")
    .eq("id", subjectId)
    .maybeSingle();

  if (!subject) return { subject: null, topics: [] };

  const { data: topics } = await supabase
    .from("library_topics")
    .select("id, section, name, sort_order")
    .eq("subject_id", subjectId)
    .order("section", { ascending: true })
    .order("sort_order", { ascending: true });

  if (!topics) return { subject, topics: [] };

  const enriched: TopicInfo[] = [];
  for (const t of topics) {
    const [{ count: goalsCount }, { count: tasksCount }] = await Promise.all([
      supabase
        .from("library_goals")
        .select("id", { count: "exact", head: true })
        .eq("topic_id", t.id),
      supabase
        .from("library_tasks")
        .select("id", { count: "exact", head: true })
        .eq("topic_id", t.id),
    ]);
    enriched.push({
      ...t,
      goals_count: goalsCount ?? 0,
      tasks_count: tasksCount ?? 0,
    });
  }

  return { subject, topics: enriched };
}

export default async function SubjectPage({ params, searchParams }: PageProps) {
  const { subjectId } = await params;
  const { section: activeSection } = await searchParams;

  const { subject, topics } = await getSubjectAndTopics(subjectId);

  if (!subject) notFound();

  const sections = Array.from(new Set(topics.map((t) => t.section)));
  const currentSection = activeSection ?? sections[0] ?? "";
  const filteredTopics = topics.filter((t) => t.section === currentSection);

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F4F4F5]">
      <LibraryHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center gap-4">
          <div className="text-5xl">{subject.icon}</div>
          <div>
            <h1 className="text-3xl font-bold">{subject.name}</h1>
            <p className="text-sm text-[#A1A1AA]">{subject.grade} класс</p>
          </div>
        </div>

        {sections.length === 0 ? (
          <div className="rounded-2xl border border-[rgba(139,92,246,0.15)] bg-[#18181B] p-10 text-center">
            <p className="text-[#71717A]">В этом предмете пока нет тем.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-2xl border border-[rgba(139,92,246,0.15)] bg-[#18181B] p-4">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#71717A]">
                  Разделы
                </h2>
                <ul className="space-y-1">
                  {sections.map((s) => {
                    const active = s === currentSection;
                    return (
                      <li key={s}>
                        <Link
                          href={`/library/${subjectId}?section=${encodeURIComponent(s)}`}
                          className={`block rounded-lg px-3 py-2 text-sm transition ${
                            active
                              ? "bg-[#8B5CF6] text-white"
                              : "text-[#A1A1AA] hover:bg-[rgba(139,92,246,0.08)]"
                          }`}
                        >
                          {s}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </aside>

            <section>
              <h2 className="mb-4 text-xl font-bold">{currentSection}</h2>
              {filteredTopics.length === 0 ? (
                <p className="text-sm text-[#71717A]">В этом разделе нет тем.</p>
              ) : (
                <div className="space-y-3">
                  {filteredTopics.map((t, idx) => (
                    <Link
                      key={t.id}
                      href={`/library/topic/${t.id}`}
                      className="group block rounded-xl border border-[rgba(139,92,246,0.15)] bg-[#18181B] p-5 transition hover:border-[#8B5CF6] hover:bg-[#1F1F23]"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[rgba(139,92,246,0.15)] text-sm font-bold text-[#8B5CF6]">
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-[#F4F4F5] group-hover:text-white">
                            {t.name}
                          </h3>
                          <div className="mt-2 flex gap-4 text-xs text-[#71717A]">
                            <span>🎯 {t.goals_count} целей</span>
                            <span>📝 {t.tasks_count} задач</span>
                          </div>
                        </div>
                        <div className="text-[#71717A] group-hover:text-[#8B5CF6]">
                          →
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
