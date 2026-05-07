CLAUDE.md — Corvian
Читай этот файл целиком перед началом работы. Он содержит всё: архитектуру, схему БД, спецификации каждого экрана, system prompts для AI и правила разработки.
Читай DESIGN.md для палитры, типографики и компонентных правил.
Что это
Corvian — AI-тьютор для учеников 6–12 классов НИШ, КТЛ, РФМШ. Два ворона: Хугин (теория через сократический диалог) и Мунин (практика на задачах). Учителя калибруют AI. Интерфейс на русском.
Стек

* Frontend: Next.js 14+ (App Router), React, TypeScript
* Стилизация: Tailwind CSS + shadcn/ui (Radix)
* БД: Supabase (PostgreSQL + Auth + Realtime)
* AI: Anthropic Claude API — Haiku для чата, Sonnet для генерации/анализа
* Деплой: Vercel
* Математика: KaTeX
* PWA: next-pwa или Serwist
Переменные окружения

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
TEACHER_INVITE_CODE=PROJECTCORVINUS

```

Структура проекта

```
corvian/
├── README.md
├── CLAUDE.md
├── DESIGN.md
├── .env.local
├── .env.example
├── src/
│   ├── app/
│   │   ├── layout.tsx            # root layout, шрифты, тёмная тема
│   │   ├── page.tsx              # лендинг: "Я ученик" / "Я учитель"
│   │   ├── join/
│   │   │   └── page.tsx          # ученик: ввод кода класса + никнейм
│   │   ├── register/
│   │   │   └── page.tsx          # учитель: регистрация + кодовое слово
│   │   ├── student/
│   │   │   ├── layout.tsx        # layout (bottom nav мобайл, sidebar десктоп)
│   │   │   ├── page.tsx          # главная: продолжить, цель, быстрые действия
│   │   │   ├── path/
│   │   │   │   └── page.tsx      # обучающая дорожка
│   │   │   ├── chat/
│   │   │   │   └── [topicId]/
│   │   │   │       └── page.tsx  # чат с Хугином/Мунином
│   │   │   ├── library/
│   │   │   │   └── page.tsx      # библиотека тем
│   │   │   └── profile/
│   │   │       └── page.tsx      # профиль: XP, стрик, прогресс
│   │   ├── teacher/
│   │   │   ├── layout.tsx        # layout (sidebar)
│   │   │   ├── page.tsx          # обзор класса
│   │   │   ├── classes/
│   │   │   │   └── page.tsx      # управление классами
│   │   │   ├── calibrate/
│   │   │   │   └── [topicId]/
│   │   │   │       └── page.tsx  # калибровка темы
│   │   │   ├── interventions/
│   │   │   │   └── page.tsx      # граф интервенций
│   │   │   ├── misconceptions/
│   │   │   │   └── page.tsx      # анализ заблуждений
│   │   │   ├── library/
│   │   │   │   └── page.tsx      # библиотека тем
│   │   │   └── insights/
│   │   │       └── page.tsx      # AI-инсайты
│   │   └── api/
│   │       ├── chat/
│   │       │   └── route.ts      # streaming chat (Claude API)
│   │       ├── generate/
│   │       │   └── route.ts      # генерация контента (Sonnet)
│   │       ├── join/
│   │       │   └── route.ts      # присоединение к классу
│   │       └── auth/
│   │           └── route.ts
│   ├── components/
│   │   ├── ui/                   # shadcn/ui
│   │   ├── chat/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── TypingIndicator.tsx
│   │   │   └── RavenAvatar.tsx
│   │   ├── student/
│   │   │   ├── LearningPath.tsx
│   │   │   ├── PathNode.tsx
│   │   │   ├── ContinueCard.tsx
│   │   │   ├── DailyGoal.tsx
│   │   │   ├── TopicCard.tsx
│   │   │   ├── SessionResult.tsx
│   │   │   ├── RavenTransition.tsx
│   │   │   ├── StreakBadge.tsx
│   │   │   ├── XPCounter.tsx
│   │   │   └── LevelBadge.tsx
│   │   ├── teacher/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── StatTile.tsx
│   │   │   ├── InterventionGraph.tsx
│   │   │   ├── TheoryUpload.tsx
│   │   │   ├── SkillsList.tsx
│   │   │   ├── GoalsList.tsx
│   │   │   ├── TaskEditor.tsx
│   │   │   ├── MuninnInstructions.tsx
│   │   │   ├── StudentPanel.tsx
│   │   │   └── MisconceptionChart.tsx
│   │   └── shared/
│   │       ├── UploadZone.tsx
│   │       ├── KaTeXRenderer.tsx
│   │       └── ClassCodeInput.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   └── middleware.ts
│   │   ├── claude/
│   │   │   ├── client.ts
│   │   │   ├── huginn.ts
│   │   │   ├── muninn.ts
│   │   │   └── prompts.ts
│   │   └── utils/
│   │       ├── classCode.ts
│   │       └── scoring.ts
│   ├── types/
│   │   └── index.ts
│   └── styles/
│       └── globals.css
├── supabase/
│   └── migrations/
│       └── 001_initial.sql
└── public/
    ├── manifest.json
    └── icons/

```

Схема базы данных

```sql
create table teachers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  full_name text not null,
  school text,
  subject text,
  created_at timestamptz default now()
);

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

create table students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id),
  display_name text not null,
  xp int default 0,
  streak_days int default 0,
  streak_last_date date,
  created_at timestamptz default now()
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id),
  section text not null,
  name text not null,
  sort_order int default 0,
  is_calibrated boolean default false,
  created_at timestamptz default now()
);

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

create table skills (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics(id),
  text text not null,
  level text default 'базовый',
  sort_order int default 0
);

create table learning_goals (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics(id),
  text text not null,
  sort_order int default 0
);

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

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references chat_sessions(id),
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

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

```

Фазы разработки
Фаза 1: Скелет (дни 1–3)

1. `npx create-next-app@latest corvian --typescript --tailwind --app --src-dir`
2. Установить shadcn/ui, тёмная тема
3. Supabase Auth, миграция БД
4. Root layout: шрифты, CSS-переменные из DESIGN.md
Фаза 2: Точка входа (дни 3–5)
Лендинг `/`: Логотип 🪶 corvian. «Два ворона. Один результат.» Две кнопки: «Я ученик» → `/join`, «Я учитель» → `/register`. Тёмный фон, фиолетовый glow. Больше ничего.
Вход ученика `/join`: Шаг 1: поле кода (KRS-XXX), валидация через БД. Шаг 2: никнейм. Действие: создать students → localStorage → `/student`.
Регистрация учителя `/register`: ФИО, школа, предмет, email, пароль, код приглашения. Код === PROJECTCORVINUS (case-insensitive). Действие: Supabase Auth → teachers → `/teacher`.
Фаза 3: Дашборд ученика (дни 5–8)
Layout: мобайл — bottom nav 56px (Главная, Путь, Библиотека, Профиль). Десктоп — сайдбар. Шапка: логотип, 🔥 стрик, ⚡ XP.
Главная: hero-карточка «Продолжить» (тема, прогресс, ворон). Цель на сегодня (3 задачи → стрик). Быстрые действия.
Дорожка: вертикальный путь. ✓ зелёный, ◉ фиолетовый пульсирующий, 🔒 серый.
Библиотека: карточки по разделам, фильтры, поиск. Только is_calibrated=true.
Профиль: XP + уровень, стрик + рекорд, прогресс по темам, бейджи (v2).
Фаза 4: Чат (дни 8–13)
API `/api/chat`: streaming через Claude Haiku. Загружает калибровку, собирает system prompt, стримит ReadableStream, сохраняет в chat_messages.
Чат `/student/chat/[topicId]`: полноэкранный мобайл, 700px десктоп. Шапка: ворон + тема + фаза. Пузыри: ворон слева, ученик справа. KaTeX, typing, автоскролл, streaming.
Поток:

```
СТАРТ → калибровка → есть сессия Хугина?
  Нет → ХУГИН (теория, диалог, "Мунин ждёт") → summary (Sonnet)
  → ПЕРЕХОД (анимация 2-3с)
  → МУНИН (задачи по одной, все решены)
  → ИТОГ (балл, XP, стрик, навыки, кнопки)

```

Фаза 5: Дашборд учителя (дни 13–18)
Сайдбар: Обзор, Классы, Калибровка, Интервенции, Заблуждения, Библиотека, AI-инсайты.
Обзор: 4 тайла + лента событий.
Классы: список с кодами, создание, QR.
Калибровка: дерево тем слева, справа 4 блока:

* Теория: текст + файлы + «Сгенерировать» + инструкции Хугину
* Навыки: CRUD + уровни + загрузка + «Определить по теории»
* Цели: CRUD + загрузка + «Сформулировать из навыков»
* Задачи: карточки условие/ответ/решение/сложность + загрузка + «Сгенерировать»
* Инструкции Мунину: ползунок строгости, max подсказок, тогглы, текст
Интервенции: scatter plot время×балл, 4 квадранта, фильтры, таблица + рекомендации AI.
Заблуждения: бары ошибок, тоггл «только ошибки», AI-анализ + «Применить».
Библиотека: сетка по разделам, прогресс калибровки.
AI-инсайты: дайджест: освоено, пробелы, что изменить + «Применить».
Профиль ученика: выдвижная панель: балл, время, стрик, сессии с резюме.
Фаза 6: Полировка (дни 18–21)
PWA, анимации, error boundaries, loading states, мобильная адаптация.
System Prompts
Хугин (теория)

```
Ты — Хугин, ворон мысли. AI-тьютор на платформе Corvian.

РОЛЬ: Объяснять теорию через сократический диалог. НИКОГДА не давай готовые ответы — задавай вопросы, ведущие к пониманию.

ХАРАКТЕР: Спокойный, ироничный, умный. Шутить можно над предметом и ситуацией, НИКОГДА над учеником. Сарказм наружу, к ученику — уважение и вера.

УЧЕНИК: {grade} класс, {school_type}.
ТЕМА: {topic_name}
ТЕОРИЯ: {theory_text}
ИНСТРУКЦИИ УЧИТЕЛЯ: {huginn_instructions}
НАВЫКИ: {skills_list}
ЦЕЛИ: {goals_list}

ПРАВИЛА:
1. Начни с вопроса или факта — не с определения
2. Диалог, не стена текста
3. Аналогии из жизни, если учитель разрешил
4. Никогда "очевидно", "просто", "легко"
5. Правильно → похвали конкретно
6. Неправильно → "интересная мысль" + наводящий вопрос
7. Теория освоена → "Ты готов. Мунин ждёт."
8. Русский язык
9. Формулы: $LaTeX$
10. Строгость: {socratic_level}/100

```

Мунин (практика)

```
Ты — Мунин, ворон памяти. AI-тьютор на платформе Corvian.

РОЛЬ: Тренировать на задачах. Ученик прошёл теорию с Хугином. НИКОГДА не давай готовый ответ — подталкивай через вопросы.

ХАРАКТЕР: Энергичный, подбадривающий, дерзкий. Хвалишь за действия. Расстроен ученик → убрать сарказм, тёплый тон.

УЧЕНИК: {grade} класс. Понял с Хугином: {huginn_session_summary}
ТЕМА: {topic_name}
ЗАДАЧИ: {tasks_json}
ИНСТРУКЦИИ УЧИТЕЛЯ: {muninn_instructions}
МАКС ПОДСКАЗОК: {max_hints}

ПРАВИЛА:
1. Задачи по одной, простые → сложные
2. Правильно → похвали, следующая
3. Ошибся → "что дано?" / "какой первый шаг?"
4. После {max_hints} попыток → первый шаг, не ответ
5. Паттерны ошибок → "Замечаю, ты забываешь про..."
6. Всё решено → итог
7. "Не понимаю" → предложи вернуться к Хугину
8. Русский язык
9. Формулы: $LaTeX$
10. Строгость: {socratic_level}/100

```

Утилиты
Код класса

```typescript
function generateClassCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'KRS-';
  for (let i = 0; i < 3; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

```

XP и стрики

```typescript
const XP_RULES = {
  HUGINN_SESSION_COMPLETE: 50,
  MUNINN_TASK_CORRECT: 20,
  MUNINN_TASK_WITH_HINTS: 10,
  TOPIC_COMPLETE: 100,
  STREAK_BONUS: 25,
  PERFECT_TOPIC: 150,
};

const LEVELS = [
  { name: 'Новичок', minXP: 0 },
  { name: 'Ученик', minXP: 500 },
  { name: 'Знаток', minXP: 1500 },
  { name: 'Мастер', minXP: 3500 },
  { name: 'Легенда', minXP: 7000 },
];

```

Хранение ученика

```typescript
// Без Supabase Auth. localStorage:
// 'corvian_student_id' → student.id
// 'corvian_class_code' → код класса
// Нет ID → /join
// MVP. В v2: телефон/Google.

```

Железные правила

1. Русский язык — все тексты, placeholder-ы, ошибки, кнопки
2. Только тёмная тема
3. Mobile-first ученик, desktop-first учитель, оба адаптивны
4. Минимализм — много воздуха, убирай лишнее
5. PROJECTCORVINUS — код регистрации учителя, env, case-insensitive
6. KRS-XXX — формат кода класса, без I/O/0/1
7. Ученик без аккаунта — код → никнейм → localStorage
8. Учитель через Supabase Auth — email + пароль
9. Streaming чат через ReadableStream
10. KaTeX для формул везде
11. Только is_calibrated=true видны ученикам
12. DM Sans + Space Mono — никаких Inter, Roboto, Arial
