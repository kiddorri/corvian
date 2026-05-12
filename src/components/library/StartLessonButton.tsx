"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getLibraryStudent } from "@/lib/auth/library-session";

interface StartLessonButtonProps {
  topicId: string;
}

export function StartLessonButton({ topicId }: StartLessonButtonProps) {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    setLoggedIn(!!getLibraryStudent());
  }, []);

  const handleClick = () => {
    if (loggedIn) {
      router.push(`/library/chat/${topicId}`);
    } else {
      router.push(`/library/signup?redirect=${encodeURIComponent(`/library/chat/${topicId}`)}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loggedIn === null}
      className="rounded-xl bg-[#8B5CF6] px-8 py-4 text-lg font-medium text-white shadow-lg shadow-purple-500/20 transition hover:bg-[#7C3AED] hover:shadow-purple-500/30 disabled:opacity-50"
    >
      🚀 Начать урок
    </button>
  );
}
