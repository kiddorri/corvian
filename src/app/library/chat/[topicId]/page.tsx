import Link from "next/link";
import { LibraryHeader } from "@/components/library/LibraryHeader";

export default async function LibraryChatPlaceholder({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  return (
    <div className="min-h-screen bg-[#09090B] text-[#F4F4F5]">
      <LibraryHeader />
      <main className="mx-auto max-w-2xl px-6 py-20 text-center">
        <div className="text-6xl">🚧</div>
        <h1 className="mt-4 text-2xl font-bold">Чат для библиотеки скоро</h1>
        <p className="mt-2 text-sm text-[#71717A]">
          Этот функционал будет добавлен в следующем этапе. Topic ID: <code>{topicId}</code>
        </p>
        <Link
          href="/library"
          className="mt-6 inline-block rounded-lg bg-[#8B5CF6] px-4 py-2 text-sm font-medium text-white"
        >
          ← Вернуться в библиотеку
        </Link>
      </main>
    </div>
  );
}
