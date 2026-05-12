-- ========================================
-- LIBRARY STUDENTS: ученики для общедоступной библиотеки
-- ========================================

CREATE TABLE library_students (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_library_students_email ON library_students(email);

ALTER TABLE library_students ENABLE ROW LEVEL SECURITY;
-- Чтение/запись только через service_role с API. Никаких public policies.
