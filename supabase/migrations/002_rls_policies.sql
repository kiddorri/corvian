-- ========================================
-- RLS Policies для Corvian MVP
-- ========================================

-- TEACHERS: только свои данные
create policy "Teachers: read own" on teachers
  for select using (auth.uid() = user_id);

create policy "Teachers: insert own" on teachers
  for insert with check (auth.uid() = user_id);

create policy "Teachers: update own" on teachers
  for update using (auth.uid() = user_id);

-- CLASSES: учитель видит/редактирует свои, ученики могут читать (для join)
create policy "Classes: teacher manages own" on classes
  for all using (
    teacher_id in (select id from teachers where user_id = auth.uid())
  );

create policy "Classes: anyone can read by code" on classes
  for select using (true);

-- STUDENTS: учитель видит своих, ученик — себя
-- Ученики не имеют auth, поэтому для MVP — открытый доступ на insert/select
create policy "Students: public read" on students
  for select using (true);

create policy "Students: public insert" on students
  for insert with check (true);

create policy "Students: public update" on students
  for update using (true);

-- TOPICS: учитель управляет, ученик читает свои (через class_id)
create policy "Topics: teacher manages" on topics
  for all using (
    class_id in (select id from classes where teacher_id in (select id from teachers where user_id = auth.uid()))
  );

create policy "Topics: public read" on topics
  for select using (true);

-- CALIBRATIONS: учитель управляет, чтение для API
create policy "Calibrations: teacher manages" on calibrations
  for all using (
    topic_id in (select id from topics where class_id in (select id from classes where teacher_id in (select id from teachers where user_id = auth.uid())))
  );

create policy "Calibrations: public read" on calibrations
  for select using (true);

-- SKILLS: учитель управляет, чтение открыто
create policy "Skills: teacher manages" on skills
  for all using (
    topic_id in (select id from topics where class_id in (select id from classes where teacher_id in (select id from teachers where user_id = auth.uid())))
  );

create policy "Skills: public read" on skills
  for select using (true);

-- LEARNING_GOALS: аналогично skills
create policy "Learning goals: teacher manages" on learning_goals
  for all using (
    topic_id in (select id from topics where class_id in (select id from classes where teacher_id in (select id from teachers where user_id = auth.uid())))
  );

create policy "Learning goals: public read" on learning_goals
  for select using (true);

-- TASKS: аналогично
create policy "Tasks: teacher manages" on tasks
  for all using (
    topic_id in (select id from topics where class_id in (select id from classes where teacher_id in (select id from teachers where user_id = auth.uid())))
  );

create policy "Tasks: public read" on tasks
  for select using (true);

-- CHAT_SESSIONS: открыто для MVP (ученики без auth)
create policy "Chat sessions: public access" on chat_sessions
  for all using (true);

-- CHAT_MESSAGES: открыто для MVP
create policy "Chat messages: public access" on chat_messages
  for all using (true);

-- STUDENT_PROGRESS: открыто для MVP
create policy "Student progress: public access" on student_progress
  for all using (true);
