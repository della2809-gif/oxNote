export type Subject = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
};

export type Note = {
  id: string;
  user_id: string;
  subject_id: string | null;
  source: string | null;
  source_file_url: string | null;
  question: string;
  my_answer: string | null;
  correct_answer: string;
  ai_analysis: string | null;
  mistake_type: string | null;
  tags: string[];
  box_level: number;
  next_review_at: string;
  mastered: boolean;
  created_at: string;
  updated_at: string;
};

export type ReviewLog = {
  id: string;
  note_id: string;
  user_id: string;
  result: "correct" | "incorrect";
  reviewed_at: string;
};
