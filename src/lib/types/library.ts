export interface LibraryHuginnStepInput {
  sort_order: number;
  explanation: string;
  check_question: string;
  correct_answer: string;
  hint?: string | null;
}

export interface LibraryGoalInput {
  text: string;
  sort_order: number;
  huginn_steps: LibraryHuginnStepInput[];
}

export interface LibraryTaskInput {
  sort_order: number;
  difficulty: number; // 1-4
  question: string;
  answer: string;
  steps?: string | null;
  template?: string | null;
  params?: Record<string, unknown> | null;
  answer_formula?: string | null;
}

export interface LibraryTopicInput {
  subject: string;      // "Математика"
  grade: number;        // 10
  section: string;      // "Комбинаторика"
  topic_name: string;   // "Перестановки, размещения, сочетания"
  sort_order: number;   // порядок темы внутри раздела
  theory_text?: string;
  huginn_instructions?: string;
  muninn_instructions?: string;
  goals: LibraryGoalInput[];
  tasks: LibraryTaskInput[];
}

export interface LibraryUploadResult {
  topic_id: string;
  subject_id: string;
  created: {
    goals: number;
    huginn_steps: number;
    tasks: number;
  };
}
