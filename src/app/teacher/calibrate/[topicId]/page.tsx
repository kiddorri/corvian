"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  BookOpen,
  Bot,
  ClipboardList,
  Pencil,
  Target,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Topic = {
  id: string;
  name: string;
  section: string;
  class_id: string;
  is_calibrated: boolean;
};

type Calibration = {
  id: string;
  topic_id: string;
  theory_text: string | null;
  theory_files: unknown;
  huginn_instructions: string | null;
  muninn_instructions: string | null;
  socratic_level: number;
  max_hints_before_answer: number;
  allow_humor: boolean;
  allow_analogies: boolean;
};

type SkillLevel = "базовый" | "продвинутый" | "олимпиадный";
const SKILL_LEVELS: SkillLevel[] = ["базовый", "продвинутый", "олимпиадный"];

type Skill = {
  id: string;
  topic_id: string;
  text: string;
  level: SkillLevel;
  sort_order: number;
};

type Goal = {
  id: string;
  topic_id: string;
  text: string;
  sort_order: number;
};

type Task = {
  id: string;
  topic_id: string;
  skill_id: string | null;
  question: string;
  answer: string;
  steps: string | null;
  difficulty: number;
  sort_order: number;
  skills?: { text: string } | null;
};

type TabKey = "theory" | "skills" | "tasks" | "ai";

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "theory", label: "Теория", icon: BookOpen },
  { key: "skills", label: "Навыки и цели", icon: Target },
  { key: "tasks", label: "Задачи", icon: ClipboardList },
  { key: "ai", label: "Настройки AI", icon: Bot },
];

const inputClass =
  "w-full rounded-lg border border-[rgba(139,92,246,0.08)] bg-[#09070F] px-[0.85rem] py-[0.65rem] text-base text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[rgba(139,92,246,0.25)] focus:outline-none";
const textareaClass =
  "w-full rounded-lg border border-[rgba(139,92,246,0.08)] bg-[#09070F] px-[0.85rem] py-[0.65rem] text-sm leading-[1.6] text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[rgba(139,92,246,0.25)] focus:outline-none";
const labelClass = "mb-1 block text-sm text-[#A1A1AA]";
const cardClass =
  "rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-6";
const blockTitleClass = "text-base font-semibold text-[#F4F4F5]";
const blockHintClass = "mt-1 text-xs text-[#71717A]";
const primaryBtnClass =
  "inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-8 py-[0.85rem] text-base font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]";
const primarySmallBtnClass =
  "inline-flex items-center justify-center rounded-lg bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-[1.3rem] py-[0.55rem] text-sm font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]";
const ghostBtnClass =
  "inline-flex items-center gap-1 rounded-lg px-3 py-[0.4rem] text-sm text-[#A1A1AA] transition-colors hover:bg-[rgba(139,92,246,0.05)] hover:text-[#F4F4F5]";
const selectChevronStyle: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23A1A1AA' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
};

const SKILL_LEVEL_STYLES: Record<SkillLevel, string> = {
  базовый: "border-[#3B82F640] bg-[#3B82F626] text-[#60A5FA]",
  продвинутый: "border-[#8B5CF640] bg-[#8B5CF626] text-[#A78BFA]",
  олимпиадный: "border-[#F9731640] bg-[#F9731626] text-[#FB923C]",
};

function difficultyStyle(d: number): string {
  if (d <= 2) return "border-[#22C55E40] bg-[#22C55E26] text-[#22C55E]";
  if (d === 3) return "border-[#F59E0B40] bg-[#F59E0B26] text-[#F59E0B]";
  return "border-[#EF444440] bg-[#EF444426] text-[#EF4444]";
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? "bg-[#8B5CF6]" : "bg-[#52525B]"
      }`}
    >
      <span
        className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-all ${
          checked ? "left-[18px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

function Slider({
  id,
  min,
  max,
  step,
  value,
  onChange,
}: {
  id: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (next: number) => void;
}) {
  const fillPct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-4">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="corvian-slider h-2 w-full cursor-pointer appearance-none rounded-full focus:outline-none"
        style={{
          background: `linear-gradient(to right, #7C3AED 0%, #A855F7 ${fillPct}%, #181525 ${fillPct}%, #181525 100%)`,
        }}
      />
      <span className="min-w-[3rem] text-right font-mono text-lg text-[#F4F4F5]">
        {value}
      </span>
    </div>
  );
}

export default function CalibrateTopicPage() {
  const router = useRouter();
  const params = useParams();
  const topicId =
    typeof params.topicId === "string" ? params.topicId : params.topicId?.[0];

  const [topic, setTopic] = useState<Topic | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("theory");

  // Tab 1 (Theory) state
  const [theoryText, setTheoryText] = useState("");
  const [huginnInstructions, setHuginnInstructions] = useState("");
  const [savingTheory, setSavingTheory] = useState(false);
  const [theorySavedAt, setTheorySavedAt] = useState<number | null>(null);
  const [theoryError, setTheoryError] = useState<string | null>(null);

  // Lesson generation state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<{
    theory: string;
    huginn_steps: Array<{
      explanation: string;
      question: string;
      correct_answer: string;
      hint: string;
    }>;
    tasks: Array<{
      question: string;
      answer: string;
      steps: string;
      difficulty: number;
    }>;
  } | null>(null);

  // Tab 4 (AI settings) state
  const [socraticLevel, setSocraticLevel] = useState(65);
  const [maxHints, setMaxHints] = useState(3);
  const [allowHumor, setAllowHumor] = useState(true);
  const [allowAnalogies, setAllowAnalogies] = useState(true);
  const [muninnInstructions, setMuninnInstructions] = useState("");
  const [savingAi, setSavingAi] = useState(false);
  const [aiSavedAt, setAiSavedAt] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Tab 2 (Skills + Goals) state
  const [skills, setSkills] = useState<Skill[]>([]);
  const [addingSkill, setAddingSkill] = useState(false);
  const [skillDraftText, setSkillDraftText] = useState("");
  const [skillDraftLevel, setSkillDraftLevel] =
    useState<SkillLevel>("базовый");
  const [submittingSkill, setSubmittingSkill] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);

  const [goals, setGoals] = useState<Goal[]>([]);
  const [addingGoal, setAddingGoal] = useState(false);
  const [goalDraftText, setGoalDraftText] = useState("");
  const [submittingGoal, setSubmittingGoal] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);

  // Tab 3 (Tasks) state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskQuestion, setTaskQuestion] = useState("");
  const [taskAnswer, setTaskAnswer] = useState("");
  const [taskSteps, setTaskSteps] = useState("");
  const [taskDifficulty, setTaskDifficulty] = useState("1");
  const [taskSkillId, setTaskSkillId] = useState("");
  const [submittingTask, setSubmittingTask] = useState(false);
  const [taskFormError, setTaskFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!topicId) return;
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

      const { data: topicData, error: topicError } = await supabase
        .from("topics")
        .select("*")
        .eq("id", topicId)
        .single();

      if (cancelled) return;
      if (topicError || !topicData) {
        setBootstrapError("Тема не найдена.");
        setLoading(false);
        return;
      }
      setTopic(topicData as Topic);

      let { data: cal } = await supabase
        .from("calibrations")
        .select("*")
        .eq("topic_id", topicId)
        .maybeSingle();

      if (!cal) {
        const { data: created, error: createError } = await supabase
          .from("calibrations")
          .insert({ topic_id: topicId })
          .select("*")
          .single();
        if (createError || !created) {
          if (!cancelled) {
            setBootstrapError("Не удалось создать калибровку.");
            setLoading(false);
          }
          return;
        }
        cal = created;
      }

      if (cancelled) return;
      const c = cal as Calibration;
      setCalibration(c);
      setTheoryText(c.theory_text ?? "");
      setHuginnInstructions(c.huginn_instructions ?? "");
      setSocraticLevel(c.socratic_level ?? 65);
      setMaxHints(c.max_hints_before_answer ?? 3);
      setAllowHumor(c.allow_humor ?? true);
      setAllowAnalogies(c.allow_analogies ?? true);
      setMuninnInstructions(c.muninn_instructions ?? "");

      const [skillsRes, goalsRes, tasksRes] = await Promise.all([
        supabase
          .from("skills")
          .select("*")
          .eq("topic_id", topicId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("learning_goals")
          .select("*")
          .eq("topic_id", topicId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("tasks")
          .select("*, skills(text)")
          .eq("topic_id", topicId)
          .order("sort_order", { ascending: true }),
      ]);

      if (cancelled) return;
      setSkills((skillsRes.data ?? []) as Skill[]);
      setGoals((goalsRes.data ?? []) as Goal[]);
      setTasks((tasksRes.data ?? []) as Task[]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [topicId, router]);

  async function syncIsCalibrated(opts: {
    theoryText?: string;
    tasksLen?: number;
  } = {}) {
    if (!topic || !topicId) return;
    const theory = opts.theoryText ?? theoryText;
    const tasksLen = opts.tasksLen ?? tasks.length;
    const next = !!theory.trim() && tasksLen > 0;
    if (next === topic.is_calibrated) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("topics")
      .update({ is_calibrated: next })
      .eq("id", topicId);
    if (!error) {
      setTopic({ ...topic, is_calibrated: next });
    }
  }

  async function saveTheory() {
    if (!calibration || savingTheory) return;
    setTheoryError(null);
    setSavingTheory(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("calibrations")
      .update({
        theory_text: theoryText,
        huginn_instructions: huginnInstructions,
        updated_at: new Date().toISOString(),
      })
      .eq("id", calibration.id);
    setSavingTheory(false);

    if (error) {
      setTheoryError("Не удалось сохранить. Попробуйте ещё раз.");
      return;
    }
    const stamp = Date.now();
    setTheorySavedAt(stamp);
    window.setTimeout(() => {
      setTheorySavedAt((current) => (current === stamp ? null : current));
    }, 2000);
    await syncIsCalibrated({ theoryText });
  }

  async function handleGenerateLesson() {
    if (!uploadedFile || !topic) return;
    setGenerating(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadedFile);
      formData.append("topicName", topic.name);
      formData.append("topicSection", topic.section);
      formData.append("grade", "10");
      formData.append("subject", "Математика");
      formData.append("topicId", topicId as string);

      const res = await fetch("/api/generate-lesson", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.error) {
        alert("Ошибка: " + data.error);
        return;
      }

      setGeneratedPlan(data.plan);
      setTheoryText(data.plan.theory);
      setHuginnInstructions(
        "ПЛАН УРОКА (следуй пошагово):\n" +
          JSON.stringify(data.plan.huginn_steps, null, 2),
      );
    } catch (err) {
      alert(
        "Ошибка генерации: " +
          (err instanceof Error ? err.message : "Неизвестная ошибка"),
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleApplyTasks() {
    if (!generatedPlan) return;
    const supabase = createClient();

    for (let i = 0; i < generatedPlan.tasks.length; i++) {
      const t = generatedPlan.tasks[i];
      await supabase.from("tasks").insert({
        topic_id: topicId,
        question: t.question,
        answer: t.answer,
        steps: t.steps || "",
        difficulty: t.difficulty,
        sort_order: tasks.length + i,
      });
    }

    const { data } = await supabase
      .from("tasks")
      .select("*, skills(text)")
      .eq("topic_id", topicId)
      .order("sort_order");
    if (data) setTasks(data as Task[]);

    alert(`Добавлено ${generatedPlan.tasks.length} задач`);
  }

  async function saveAi() {
    if (!calibration || savingAi) return;
    setAiError(null);
    setSavingAi(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("calibrations")
      .update({
        socratic_level: socraticLevel,
        max_hints_before_answer: maxHints,
        allow_humor: allowHumor,
        allow_analogies: allowAnalogies,
        muninn_instructions: muninnInstructions,
        updated_at: new Date().toISOString(),
      })
      .eq("id", calibration.id);
    setSavingAi(false);

    if (error) {
      setAiError("Не удалось сохранить. Попробуйте ещё раз.");
      return;
    }
    const stamp = Date.now();
    setAiSavedAt(stamp);
    window.setTimeout(() => {
      setAiSavedAt((current) => (current === stamp ? null : current));
    }, 2000);
  }

  function startAddingSkill() {
    setSkillDraftText("");
    setSkillDraftLevel("базовый");
    setSkillError(null);
    setAddingSkill(true);
  }

  function cancelAddingSkill() {
    if (submittingSkill) return;
    setAddingSkill(false);
    setSkillError(null);
  }

  async function handleAddSkill(e: React.FormEvent) {
    e.preventDefault();
    if (submittingSkill || !topicId) return;
    if (skillDraftText.trim().length === 0) {
      setSkillError("Укажите навык.");
      return;
    }
    setSkillError(null);
    setSubmittingSkill(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("skills")
      .insert({
        topic_id: topicId,
        text: skillDraftText.trim(),
        level: skillDraftLevel,
        sort_order: skills.length,
      })
      .select("*")
      .single();
    setSubmittingSkill(false);
    if (error || !data) {
      setSkillError("Не удалось добавить навык.");
      return;
    }
    setSkills((prev) => [...prev, data as Skill]);
    setAddingSkill(false);
  }

  async function handleDeleteSkill(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("skills").delete().eq("id", id);
    if (error) return;
    setSkills((prev) => prev.filter((s) => s.id !== id));
  }

  function startAddingGoal() {
    setGoalDraftText("");
    setGoalError(null);
    setAddingGoal(true);
  }

  function cancelAddingGoal() {
    if (submittingGoal) return;
    setAddingGoal(false);
    setGoalError(null);
  }

  async function handleAddGoal(e: React.FormEvent) {
    e.preventDefault();
    if (submittingGoal || !topicId) return;
    if (goalDraftText.trim().length === 0) {
      setGoalError("Укажите цель.");
      return;
    }
    setGoalError(null);
    setSubmittingGoal(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("learning_goals")
      .insert({
        topic_id: topicId,
        text: goalDraftText.trim(),
        sort_order: goals.length,
      })
      .select("*")
      .single();
    setSubmittingGoal(false);
    if (error || !data) {
      setGoalError("Не удалось добавить цель.");
      return;
    }
    setGoals((prev) => [...prev, data as Goal]);
    setAddingGoal(false);
  }

  async function handleDeleteGoal(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("learning_goals")
      .delete()
      .eq("id", id);
    if (error) return;
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }

  function openCreateTask() {
    setEditingTaskId(null);
    setTaskQuestion("");
    setTaskAnswer("");
    setTaskSteps("");
    setTaskDifficulty("1");
    setTaskSkillId("");
    setTaskFormError(null);
    setTaskModalOpen(true);
  }

  function openEditTask(task: Task) {
    setEditingTaskId(task.id);
    setTaskQuestion(task.question);
    setTaskAnswer(task.answer);
    setTaskSteps(task.steps ?? "");
    setTaskDifficulty(String(task.difficulty));
    setTaskSkillId(task.skill_id ?? "");
    setTaskFormError(null);
    setTaskModalOpen(true);
  }

  function closeTaskModal() {
    if (submittingTask) return;
    setTaskModalOpen(false);
  }

  async function handleSubmitTask(e: React.FormEvent) {
    e.preventDefault();
    if (submittingTask || !topicId) return;

    if (taskQuestion.trim().length === 0) {
      setTaskFormError("Укажите вопрос.");
      return;
    }
    if (taskAnswer.trim().length === 0) {
      setTaskFormError("Укажите ответ.");
      return;
    }
    const difficulty = parseInt(taskDifficulty, 10);
    if (![1, 2, 3, 4, 5].includes(difficulty)) {
      setTaskFormError("Выберите сложность от 1 до 5.");
      return;
    }

    setTaskFormError(null);
    setSubmittingTask(true);
    const supabase = createClient();

    if (editingTaskId) {
      const { data, error } = await supabase
        .from("tasks")
        .update({
          question: taskQuestion.trim(),
          answer: taskAnswer.trim(),
          steps: taskSteps.trim() || null,
          difficulty,
          skill_id: taskSkillId || null,
        })
        .eq("id", editingTaskId)
        .select("*, skills(text)")
        .single();
      setSubmittingTask(false);
      if (error || !data) {
        setTaskFormError("Не удалось сохранить задачу.");
        return;
      }
      setTasks((prev) =>
        prev.map((t) => (t.id === editingTaskId ? (data as Task) : t)),
      );
      setTaskModalOpen(false);
      return;
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        topic_id: topicId,
        skill_id: taskSkillId || null,
        question: taskQuestion.trim(),
        answer: taskAnswer.trim(),
        steps: taskSteps.trim() || null,
        difficulty,
        sort_order: tasks.length,
      })
      .select("*, skills(text)")
      .single();
    setSubmittingTask(false);
    if (error || !data) {
      setTaskFormError("Не удалось добавить задачу.");
      return;
    }
    const nextTasks = [...tasks, data as Task];
    setTasks(nextTasks);
    setTaskModalOpen(false);
    await syncIsCalibrated({ tasksLen: nextTasks.length });
  }

  async function handleDeleteTask(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) return;
    const nextTasks = tasks.filter((t) => t.id !== id);
    setTasks(nextTasks);
    await syncIsCalibrated({ tasksLen: nextTasks.length });
  }

  function truncate(s: string, n: number): string {
    return s.length > n ? `${s.slice(0, n)}…` : s;
  }

  if (loading) {
    return (
      <div>
        <Link
          href="/teacher/calibrate"
          className="text-sm text-[#A1A1AA] transition-colors hover:text-[#F4F4F5]"
        >
          ← Назад к темам
        </Link>
        <p className="mt-6 text-sm text-[#71717A]">Загружаю...</p>
      </div>
    );
  }

  if (bootstrapError || !topic || !calibration) {
    return (
      <div>
        <Link
          href="/teacher/calibrate"
          className="text-sm text-[#A1A1AA] transition-colors hover:text-[#F4F4F5]"
        >
          ← Назад к темам
        </Link>
        <p className="mt-6 text-sm text-[#EF4444]">
          {bootstrapError ?? "Не удалось загрузить тему."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <style>{`
        .corvian-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          background: #ffffff;
          border: 2px solid #8B5CF6;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
          cursor: pointer;
        }
        .corvian-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          background: #ffffff;
          border: 2px solid #8B5CF6;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
          cursor: pointer;
        }
      `}</style>

      <Link
        href="/teacher/calibrate"
        className="text-sm text-[#A1A1AA] transition-colors hover:text-[#F4F4F5]"
      >
        ← Назад к темам
      </Link>

      <div className="mt-3">
        <h1 className="text-2xl font-bold tracking-tight">{topic.name}</h1>
        <p className="mt-1 text-sm text-[#A1A1AA]">{topic.section}</p>
      </div>

      <div className="mt-6 -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <div className="flex min-w-max items-end gap-6 border-b border-[rgba(139,92,246,0.08)]">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 pb-2 text-sm transition-colors ${
                  active
                    ? "border-b-2 border-[#8B5CF6] font-medium text-[#F4F4F5]"
                    : "text-[#A1A1AA] hover:text-[#F4F4F5]"
                }`}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-5">
        {activeTab === "theory" && (
          <>
            <div className={cardClass}>
              <h2 className={blockTitleClass}>Теоретический материал</h2>
              <div className="mt-4 flex flex-col gap-4">
                {/* Блок загрузки файла */}
                <div className="rounded-xl border border-dashed border-[rgba(139,92,246,0.2)] bg-[#09070F] p-6">
                  <h4 className="mb-3 text-sm font-semibold text-[#F4F4F5]">
                    📄 Загрузить материал и сгенерировать план урока
                  </h4>
                  <p className="mb-4 text-xs text-[#71717A]">
                    Загрузите PDF учебника, презентацию или фото конспекта — AI
                    создаст теорию, вопросы и задачи
                  </p>

                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer rounded-lg border border-[rgba(139,92,246,0.15)] bg-[#0F0D17] px-4 py-2 text-sm text-[#A1A1AA] transition-colors hover:border-[rgba(139,92,246,0.25)] hover:text-[#F4F4F5]">
                      {uploadedFile ? uploadedFile.name : "Выбрать файл"}
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.pptx"
                        className="hidden"
                        onChange={(e) =>
                          setUploadedFile(e.target.files?.[0] ?? null)
                        }
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleGenerateLesson}
                      disabled={!uploadedFile || generating}
                      className="rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#8B5CF6] px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
                    >
                      {generating
                        ? "Генерирую план урока..."
                        : "✨ Сгенерировать"}
                    </button>
                  </div>

                  {uploadedFile && (
                    <p className="mt-2 text-xs text-[#52525B]">
                      {(uploadedFile.size / 1024 / 1024).toFixed(1)} MB ·{" "}
                      {uploadedFile.type}
                    </p>
                  )}
                </div>

                {/* Результат генерации */}
                {generatedPlan && (
                  <div className="rounded-xl border border-[rgba(139,92,246,0.15)] bg-[#0F0D17] p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-[#F4F4F5]">
                          ✅ План сгенерирован
                        </p>
                        <p className="text-xs text-[#71717A]">
                          Теория заполнена ·{" "}
                          {generatedPlan.huginn_steps.length} шагов для Хугина ·{" "}
                          {generatedPlan.tasks.length} задач для Мунина
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleApplyTasks}
                        className="rounded-lg border border-[rgba(139,92,246,0.15)] bg-[#181525] px-3 py-1.5 text-xs font-medium text-[#8B5CF6] transition-colors hover:bg-[rgba(139,92,246,0.1)]"
                      >
                        Добавить задачи в Мунина
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="theory-text"
                    className="text-sm font-medium text-[#A1A1AA]"
                  >
                    Текст теории
                  </label>
                  <p className={blockHintClass}>
                    Поддерживается Markdown и LaTeX ($формула$)
                  </p>
                  <textarea
                    id="theory-text"
                    value={theoryText}
                    onChange={(e) => setTheoryText(e.target.value)}
                    placeholder="Введите теоретический материал по теме..."
                    className={`${textareaClass} mt-2 min-h-[200px] resize-y`}
                  />
                </div>
              </div>
            </div>

            <div className={cardClass}>
              <h2 className={blockTitleClass}>Инструкции для Хугина</h2>
              <p className={blockHintClass}>
                Специфические указания для AI-тьютора по теории
              </p>
              <div className="mt-4">
                <label
                  htmlFor="huginn-instructions"
                  className="text-sm font-medium text-[#A1A1AA]"
                >
                  Как Хугин должен объяснять эту тему
                </label>
                <textarea
                  id="huginn-instructions"
                  value={huginnInstructions}
                  onChange={(e) => setHuginnInstructions(e.target.value)}
                  placeholder="Например: начни с примера из реальной жизни, используй аналогию с маятником..."
                  className={`${textareaClass} mt-2 min-h-[120px] resize-y`}
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                {theoryError && (
                  <span className="text-sm text-[#EF4444]">{theoryError}</span>
                )}
                {theorySavedAt && (
                  <span className="text-sm text-[#22C55E]">Сохранено ✓</span>
                )}
                <button
                  type="button"
                  onClick={saveTheory}
                  disabled={savingTheory}
                  className={primaryBtnClass}
                >
                  {savingTheory ? "Сохраняю..." : "Сохранить теорию"}
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === "skills" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Skills */}
            <div className={cardClass}>
              <div className="flex items-center justify-between gap-4">
                <h2 className={blockTitleClass}>Навыки</h2>
                {!addingSkill && (
                  <button
                    type="button"
                    onClick={startAddingSkill}
                    className={ghostBtnClass}
                  >
                    + Добавить
                  </button>
                )}
              </div>

              {skills.length === 0 ? (
                <p className="mt-5 py-5 text-center text-sm text-[#71717A]">
                  Нет навыков
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-[rgba(139,92,246,0.08)]">
                  {skills.map((skill) => (
                    <li
                      key={skill.id}
                      className="flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-[#141220]"
                    >
                      <span className="flex-1 text-sm text-[#F4F4F5]">
                        {skill.text}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-[0.6rem] py-[0.2rem] text-xs font-semibold ${
                          SKILL_LEVEL_STYLES[skill.level] ??
                          SKILL_LEVEL_STYLES.базовый
                        }`}
                      >
                        {skill.level}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteSkill(skill.id)}
                        aria-label="Удалить навык"
                        className="rounded-md p-1 text-[#52525B] transition-colors hover:bg-[rgba(239,68,68,0.1)] hover:text-[#EF4444]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {addingSkill && (
                <form
                  onSubmit={handleAddSkill}
                  className="mt-4 flex flex-col gap-3 rounded-lg border border-[rgba(139,92,246,0.15)] bg-[#181525] p-4"
                >
                  <div>
                    <label
                      htmlFor="skill-text"
                      className={labelClass}
                    >
                      Навык
                    </label>
                    <input
                      id="skill-text"
                      type="text"
                      value={skillDraftText}
                      onChange={(e) => setSkillDraftText(e.target.value)}
                      placeholder="Например: находить синус угла"
                      autoFocus
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="skill-level" className={labelClass}>
                      Уровень
                    </label>
                    <select
                      id="skill-level"
                      value={skillDraftLevel}
                      onChange={(e) =>
                        setSkillDraftLevel(e.target.value as SkillLevel)
                      }
                      className={`${inputClass} appearance-none bg-[length:16px] bg-[right_0.85rem_center] bg-no-repeat pr-10`}
                      style={selectChevronStyle}
                    >
                      {SKILL_LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {lvl}
                        </option>
                      ))}
                    </select>
                  </div>
                  {skillError && (
                    <p className="text-sm text-[#EF4444]">{skillError}</p>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelAddingSkill}
                      className={ghostBtnClass}
                      disabled={submittingSkill}
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={submittingSkill}
                      className={primarySmallBtnClass}
                    >
                      {submittingSkill ? "Добавляю..." : "Добавить"}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Goals */}
            <div className={cardClass}>
              <div className="flex items-center justify-between gap-4">
                <h2 className={blockTitleClass}>Цели обучения</h2>
                {!addingGoal && (
                  <button
                    type="button"
                    onClick={startAddingGoal}
                    className={ghostBtnClass}
                  >
                    + Добавить
                  </button>
                )}
              </div>

              {goals.length === 0 ? (
                <p className="mt-5 py-5 text-center text-sm text-[#71717A]">
                  Нет целей
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-[rgba(139,92,246,0.08)]">
                  {goals.map((goal) => (
                    <li
                      key={goal.id}
                      className="flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-[#141220]"
                    >
                      <span className="flex-1 text-sm text-[#F4F4F5]">
                        {goal.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteGoal(goal.id)}
                        aria-label="Удалить цель"
                        className="rounded-md p-1 text-[#52525B] transition-colors hover:bg-[rgba(239,68,68,0.1)] hover:text-[#EF4444]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {addingGoal && (
                <form
                  onSubmit={handleAddGoal}
                  className="mt-4 flex flex-col gap-3 rounded-lg border border-[rgba(139,92,246,0.15)] bg-[#181525] p-4"
                >
                  <div>
                    <label htmlFor="goal-text" className={labelClass}>
                      Цель
                    </label>
                    <input
                      id="goal-text"
                      type="text"
                      value={goalDraftText}
                      onChange={(e) => setGoalDraftText(e.target.value)}
                      placeholder="Например: ученик понимает связь синуса с единичной окружностью"
                      autoFocus
                      className={inputClass}
                    />
                  </div>
                  {goalError && (
                    <p className="text-sm text-[#EF4444]">{goalError}</p>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelAddingGoal}
                      className={ghostBtnClass}
                      disabled={submittingGoal}
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={submittingGoal}
                      className={primarySmallBtnClass}
                    >
                      {submittingGoal ? "Добавляю..." : "Добавить"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {activeTab === "tasks" && (
          <div className={cardClass}>
            <div className="flex items-center justify-between gap-4">
              <h2 className={blockTitleClass}>Задачи</h2>
              <button
                type="button"
                onClick={openCreateTask}
                className={ghostBtnClass}
              >
                + Добавить задачу
              </button>
            </div>

            {tasks.length === 0 ? (
              <p className="mt-5 py-8 text-center text-sm text-[#71717A]">
                Нет задач. Добавьте задачи для тренировки с Мунином.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-[rgba(139,92,246,0.08)]">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center gap-4 rounded-md px-2 py-3 transition-colors hover:bg-[#141220]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#F4F4F5]">
                        {truncate(task.question, 100)}
                      </p>
                      {task.skills?.text && (
                        <p className="mt-0.5 truncate text-xs text-[#71717A]">
                          {task.skills.text}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-[0.6rem] py-[0.2rem] text-xs font-semibold ${difficultyStyle(
                        task.difficulty,
                      )}`}
                      title="Сложность"
                    >
                      {task.difficulty}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditTask(task)}
                        aria-label="Редактировать задачу"
                        className="rounded-md p-1 text-[#71717A] transition-colors hover:bg-[rgba(139,92,246,0.1)] hover:text-[#F4F4F5]"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(task.id)}
                        aria-label="Удалить задачу"
                        className="rounded-md p-1 text-[#52525B] transition-colors hover:bg-[rgba(239,68,68,0.1)] hover:text-[#EF4444]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === "ai" && (
          <>
            <div className={cardClass}>
              <h2 className={blockTitleClass}>
                Строгость сократического метода
              </h2>
              <p className={blockHintClass}>
                0 = свободное объяснение, 100 = только вопросы
              </p>
              <div className="mt-4">
                <Slider
                  id="socratic-level"
                  min={0}
                  max={100}
                  step={5}
                  value={socraticLevel}
                  onChange={setSocraticLevel}
                />
              </div>
            </div>

            <div className={cardClass}>
              <h2 className={blockTitleClass}>Максимум подсказок до ответа</h2>
              <p className={blockHintClass}>
                Сколько наводящих вопросов задаст Мунин перед тем как показать
                решение
              </p>
              <div className="mt-4">
                <Slider
                  id="max-hints"
                  min={1}
                  max={10}
                  step={1}
                  value={maxHints}
                  onChange={setMaxHints}
                />
              </div>
            </div>

            <div className={cardClass}>
              <h2 className={blockTitleClass}>Поведение AI</h2>
              <ul className="mt-4 flex flex-col gap-4">
                <li className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-[#F4F4F5]">
                      Разрешить юмор и шутки
                    </p>
                    <p className={blockHintClass}>
                      Лёгкая ирония над предметом, не над учеником
                    </p>
                  </div>
                  <Toggle
                    checked={allowHumor}
                    onChange={setAllowHumor}
                    label="Разрешить юмор и шутки"
                  />
                </li>
                <li className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-[#F4F4F5]">
                      Разрешить аналогии из жизни
                    </p>
                    <p className={blockHintClass}>
                      Бытовые сравнения для объяснения абстрактных понятий
                    </p>
                  </div>
                  <Toggle
                    checked={allowAnalogies}
                    onChange={setAllowAnalogies}
                    label="Разрешить аналогии из жизни"
                  />
                </li>
              </ul>
            </div>

            <div className={cardClass}>
              <h2 className={blockTitleClass}>Инструкции для Мунина</h2>
              <p className={blockHintClass}>
                Специфические указания для AI-тьютора по практике
              </p>
              <div className="mt-4">
                <label
                  htmlFor="muninn-instructions"
                  className="text-sm font-medium text-[#A1A1AA]"
                >
                  Как Мунин должен вести практику
                </label>
                <textarea
                  id="muninn-instructions"
                  value={muninnInstructions}
                  onChange={(e) => setMuninnInstructions(e.target.value)}
                  placeholder="Например: давай задачи в порядке сложности, хвали за попытки..."
                  className={`${textareaClass} mt-2 min-h-[120px] resize-y`}
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                {aiError && (
                  <span className="text-sm text-[#EF4444]">{aiError}</span>
                )}
                {aiSavedAt && (
                  <span className="text-sm text-[#22C55E]">Сохранено ✓</span>
                )}
                <button
                  type="button"
                  onClick={saveAi}
                  disabled={savingAi}
                  className={primaryBtnClass}
                >
                  {savingAi ? "Сохраняю..." : "Сохранить настройки"}
                </button>
              </div>

              <button
                type="button"
                onClick={async () => {
                  await saveAi();
                  router.push("/teacher/calibrate");
                }}
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-[#059669] to-[#10B981] px-6 py-3 text-base font-semibold text-white transition-opacity hover:opacity-90"
              >
                ✅ Завершить калибровку
              </button>
            </div>
          </>
        )}
      </div>

      {taskModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeTaskModal}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-[rgba(139,92,246,0.15)] bg-[#181525] p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-modal-title"
          >
            <div className="flex items-start justify-between gap-4">
              <h2
                id="task-modal-title"
                className="text-lg font-semibold text-[#F4F4F5]"
              >
                {editingTaskId ? "Редактировать задачу" : "Новая задача"}
              </h2>
              <button
                type="button"
                onClick={closeTaskModal}
                aria-label="Закрыть"
                className="-m-1 rounded-lg p-1 text-[#A1A1AA] transition-colors hover:bg-[rgba(139,92,246,0.05)] hover:text-[#F4F4F5]"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitTask} className="mt-6 flex flex-col gap-4">
              <div>
                <label htmlFor="task-question" className={labelClass}>
                  Вопрос
                </label>
                <p className={blockHintClass}>
                  Поддерживается LaTeX: $sin(30°) = ?$
                </p>
                <textarea
                  id="task-question"
                  value={taskQuestion}
                  onChange={(e) => setTaskQuestion(e.target.value)}
                  placeholder="Найдите значение sin(30°)"
                  className={`${textareaClass} mt-2 min-h-[100px] resize-y`}
                />
              </div>

              <div>
                <label htmlFor="task-answer" className={labelClass}>
                  Ответ
                </label>
                <textarea
                  id="task-answer"
                  value={taskAnswer}
                  onChange={(e) => setTaskAnswer(e.target.value)}
                  placeholder="0.5"
                  className={`${textareaClass} min-h-[60px] resize-y`}
                />
              </div>

              <div>
                <label htmlFor="task-steps" className={labelClass}>
                  Пошаговое решение (необязательно)
                </label>
                <textarea
                  id="task-steps"
                  value={taskSteps}
                  onChange={(e) => setTaskSteps(e.target.value)}
                  placeholder="Шаг 1: ..."
                  className={`${textareaClass} min-h-[100px] resize-y`}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="task-difficulty" className={labelClass}>
                    Сложность
                  </label>
                  <select
                    id="task-difficulty"
                    value={taskDifficulty}
                    onChange={(e) => setTaskDifficulty(e.target.value)}
                    className={`${inputClass} appearance-none bg-[length:16px] bg-[right_0.85rem_center] bg-no-repeat pr-10`}
                    style={selectChevronStyle}
                  >
                    {[1, 2, 3, 4, 5].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="task-skill" className={labelClass}>
                    Навык
                  </label>
                  <select
                    id="task-skill"
                    value={taskSkillId}
                    onChange={(e) => setTaskSkillId(e.target.value)}
                    className={`${inputClass} appearance-none bg-[length:16px] bg-[right_0.85rem_center] bg-no-repeat pr-10`}
                    style={selectChevronStyle}
                  >
                    <option value="">Без привязки</option>
                    {skills.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.text}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {taskFormError && (
                <p className="text-sm text-[#EF4444]">{taskFormError}</p>
              )}

              <button
                type="submit"
                disabled={submittingTask}
                className={`${primaryBtnClass} mt-2 w-full`}
              >
                {submittingTask ? "Сохраняю..." : "Сохранить задачу"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
