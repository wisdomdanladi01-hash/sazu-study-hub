import { apiRequest } from '@/services/api';

export interface CourseRef {
  id: number;
  code: string;
  title: string;
}

export interface PracticeConfig {
  id: number;
  title: string;
  description: string | null;
  course: CourseRef;
  question_count: number;
  duration_minutes: number;
  pass_mark_percent: number;
  max_attempts: number | null;
  requires_subscription: boolean;
  locked: boolean;
  lock_reason: 'sign_in_required' | 'verification_required' | 'subscription_required' | null;
  attempts_used: number;
  in_progress_attempt_id: number | null;
  best_score_percent: number | null;
}

export interface OptionItem {
  key: string;
  text: string;
}

export interface AttemptQuestion {
  id: number;
  number: number;
  text: string;
  options: OptionItem[];
}

export interface Attempt {
  id: number;
  config_id: number;
  title: string;
  status: 'in_progress' | 'submitted' | 'expired';
  started_at: string;
  expires_at: string;
  seconds_remaining: number;
  total_questions: number;
  answers: Record<string, string>;
  questions: AttemptQuestion[];
}

export interface ReviewItem {
  question_id: number;
  number: number;
  text: string;
  options: OptionItem[];
  chosen_key: string | null;
  correct_key: string | null;
  is_correct: boolean;
  explanation: string | null;
}

export interface AttemptResult {
  attempt_id: number;
  config_id: number;
  title: string;
  status: string;
  total_questions: number;
  answered: number;
  correct_count: number;
  score_percent: number;
  pass_mark_percent: number;
  passed: boolean;
  grade: string;
  submitted_at: string | null;
  answers_revealed: boolean;
  review: ReviewItem[];
}

export const assessmentService = {
  list: () => apiRequest<PracticeConfig[]>('/assessments'),
  start: (configId: number) => apiRequest<Attempt>(`/assessments/${configId}/attempts`, { method: 'POST' }),
  getAttempt: (attemptId: number) => apiRequest<Attempt>(`/assessments/attempts/${attemptId}`),
  saveAnswer: (attemptId: number, questionId: number, answerKey: string | null) =>
    apiRequest<void>(`/assessments/attempts/${attemptId}/answers`, {
      method: 'PUT',
      body: JSON.stringify({ question_id: questionId, answer_key: answerKey }),
    }),
  submit: (attemptId: number) => apiRequest<AttemptResult>(`/assessments/attempts/${attemptId}/submit`, { method: 'POST' }),
  results: (attemptId: number) => apiRequest<AttemptResult>(`/assessments/attempts/${attemptId}/results`),
};

export function lockMessage(reason: PracticeConfig['lock_reason']): string {
  switch (reason) {
    case 'sign_in_required':
      return 'Sign in to take this test.';
    case 'verification_required':
      return 'Your student verification must be approved first.';
    case 'subscription_required':
      return 'An active subscription is required.';
    default:
      return '';
  }
}
