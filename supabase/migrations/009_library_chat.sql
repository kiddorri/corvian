-- ========================================
-- LIBRARY CHAT: чат-сессии для общедоступной библиотеки
-- ========================================

CREATE TABLE library_chat_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_student_id  UUID NOT NULL REFERENCES library_students(id) ON DELETE CASCADE,
  library_topic_id    UUID NOT NULL REFERENCES library_topics(id)   ON DELETE CASCADE,
  raven               TEXT NOT NULL CHECK (raven IN ('huginn','muninn')),
  started_at          TIMESTAMPTZ DEFAULT NOW(),
  ended_at            TIMESTAMPTZ,
  summary             TEXT,
  score               INT,
  current_step_type   TEXT,
  current_step_id     UUID,
  step_index          INT DEFAULT 0,
  step_status         TEXT DEFAULT 'pending'
);

CREATE INDEX idx_library_chat_sessions_student_topic
  ON library_chat_sessions(library_student_id, library_topic_id, started_at DESC);

CREATE TABLE library_chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES library_chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_library_chat_messages_session
  ON library_chat_messages(session_id, created_at ASC);

CREATE TABLE library_goal_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES library_chat_sessions(id) ON DELETE CASCADE,
  goal_id       UUID NOT NULL REFERENCES library_goals(id)         ON DELETE CASCADE,
  status        TEXT DEFAULT 'pending',
  completed_at  TIMESTAMPTZ,
  UNIQUE(session_id, goal_id)
);

CREATE TABLE library_task_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES library_chat_sessions(id) ON DELETE CASCADE,
  task_id       UUID NOT NULL REFERENCES library_tasks(id)         ON DELETE CASCADE,
  status        TEXT DEFAULT 'pending',
  attempts      INT  DEFAULT 0,
  hints_given   INT  DEFAULT 0,
  completed_at  TIMESTAMPTZ,
  UNIQUE(session_id, task_id)
);

-- RLS — доступ через service_role на сервере, никаких public policies
ALTER TABLE library_chat_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_chat_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_goal_progress  ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_task_progress  ENABLE ROW LEVEL SECURITY;
