import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { LibraryHeader } from "@/components/library/LibraryHeader";

export const dynamic = "force-dynamic";

interface SubjectWithCounts {
  id: string;
  name: string;
  grade: number;
  icon: string;
  description: string | null;
  sections_count: number;
  topics_count: number;
}

async function getSubjects(): Promise<SubjectWithCounts[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: subjects } = await supabase
    .from("library_subjects")
    .select("id, name, grade, icon, description")
    .order("grade", { ascending: true })
    .order("sort_order", { ascending: true });

  if (!subjects) return [];

  const results: SubjectWithCounts[] = [];
  for (const s of subjects) {
    const { data: topics } = await supabase
      .from("library_topics")
      .select("section")
      .eq("subject_id", s.id);
    const sections = new Set((topics ?? []).map((t) => t.section));
    results.push({
      ...s,
      sections_count: sections.size,
      topics_count: topics?.length ?? 0,
    });
  }

  return results;
}

export default async function LibraryHomePage() {
  const subjects = await getSubjects();

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F4F4F5]">
      <LibraryHeader />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10">
          <h1 className="text-4xl font-bold">Библиотека знаний</h1>
          <p className="mt-2 text-[#A1A1AA]">
            Выбери предмет и начни заниматься с AI-наставниками
          </p>
        </div>

        {subjects.length === 0 ? (
          <div className="rounded-2xl border border-[rgba(139,92,246,0.15)] bg-[#18181B] p-10 text-center">
            <div className="mb-3 text-5xl">📭</div>
            <h2 className="text-xl font-bold">В библиотеке пока пусто</h2>
            <p className="mt-2 text-sm text-[#71717A]">
              Скоро здесь появятся темы по разным предметам.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((s) => (
              <Link
                key={s.id}
                href={`/library/${s.id}`}
                className="group rounded-2xl border border-[rgba(139,92,246,0.15)] bg-[#18181B] p-6 transition hover:border-[#8B5CF6] hover:bg-[#1F1F23]"
              >
                <div className="mb-4 text-5xl">{s.icon}</div>
                <h2 className="text-xl font-bold text-[#F4F4F5]">{s.name}</h2>
                <p className="mt-1 text-sm text-[#71717A]">{s.grade} класс</p>
                {s.description && (
                  <p className="mt-3 text-sm text-[#A1A1AA] line-clamp-2">
                    {s.description}
                  </p>
                )}
                <div className="mt-4 flex gap-4 text-xs text-[#71717A]">
                  <span>{s.sections_count} разделов</span>
                  <span>{s.topics_count} тем</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
