"use client";

type GoalStatus = "not_started" | "in_progress" | "mastered";

interface Goal {
  id: string;
  text: string;
}

interface GoalTrackerProps {
  goals: Goal[];
  progress: Record<string, GoalStatus>;
}

const STATUS_STYLE: Record<
  GoalStatus,
  {
    card: string;
    border: string;
    dot: string;
    glow: string;
    title: string;
  }
> = {
  not_started: {
    card: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.08)",
    dot: "rgba(255,255,255,0.2)",
    glow: "none",
    title: "rgba(255,255,255,0.5)",
  },
  in_progress: {
    card: "rgba(251,191,36,0.08)",
    border: "rgba(251,191,36,0.2)",
    dot: "#fbbf24",
    glow: "0 0 8px #fbbf24",
    title: "rgba(255,255,255,0.9)",
  },
  mastered: {
    card: "rgba(52,211,153,0.08)",
    border: "rgba(52,211,153,0.2)",
    dot: "#34d399",
    glow: "0 0 8px #34d399",
    title: "rgba(255,255,255,0.9)",
  },
};

export function GoalTracker({ goals, progress }: GoalTrackerProps) {
  const masteredCount = goals.filter(
    (g) => progress[g.id] === "mastered",
  ).length;
  const total = goals.length;
  const percent = total > 0 ? (masteredCount / total) * 100 : 0;

  return (
    <>
      <p className="px-5 pb-3 pt-4 text-[10px] font-bold uppercase tracking-[1.5px] text-[rgba(255,255,255,0.3)]">
        Цели обучения
      </p>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4">
        {goals.map((goal) => {
          const status = progress[goal.id] ?? "not_started";
          const s = STATUS_STYLE[status];
          return (
            <div
              key={goal.id}
              className="flex gap-3 rounded-[10px] border p-3 transition-all duration-300"
              style={{ background: s.card, borderColor: s.border }}
            >
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full transition-all duration-300"
                style={{
                  background: s.dot,
                  boxShadow: s.glow === "none" ? undefined : s.glow,
                }}
              />
              <p
                className="text-[13px] font-semibold leading-snug"
                style={{ color: s.title }}
              >
                {goal.text}
              </p>
            </div>
          );
        })}
      </div>

      <div className="border-t border-[rgba(255,255,255,0.06)] px-5 py-4">
        <div className="mb-2 flex items-center justify-between text-[11px] text-[rgba(255,255,255,0.4)]">
          <span>Прогресс</span>
          <span>
            {masteredCount}/{total}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-sm bg-[rgba(255,255,255,0.06)]">
          <div
            className="h-full rounded-sm transition-all duration-500"
            style={{
              width: `${percent}%`,
              background: "linear-gradient(90deg, #6366f1, #34d399)",
            }}
          />
        </div>
      </div>
    </>
  );
}
