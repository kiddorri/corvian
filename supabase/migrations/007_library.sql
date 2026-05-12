-- ========================================
-- LIBRARY: общедоступная библиотека тем
-- ========================================

-- Предметы по классам (Математика 10 класс, Физика 9 класс и т.д.)
CREATE TABLE library_subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  grade       INT  NOT NULL,
  icon        TEXT DEFAULT '📚',
  description TEXT,
  sort_order  INT  DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, grade)
);

-- Темы внутри предмета (с указанием раздела)
CREATE TABLE library_topics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id  UUID NOT NULL REFERENCES library_subjects(id) ON DELETE CASCADE,
  section     TEXT NOT NULL,
  name        TEXT NOT NULL,
  sort_order  INT  DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Калибровка темы (теория + общие настройки)
CREATE TABLE library_calibrations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id                 UUID NOT NULL UNIQUE REFERENCES library_topics(id) ON DELETE CASCADE,
  theory_text              TEXT DEFAULT '',
  huginn_instructions      TEXT DEFAULT '',
  muninn_instructions      TEXT DEFAULT '',
  socratic_level           INT  DEFAULT 50,
  max_hints_before_answer  INT  DEFAULT 3,
  allow_humor              BOOLEAN DEFAULT TRUE,
  allow_analogies          BOOLEAN DEFAULT TRUE,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Цели обучения темы
CREATE TABLE library_goals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id    UUID NOT NULL REFERENCES library_topics(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  sort_order  INT  DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Микро-шаги Хугина (привязаны к целям)
CREATE TABLE library_huginn_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id        UUID NOT NULL REFERENCES library_topics(id) ON DELETE CASCADE,
  goal_id         UUID NOT NULL REFERENCES library_goals(id)  ON DELETE CASCADE,
  sort_order      INT  NOT NULL DEFAULT 0,
  explanation     TEXT NOT NULL,
  check_question  TEXT NOT NULL,
  correct_answer  TEXT NOT NULL,
  hint            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Задачи Мунина (с шаблонами для вариаций)
CREATE TABLE library_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id        UUID NOT NULL REFERENCES library_topics(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  answer          TEXT NOT NULL,
  steps           TEXT,
  difficulty      INT  DEFAULT 1,
  sort_order      INT  DEFAULT 0,
  template        TEXT,
  params          JSONB,
  answer_formula  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для производительности
CREATE INDEX idx_library_topics_subject       ON library_topics(subject_id, sort_order);
CREATE INDEX idx_library_goals_topic          ON library_goals(topic_id, sort_order);
CREATE INDEX idx_library_huginn_steps_goal    ON library_huginn_steps(goal_id, sort_order);
CREATE INDEX idx_library_huginn_steps_topic   ON library_huginn_steps(topic_id);
CREATE INDEX idx_library_tasks_topic          ON library_tasks(topic_id, sort_order);
CREATE INDEX idx_library_tasks_difficulty     ON library_tasks(topic_id, difficulty);

-- ========================================
-- RLS: библиотека READ-ONLY для всех (включая anon)
-- ========================================

ALTER TABLE library_subjects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_topics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_calibrations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_goals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_huginn_steps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_tasks          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read library_subjects"      ON library_subjects      FOR SELECT USING (TRUE);
CREATE POLICY "Public read library_topics"        ON library_topics        FOR SELECT USING (TRUE);
CREATE POLICY "Public read library_calibrations"  ON library_calibrations  FOR SELECT USING (TRUE);
CREATE POLICY "Public read library_goals"         ON library_goals         FOR SELECT USING (TRUE);
CREATE POLICY "Public read library_huginn_steps"  ON library_huginn_steps  FOR SELECT USING (TRUE);
CREATE POLICY "Public read library_tasks"         ON library_tasks         FOR SELECT USING (TRUE);

-- Запись только через service_role (используется на сервере для админ-загрузки).
-- RLS политики на INSERT/UPDATE/DELETE намеренно НЕ создаём — service_role их обходит.
