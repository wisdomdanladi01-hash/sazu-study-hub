import { apiRequest, getAccessToken } from '@/services/api';
import type {
  AdminCourseOffering,
  AdminOverview,
  VerificationDocument,
  VerificationQueueItem,
} from '@/types';

export type { AdminCourseOffering } from '@/types';

export interface AdminSubscriptionPackage {
  id: number;
  name: string;
  description: string | null;
  package_type: 'subscription' | 'semester' | 'session' | 'level' | 'course' | 'resource' | 'resource_package';
  price_minor: number;
  subscriber_price_minor?: number | null;
  currency: string;
  semester_id: number | null;
  academic_session_id: number | null;
  academic_level_id?: number | null;
  course_id: number | null;
  resource_id: number | null;
  target_name?: string | null;
  semester_starts_on?: string | null;
  semester_ends_on?: string | null;
  available_from?: string | null;
  available_until?: string | null;
  is_active: boolean;
  buyers_count?: number;
  total_revenue_minor?: number;
}

export interface AdminAcademicSession {
  id: number;
  name: string;
  starts_on: string;
  ends_on: string;
  is_active: boolean;
}

export interface AdminSemester {
  id: number;
  academic_session_id: number;
  number: number;
  starts_on: string;
  ends_on: string;
}

export interface AdminUserItem {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  role_id: number | null;
  role_name: string | null;
  permissions: string[];
  created_at: string;
}

export interface RoleItem {
  id: number;
  name: string;
  description: string | null;
}

export interface AdminFaculty {
  id: number;
  code: string;
  name: string;
  institution_id: number;
  is_active: boolean;
}

export interface AdminDepartment {
  id: number;
  code: string;
  name: string;
  programme_id: number | null;
  faculty_id: number | null;
  status: string;
  source_note: string | null;
  is_active: boolean;
}

export interface AdminProgramme {
  id: number;
  code: string;
  name: string;
  faculty_id: number | null;
  award: string | null;
  study_level: string;
  status: string;
  commencement_session_id: number | null;
  source_note: string | null;
  is_active: boolean;
}

export interface AdminCourse {
  id: number;
  code: string;
  title: string;
  programme_id: number | null;
  department_id: number | null;
  academic_level_id: number | null;
  verification_status: string;
  source_note: string | null;
  is_active: boolean;
}

export interface ResourceFileItem {
  id: number;
  resource_id: number;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  file_checksum_sha256?: string | null;
  page_order: number;
  storage_provider: string;
  created_at: string;
}

export interface AdminResourceItem {
  id: number;
  title: string;
  description: string | null;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  storage_provider?: string;
  file_checksum_sha256?: string | null;
  category_id: number | null;
  course_id: number | null;
  course_offering_id?: number | null;
  academic_level_id: number | null;
  academic_session_id: number | null;
  semester_id: number | null;
  resource_type_id: number | null;
  is_published: boolean;
  access_policy: string;
  preview_policy: 'none' | 'public_sample' | 'authenticated_only';
  preview_content: string | null;
  requires_verification: boolean;
  files?: ResourceFileItem[];
  course_offering_ids?: number[];
  created_at: string;
  updated_at: string;
}

export interface CsvImportResult {
  created_offerings_count: number;
  curriculum_version: string;
  message?: string;
}

export const adminService = {
  // Overview
  async getOverview(): Promise<AdminOverview> {
    return apiRequest<AdminOverview>('/admin/academic/overview');
  },

  // Faculties
  async listFaculties(): Promise<AdminFaculty[]> {
    return apiRequest<AdminFaculty[]>('/admin/academic/faculties');
  },
  async createFaculty(data: { code: string; name: string }): Promise<AdminFaculty> {
    return apiRequest<AdminFaculty>('/admin/academic/faculties', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  async updateFaculty(id: number, data: Partial<AdminFaculty>): Promise<AdminFaculty> {
    return apiRequest<AdminFaculty>(`/admin/academic/faculties/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Departments
  async listDepartments(): Promise<AdminDepartment[]> {
    return apiRequest<AdminDepartment[]>('/admin/academic/departments');
  },
  async createDepartment(data: { code: string; name: string; faculty_id?: number | null; programme_id?: number | null; status?: string; source_note?: string | null }): Promise<AdminDepartment> {
    return apiRequest<AdminDepartment>('/admin/academic/departments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  async updateDepartment(id: number, data: Partial<AdminDepartment>): Promise<AdminDepartment> {
    return apiRequest<AdminDepartment>(`/admin/academic/departments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Programmes
  async listProgrammes(): Promise<AdminProgramme[]> {
    return apiRequest<AdminProgramme[]>('/admin/academic/programmes');
  },
  async createProgramme(data: { code: string; name: string; faculty_id?: number | null; award?: string | null; study_level?: string; status?: string; source_note?: string | null }): Promise<AdminProgramme> {
    return apiRequest<AdminProgramme>('/admin/academic/programmes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  async updateProgramme(id: number, data: Partial<AdminProgramme>): Promise<AdminProgramme> {
    return apiRequest<AdminProgramme>(`/admin/academic/programmes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Courses
  async listCourses(): Promise<AdminCourse[]> {
    return apiRequest<AdminCourse[]>('/admin/academic/courses');
  },
  async createCourse(data: { code: string; title: string; programme_id: number; department_id?: number | null; academic_level_id?: number | null; verification_status?: string; source_note?: string | null }): Promise<AdminCourse> {
    return apiRequest<AdminCourse>('/admin/academic/courses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  async updateCourse(id: number, data: Partial<AdminCourse>): Promise<AdminCourse> {
    return apiRequest<AdminCourse>(`/admin/academic/courses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Course Offerings
  async listCourseOfferings(): Promise<AdminCourseOffering[]> {
    return apiRequest<AdminCourseOffering[]>('/admin/academic/course-offerings');
  },
  async updateCourseOffering(id: number, data: { verification_status?: string; source_note?: string | null; credit_units?: number | null; course_type?: string | null; is_active?: boolean }): Promise<AdminCourseOffering> {
    return apiRequest<AdminCourseOffering>(`/admin/academic/course-offerings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // CSV Bulk Import
  async importCourseOfferings(file: File): Promise<CsvImportResult> {
    const formData = new FormData();
    formData.append('upload', file);
    return apiRequest<CsvImportResult>('/admin/academic/course-offerings/import', {
      method: 'POST',
      body: formData,
    });
  },

  // Resources
  async listResources(search?: string): Promise<AdminResourceItem[]> {
    const params = new URLSearchParams();
    if (search?.trim()) params.set('search', search.trim());
    return apiRequest<AdminResourceItem[]>(`/admin/resources?${params}`);
  },
  async listResourceFiles(resourceId: number): Promise<ResourceFileItem[]> {
    return apiRequest<ResourceFileItem[]>(`/resources/${resourceId}/files`);
  },
  async uploadResource(formData: FormData): Promise<AdminResourceItem> {
    return apiRequest<AdminResourceItem>('/admin/resources', {
      method: 'POST',
      body: formData,
    });
  },
  async updateResource(id: number, data: Partial<AdminResourceItem>): Promise<AdminResourceItem> {
    return apiRequest<AdminResourceItem>(`/admin/resources/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  async replaceResourceFile(id: number, file: File): Promise<AdminResourceItem> {
    const formData = new FormData();
    formData.append('upload', file);
    return apiRequest<AdminResourceItem>(`/admin/resources/${id}/file`, {
      method: 'POST',
      body: formData,
    });
  },
  async deleteResource(id: number): Promise<void> {
    return apiRequest<void>(`/admin/resources/${id}`, {
      method: 'DELETE',
    });
  },

  // Verifications
  async listVerificationQueue(): Promise<VerificationQueueItem[]> {
    return apiRequest<VerificationQueueItem[]>('/admin/verification/submissions');
  },
  async getSubmissionDocuments(submissionId: number): Promise<VerificationDocument[]> {
    return apiRequest<VerificationDocument[]>(`/admin/verification/submissions/${submissionId}/documents`);
  },
  async decideVerification(submissionId: number, data: {
    decision: 'verified' | 'rejected' | 'needs_review';
    reason?: string;
    verified_level_id?: number | null;
    verified_session_id?: number | null;
  }): Promise<{ id: number; status: string }> {
    return apiRequest<{ id: number; status: string }>(`/admin/verification/submissions/${submissionId}/decision`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async downloadVerificationDocument(submissionId: number, documentId: number, filename: string): Promise<void> {
    const token = getAccessToken();
    const base = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, '');
    const res = await fetch(`${base}/verification/submissions/${submissionId}/documents/${documentId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Failed to download document');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Academic Sessions & Semesters
  async listSessions(): Promise<AdminAcademicSession[]> {
    return apiRequest<AdminAcademicSession[]>('/admin/academic/sessions');
  },
  async createSession(data: { name: string; starts_on: string; ends_on: string; is_active?: boolean }): Promise<AdminAcademicSession> {
    return apiRequest<AdminAcademicSession>('/admin/academic/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  async updateSession(id: number, data: Partial<AdminAcademicSession>): Promise<AdminAcademicSession> {
    return apiRequest<AdminAcademicSession>(`/admin/academic/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  async listSemesters(sessionId?: number): Promise<AdminSemester[]> {
    const q = sessionId ? `?session_id=${sessionId}` : '';
    return apiRequest<AdminSemester[]>(`/admin/academic/semesters${q}`);
  },
  async createSemester(data: { academic_session_id: number; number: number; starts_on: string; ends_on: string }): Promise<AdminSemester> {
    return apiRequest<AdminSemester>('/admin/academic/semesters', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  async updateSemester(id: number, data: Partial<AdminSemester>): Promise<AdminSemester> {
    return apiRequest<AdminSemester>(`/admin/academic/semesters/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Packages
  async listPackages(): Promise<AdminSubscriptionPackage[]> {
    return apiRequest<AdminSubscriptionPackage[]>('/admin/subscriptions/packages');
  },
  async createPackage(data: {
    name: string;
    description?: string | null;
    package_type: string;
    price_minor: number;
    subscriber_price_minor?: number | null;
    currency: string;
    semester_id?: number | null;
    academic_session_id?: number | null;
    academic_level_id?: number | null;
    course_id?: number | null;
    resource_id?: number | null;
    available_from?: string | null;
    available_until?: string | null;
    is_active?: boolean;
  }): Promise<AdminSubscriptionPackage> {
    return apiRequest<AdminSubscriptionPackage>('/admin/subscriptions/packages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  async updatePackage(id: number, data: {
    name?: string;
    description?: string | null;
    package_type?: string;
    price_minor?: number;
    subscriber_price_minor?: number | null;
    semester_id?: number | null;
    academic_session_id?: number | null;
    academic_level_id?: number | null;
    course_id?: number | null;
    resource_id?: number | null;
    available_from?: string | null;
    available_until?: string | null;
    is_active?: boolean;
  }): Promise<AdminSubscriptionPackage> {
    return apiRequest<AdminSubscriptionPackage>(`/admin/subscriptions/packages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  async deletePackage(id: number): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(`/admin/subscriptions/packages/${id}`, {
      method: 'DELETE',
    });
  },

  // Users & Roles Management
  async listAdminUsers(): Promise<AdminUserItem[]> {
    return apiRequest<AdminUserItem[]>('/admin/users');
  },
  async createAdminUser(data: { email: string; full_name: string; password?: string; role_name: string }): Promise<AdminUserItem> {
    return apiRequest<AdminUserItem>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  async updateAdminUserRole(userId: number, roleName: string): Promise<AdminUserItem> {
    return apiRequest<AdminUserItem>(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role_name: roleName }),
    });
  },
  async listRoles(): Promise<RoleItem[]> {
    return apiRequest<RoleItem[]>('/admin/roles');
  },

  // Payments & Subscriptions
  async listPayments(): Promise<Array<{
    id: number;
    user_id: number;
    reference: string;
    status: string;
    amount_minor: number;
    currency: string;
    created_at: string;
  }>> {
    return apiRequest('/admin/payments');
  },
  async listSubscriptions(): Promise<Array<{
    id: number;
    user_id: number;
    package_id: number;
    semester_id: number;
    status: string;
    is_active: boolean;
    created_at: string;
  }>> {
    return apiRequest('/admin/subscriptions');
  },
};
