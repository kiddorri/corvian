-- Структурированные шаги Хугина (вместо склейки в calibrations.huginn_instructions)
CREATE TABLE huginn_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES learning_goals(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  explanation TEXT NOT NULL,
  check_question TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  hint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_huginn_steps_goal ON huginn_steps(goal_id, sort_order);
ALTER TABLE huginn_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read huginn_steps" ON huginn_steps FOR SELECT USING (true);

-- Шаблон для вариаций задач (математика)
ALTER TABLE tasks ADD COLUMN template TEXT;
ALTER TABLE tasks ADD COLUMN params JSONB;
ALTER TABLE tasks ADD COLUMN answer_formula TEXT;
