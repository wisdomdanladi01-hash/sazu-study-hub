// Shared client-side types for the SAZU Study Hub.

export type ID = string;

export type Level = string;

export type Semester = 'First' | 'Second';

export type ResourceType = string;

export interface Faculty {
  id: ID;
  institutionId: ID;
  name: string;
}

export interface Department {
  id: ID;
  facultyId: ID;
  name: string;
}

export interface Course {
  id: ID;
  departmentId: ID;
  code: string;
  title: string;
  level: Level;
  semester: Semester;
  creditUnits: number;
  description: string;
}

export interface Resource {
  id: ID;
  courseId: ID;
  title: string;
  type: ResourceType;
  level: Level;
  semester: Semester;
  authorTag?: string; // e.g. "Compiled by a SAZU contributor" — never claims official authorship
  description: string;
  previewAvailable: boolean;
  previewContent: string;
  previewPolicy?: 'none' | 'public_sample' | 'authenticated_only';
  accessPolicy?: string;
  is_published?: boolean;
  pages?: number;
  fileSizeBytes?: number;
  uploadedAt: string;
  tags: string[];
}

export interface ResourcePreview {
  id: number;
  title: string;
  file_name: string;
  mime_type: string;
  preview_policy: 'none' | 'public_sample' | 'authenticated_only';
  preview_available: boolean;
  preview_type: 'text' | 'markdown' | 'image' | 'pdf' | 'unsupported' | 'none';
  preview_content?: string | null;
  preview_url?: string | null;
  message?: string | null;
}

export interface AcademicProfile {
  institutionId: ID;
  facultyId: ID | null;
  departmentId: ID | null;
  programmeId: ID | null;
  level: Level | null;
  semester: Semester | null;
}

export interface StudentProfile {
  id: ID;
  fullName: string;
  email: string;
  createdAt: string;
  academic: AcademicProfile;
  hasSubscription: boolean;
  subscriptionExpiresAt: string | null;
  isAdmin: boolean;
  role?: string;
  permissions?: string[];
  isSuperuser?: boolean;
  emailVerified?: boolean;
}

export interface AcademicCatalogue {
  institutions: Array<{ id: number; code: string; name: string; location: string | null }>;
  faculties: Array<{ id: number; code: string; name: string; institution_id: number }>;
  programmes: Array<{
    id: number;
    code: string;
    name: string;
    faculty_id: number | null;
    award: string | null;
    study_level: string;
    status: string;
    commencement_session_id: number | null;
    source_note: string | null;
    departments: Array<{ id: number; code: string; name: string; programme_id: number | null; faculty_id: number | null; status: string }>;
  }>;
  departments: Array<{ id: number; code: string; name: string; programme_id: number | null; faculty_id: number | null; status: string; source_note: string | null }>;
  levels: Array<{ id: number; code: string; name: string; sort_order: number }>;
  sessions: Array<{ id: number; name: string; starts_on: string; ends_on: string; is_active: boolean }>;
  courses: Array<{
    id: number;
    code: string;
    title: string;
    programme_id: number | null;
    department_id: number | null;
    academic_level_id: number | null;
    verification_status: string;
    source_note: string | null;
    offerings: Array<{
      id: number;
      curriculum_version_id: number;
      curriculum_version: string;
      academic_session_id: number;
      academic_session: string | null;
      academic_level_id: number;
      level: string | null;
      semester_id: number;
      semester: number | null;
      credit_units: number | null;
      course_type: string | null;
      verification_status: string;
      source_note: string | null;
    }>;
  }>;
  semesters: Array<{ id: number; number: number; academic_session_id: number }>;
  resource_types: Array<{ id: number; name: string }>;
}

export interface AssessmentQuestion {
  id: string;
  questionNumber: number;
  text: string;
  codeSnippet?: string;
  options: {
    key: 'A' | 'B' | 'C' | 'D';
    text: string;
  }[];
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

export interface PracticeAssessment {
  id: string;
  title: string;
  description: string;
  courseCode: string;
  courseTitle: string;
  level: string;
  semester: string;
  durationMinutes: number;
  isDemonstration: boolean;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  questions: AssessmentQuestion[];
}

export interface AdminOverview {
  metrics: {
    total_resources: number;
    published_resources: number;
    total_faculties: number;
    total_departments: number;
    total_programmes: number;
    total_courses: number;
    total_course_offerings: number;
    verified_offerings: number;
    unverified_offerings: number;
    pending_verifications: number;
    total_packages: number;
    total_payments: number;
    succeeded_payments: number;
  };
  recent_resources: Array<{
    id: number;
    title: string;
    file_name: string;
    mime_type: string;
    is_published: boolean;
    access_policy: string;
    preview_policy: string;
    created_at: string;
  }>;
  recent_submissions: Array<{
    id: number;
    user_id: number;
    status: string;
    matriculation_number: string | null;
    jamb_registration_number: string | null;
    created_at: string;
  }>;
}

export interface AdminCourseOffering {
  id: number;
  course_id: number;
  course_code: string;
  course_title: string;
  programme_id: number | null;
  programme_name?: string | null;
  department_id: number | null;
  department_name?: string | null;
  curriculum_version: string;
  academic_session: string | null;
  level: string | null;
  semester: number | null;
  credit_units: number | null;
  course_type: string | null;
  verification_status: 'verified' | 'user_supplied' | 'pending_confirmation';
  source_note: string | null;
  is_active: boolean;
}

export interface VerificationQueueItem {
  id: number;
  user_id: number;
  status: string;
  jamb_registration_number: string | null;
  matriculation_number: string | null;
  programme_id: number | null;
  department_id: number | null;
  admission_session_id: number | null;
  claimed_level_id: number | null;
}

export interface VerificationDocument {
  id: number;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
}
