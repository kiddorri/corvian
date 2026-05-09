-- Прогресс по отдельным целям
CREATE TABLE goal_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  goal_id uuid REFERENCES learning_goals(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(student_id, goal_id)
);

-- RLS
ALTER TABLE goal_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Goal progress: public read" ON goal_progress
  FOR SELECT USING (true);

CREATE POLICY "Goal progress: public insert" ON goal_progress
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Goal progress: public update" ON goal_progress
  FOR UPDATE USING (true);
