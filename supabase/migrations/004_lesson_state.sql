-- Lesson state machine: per-session progression and per-step tracking

-- 1. Расширяем chat_sessions информацией о текущем шаге урока
ALTER TABLE chat_sessions
  ADD COLUMN current_step_type text,
  ADD COLUMN current_step_id uuid,
  ADD COLUMN step_index int DEFAULT 0,
  ADD COLUMN step_status text DEFAULT 'pending';

COMMENT ON COLUMN chat_sessions.current_step_type IS 'goal or task';
COMMENT ON COLUMN chat_sessions.current_step_id IS 'FK to learning_goals.id or tasks.id';
COMMENT ON COLUMN chat_sessions.step_index IS 'Sequential step number (0-based)';
COMMENT ON COLUMN chat_sessions.step_status IS 'pending, teaching, answered_correct, answered_wrong, completed';

-- 2. Прогресс по задачам в рамках одной сессии Мунина
CREATE TABLE task_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES chat_sessions(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  status text DEFAULT 'pending',
  attempts int DEFAULT 0,
  hints_given int DEFAULT 0,
  completed_at timestamptz,
  UNIQUE(session_id, task_id)
);

COMMENT ON TABLE task_progress IS 'Tracks per-task progress within a Muninn session';

-- 3. Прогресс по целям в рамках одной сессии Хугина
CREATE TABLE goal_step_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES chat_sessions(id) ON DELETE CASCADE,
  goal_id uuid REFERENCES learning_goals(id) ON DELETE CASCADE,
  status text DEFAULT 'pending',
  completed_at timestamptz,
  UNIQUE(session_id, goal_id)
);

COMMENT ON TABLE goal_step_progress IS 'Tracks per-goal progress within a Huginn session';

-- 4. RLS — публичный доступ как в остальном MVP
ALTER TABLE task_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_progress_all" ON task_progress FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE goal_step_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goal_step_progress_all" ON goal_step_progress FOR ALL USING (true) WITH CHECK (true);
