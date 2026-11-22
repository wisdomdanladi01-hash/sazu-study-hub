import type {
  AcademicCatalogue,
  Course,
  Department,
  Faculty,
  Level,
  Resource,
  ResourcePreview,
  ResourceType,
  Semester,
} from '@/types';
import { apiRequest } from '@/services/api';

interface ApiResource {
  id: number;
  title: string;
  description: string | null;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  category: { id: number; name: string } | null;
  resource_type: { id: number; name: string } | null;
  course: {
    id: number;
    code: string;
    title: string;
    department: { id: number; name: string } | null;
    programme: { id: number; name: string } | null;
  } | null;
  academic_level: { id: number; code: string; name: string } | null;
  semester: { id: number; number: number } | null;
  access_policy: string;
  is_published?: boolean;
  preview_allowed: boolean;
  preview_policy?: 'none' | 'public_sample' | 'authenticated_only';
  preview_content?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResourceFilter {
  q?: string;
  facultyId?: string | null;
  departmentId?: string | null;
  courseId?: string | null;
  level?: Level | null;
  semester?: Semester | null;
  type?: ResourceType | null;
}

export interface ResourceSortOptions {
  sort?: 'relevance' | 'newest' | 'title-asc' | 'title-desc';
}

export interface ResourceQuery extends ResourceFilter, ResourceSortOptions {
  page?: number;
  pageSize?: number;
}

export interface CatalogResource extends Resource {
  course: Course;
  department: Department;
  faculty: Faculty;
}

export interface ResourcePage {
  items: CatalogResource[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const academicCatalogue: AcademicCatalogue = {
  institutions: [],
  faculties: [],
  programmes: [],
  departments: [],
  levels: [],
  sessions: [],
  courses: [],
  semesters: [],
  resource_types: [],
};

function mapResource(item: ApiResource): CatalogResource {
  const departmentId = item.course?.department?.id ?? 0;
  const departmentName = item.course?.department?.name ?? 'Department not specified';
  const course: Course = {
    id: String(item.course?.id ?? 0),
    departmentId: String(departmentId),
    code: item.course?.code ?? 'Course not specified',
    title: item.course?.title ?? 'Course not specified',
    level: item.academic_level?.code ?? '',
    semester: item.semester?.number === 2 ? 'Second' : 'First',
    creditUnits: 0,
    description: '',
  };
  const department: Department = {
    id: String(departmentId),
    facultyId: '',
    name: departmentName,
  };
  const faculty: Faculty = {
    id: '',
    institutionId: 'sazu',
    name: item.course?.programme?.name ?? 'SAZU',
  };
  const resource: Resource = {
    id: String(item.id),
    courseId: course.id,
    title: item.title,
    type: item.resource_type?.name ?? item.category?.name ?? 'Learning material',
    level: item.academic_level?.code ?? '',
    semester: item.semester?.number === 2 ? 'Second' : 'First',
    description: item.description ?? '',
    previewAvailable: Boolean(item.preview_allowed || item.preview_policy !== 'none' || item.preview_content),
    previewContent: item.preview_content ?? '',
    previewPolicy: item.preview_policy ?? 'none',
    accessPolicy: item.access_policy,
    is_published: item.is_published,
    fileSizeBytes: item.file_size_bytes,
    uploadedAt: item.created_at,
    tags: [],
  };
  return { ...resource, course, department, faculty };
}

async function fetchResources(query: ResourceQuery): Promise<CatalogResource[]> {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set('search', query.q.trim());
  if (query.type) params.set('resource_type', query.type);
  if (query.departmentId) params.set('department_id', query.departmentId);
  if (query.courseId) params.set('course_id', query.courseId);
  if (query.level) {
    const level = academicCatalogue.levels.find((item) => item.code === query.level);
    if (level) params.set('academic_level_id', String(level.id));
  }
  const response = await apiRequest<ApiResource[] | { items: ApiResource[]; total: number }>(`/resources?${params}`);
  const list = Array.isArray(response) ? response : (response?.items ?? []);
  return list.map(mapResource);
}

export const catalogService = {
  async getAcademicCatalogue(): Promise<AcademicCatalogue> {
    Object.assign(academicCatalogue, await apiRequest<AcademicCatalogue>('/academic/catalogue'));
    return academicCatalogue;
  },

  async queryResources(query: ResourceQuery): Promise<ResourcePage> {
    let items = await fetchResources(query);
    if (query.level) items = items.filter((item) => item.level === query.level);
    if (query.semester) items = items.filter((item) => item.semester === query.semester);

    switch (query.sort ?? 'relevance') {
      case 'newest':
        items.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
        break;
      case 'title-asc':
        items.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'title-desc':
        items.sort((a, b) => b.title.localeCompare(a.title));
        break;
    }

    const total = items.length;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 9;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total, page, pageSize, totalPages };
  },

  async getResource(id: string): Promise<CatalogResource | undefined> {
    try {
      return mapResource(await apiRequest<ApiResource>(`/resources/${encodeURIComponent(id)}`));
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 404) return undefined;
      throw error;
    }
  },

  async getResourcePreview(id: string): Promise<ResourcePreview> {
    return apiRequest<ResourcePreview>(`/resources/${encodeURIComponent(id)}/preview`);
  },

  async getRelatedResources(id: string, limit = 3): Promise<CatalogResource[]> {
    const resource = await this.getResource(id);
    if (!resource) return [];
    const page = await this.queryResources({ pageSize: 100 });
    return page.items
      .filter((item) => item.id !== resource.id && item.courseId === resource.courseId)
      .slice(0, limit);
  },

  async featuredResources(limit = 6): Promise<CatalogResource[]> {
    const page = await this.queryResources({ pageSize: limit });
    return page.items;
  },
};
