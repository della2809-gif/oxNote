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
  source_file_size_bytes: number | null;
  student_solution_file_url: string | null;
  student_solution_file_size_bytes: number | null;
  question: string;
  my_answer: string | null;
  correct_answer: string;
  ai_analysis: string | null;
  ai_details: NoteAiDetails;
  user_mistake_reason: string | null;
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

export type NoteSolutionStep = {
  title: string;
  explanation: string;
  formula: string;
};

export type NoteConfusionPoint = {
  title: string;
  explanation: string;
  correction: string;
};

export type MathVerification = {
  status: "passed" | "corrected" | "needs_review" | "not_applicable";
  checkedCount: number;
  correctedCount: number;
  corrections: string[];
  warnings: string[];
  replacements?: Array<{ from: string; to: string }>;
};

export type NoteAiDetails = {
  title: string;
  subject: string;
  gradeLevel: string;
  curriculum: string;
  difficulty: string;
  questionType: string;
  coreConcepts: string[];
  solutionSteps: NoteSolutionStep[];
  answerSummary: string;
  confusionPoints: NoteConfusionPoint[];
  mathVerification?: MathVerification;
};

export type Plan = {
  id: string;
  name: string;
  description: string;
  monthly_price_krw: number;
  monthly_ai_credits: number;
  max_file_bytes: number;
  monthly_storage_bytes: number;
  is_active: boolean;
};

export type Subscription = {
  id: string;
  user_id: string;
  payer_user_id: string;
  guardian_link_id: string | null;
  plan_id: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "paused";
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type GuardianLink = {
  id: string;
  child_user_id: string;
  guardian_user_id: string;
  relationship: "parent" | "legal_guardian" | "other";
  status: "pending" | "active" | "rejected" | "revoked";
  can_view_learning: boolean;
  can_manage_account: boolean;
  can_manage_billing: boolean;
  accepted_at: string | null;
  created_at: string;
};
