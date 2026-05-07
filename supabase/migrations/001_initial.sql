-- Учителя
create table teachers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  full_name text not null,
  school text,
  subject text,
  created_at timestamptz default now()
);

-- Классы
create table classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references teachers(id),
  name text not null,
  code char(7) unique not null,
  grade int not null,
  subject text not null,
  is_open boolean default true,
  created_at timestamptz default now()
);

-- Ученики
create table students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id),
  display_name text not null,
  xp int default 0,
  streak_days int default 0,
  streak_last_date date,
  created_at timestamptz default now()
);

-- Темы
create table topics (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id),
  section text not null,
  name text not null,
  sort_order int default 0,
  is_calibrated boolean default false,
  created_at timestamptz default now()
);

-- Калибровка
create table calibrations (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics(id) unique,
  theory_text text,
  theory_files jsonb default '[]',
  huginn_instructions text,
  muninn_instructions text,
  socratic_level int default 65,
  max_hints_before_answer int default 3,
  allow_humor boolean default true,
  allow_analogies boolean default true,
  updated_at timestamptz default now()
);

-- Навыки
create table skills (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics(id),
  text text not null,
  level text default 'базовый',
  sort_order int default 0
);

-- Цели обучения
create table learning_goals (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics(id),
  text text not null,
  sort_order int default 0
);

-- Задачи
create table tasks (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics(id),
  skill_id uuid references skills(id),
  question text not null,
  answer text not null,
  steps text,
  difficulty int default 1,
  sort_order int default 0
);

-- Сессии чата
create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id),
  topic_id uuid references topics(id),
  raven text not null,
  started_at timestamptz default now(),
  ended_at timestamptz,
  summary text,
  score int
);

-- Сообщения чата
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references chat_sessions(id),
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

-- Прогресс ученика
create table student_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id),
  topic_id uuid references topics(id),
  status text default 'not_started',
  score int,
  time_spent_minutes int default 0,
  attempts int default 0,
  last_session_at timestamptz,
  unique(student_id, topic_id)
);

-- RLS
alter table teachers enable row level security;
alter table classes enable row level security;
alter table students enable row level security;
alter table topics enable row level security;
alter table calibrations enable row level security;
alter table skills enable row level security;
alter table learning_goals enable row level security;
alter table tasks enable row level security;
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;
alter table student_progress enable row level security;
