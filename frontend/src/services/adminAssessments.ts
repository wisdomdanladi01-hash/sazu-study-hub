import { apiRequest } from '@/services/api';

export interface AdminQuestion {
  id: number;
  course_id: number;
  resource_id: number | null;
  topic: string | null;
  source_label: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  text: string;
  options: Array<{ key: string; text: string }>;
  correct_key: string;
  explanation: string | null;
  is_active: boolean;
  created_at: string;
}

export interface NewQuestion {
  course_id: number;
  resource_id: number | null;
  topic: string | null;
  source_label: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  text: string;
  options: string[];
  correct_answer: string;
  explanation: string | null;
}

export interface AdminConfig {
  id: number;
  title: string;
  description: string | null;
  course: { id: number; code: string; title: string };
  semester_id: number | null;
  question_count: number;
  duration_minutes: number;
  pass_mark_percent: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  reveal_answers: boolean;
  max_attempts: number | null;
  requires_subscription: boolean;
  topics: string[] | null;
  resource_ids: number[];
  is_published: boolean;
  pool_size: number;
  attempt_count: number;
}

export interface NewConfig {
  title: string;
  course_id: number;
  description: string | null;
  question_count: number;
  duration_minutes: number;
  pass_mark_percent: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  reveal_answers: boolean;
  max_attempts: number | null;
  requires_subscription: boolean;
  topics: string[] | null;
  resource_ids: number[];
  is_published: boolean;
}

const base = '/admin/assessments';

export const adminAssessmentService = {
  listQuestions(courseId?: number): Promise<AdminQuestion[]> {
    const query = courseId ? `?course_id=${courseId}&limit=200` : '?limit=200';
    return apiRequest<AdminQuestion[]>(`${base}/questions${query}`);
  },
  createQuestion: (data: NewQuestion) =>
    apiRequest<AdminQuestion>(`${base}/questions`, { method: 'POST', body: JSON.stringify(data) }),
  removeQuestion: (id: number) => apiRequest<void>(`${base}/questions/${id}`, { method: 'DELETE' }),
  importQuestions(file: File): Promise<{ created: number; errors: string[] }> {
    const form = new FormData();
    form.append('upload', file);
    return apiRequest(`${base}/questions/import`, { method: 'POST', body: form });
  },
  listConfigs: () => apiRequest<AdminConfig[]>(`${base}/configs`),
  createConfig: (data: NewConfig) =>
    apiRequest<AdminConfig>(`${base}/configs`, { method: 'POST', body: JSON.stringify(data) }),
  updateConfig: (id: number, data: Partial<NewConfig>) =>
    apiRequest<AdminConfig>(`${base}/configs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteConfig: (id: number) => apiRequest<void>(`${base}/configs/${id}`, { method: 'DELETE' }),
};

export const CSV_TEMPLATE =
  'course_code,question,option_a,option_b,option_c,option_d,option_e,correct,explanation,topic,difficulty,source_label,resource_id\n' +
  'COS102,"What is the worst-case time complexity of linear search?",O(1),O(log n),O(n),O(n^2),,C,"Every element may be inspected.",Complexity,easy,2023/2024 Exam,\n';
