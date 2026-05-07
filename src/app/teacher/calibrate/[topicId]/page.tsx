"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  BookOpen,
  Bot,
  ClipboardList,
  Target,
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

type TabKey = "theory" | "skills" | "tasks" | "ai";

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "theory", label: "Теория", icon: BookOpen },
  { key: "skills", label: "Навыки и цели", icon: Target },
  { key: "tasks", label: "Задачи", icon: ClipboardList },
  { key: "ai", label: "Настройки AI", icon: Bot },
];

const textareaClass =
  "w-full rounded-lg border border-[rgba(139,92,246,0.08)] bg-[#09070F] px-[0.85rem] py-[0.65rem] text-sm leading-[1.6] text-[#F4F4F5] placeholder:text-[#52525B] focus:border-[rgba(139,92,246,0.25)] focus:outline-none";
const cardClass =
  "rounded-xl border border-[rgba(139,92,246,0.08)] bg-[#0F0D17] p-6";
const blockTitleClass = "text-base font-semibold text-[#F4F4F5]";
const blockHintClass = "mt-1 text-xs text-[#71717A]";
const primaryBtnClass =
  "inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C3AED,#8B5CF6)] px-8 py-[0.85rem] text-base font-medium text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]";

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

  // Tab 4 (AI settings) state
  const [socraticLevel, setSocraticLevel] = useState(65);
  const [maxHints, setMaxHints] = useState(3);
  const [allowHumor, setAllowHumor] = useState(true);
  const [allowAnalogies, setAllowAnalogies] = useState(true);
  const [muninnInstructions, setMuninnInstructions] = useState("");
  const [savingAi, setSavingAi] = useState(false);
  const [aiSavedAt, setAiSavedAt] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

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
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [topicId, router]);

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
          <div className={cardClass}>
            <p className="text-sm text-[#A1A1AA]">В разработке</p>
          </div>
        )}

        {activeTab === "tasks" && (
          <div className={cardClass}>
            <p className="text-sm text-[#A1A1AA]">В разработке</p>
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
