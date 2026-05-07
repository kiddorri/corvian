export interface Student {
  id: string
  class_id: string
  display_name: string
  xp: number
  streak_days: number
  streak_last_date: string | null
  created_at: string
  classes?: {
    id: string
    name: string
    subject: string
    grade: number
  }
}

export interface Topic {
  id: string
  class_id: string
  section: string
  name: string
  sort_order: number
  is_calibrated: boolean
}

export interface StudentProgress {
  id: string
  student_id: string
  topic_id: string
  status: 'not_started' | 'in_progress' | 'completed'
  score: number | null
  time_spent_minutes: number
  attempts: number
  last_session_at: string | null
}

export interface Calibration {
  id: string
  topic_id: string
  theory_text: string | null
  theory_files: unknown[]
  huginn_instructions: string | null
  muninn_instructions: string | null
  socratic_level: number
  max_hints_before_answer: number
  allow_humor: boolean
  allow_analogies: boolean
}
