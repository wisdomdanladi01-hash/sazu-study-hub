import { useEffect, useMemo, useState, useRef } from 'react';
import { adminService, type AdminResourceItem } from '@/services/admin';
import { catalogService } from '@/services/catalog';
import type { AcademicCatalogue } from '@/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Dialog } from '@/components/ui/Dialog';
import {
  Plus,
  Search,
  Upload,
  Edit2,
  Trash2,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  X,
  CheckCircle2,
  Layers,
  GraduationCap,
  Calendar,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { formatDate } from '@/utils/format';

export function AdminResourcesPage() {
  const [resources, setResources] = useState<AdminResourceItem[]>([]);
  const [catalogue, setCatalogue] = useState<AcademicCatalogue | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editModalItem, setEditModalItem] = useState<AdminResourceItem | null>(null);
  const [deleteModalItem, setDeleteModalItem] = useState<AdminResourceItem | null>(null);
  const [replacingFileId, setReplacingFileId] = useState<number | null>(null);
  const [viewFilesItem, setViewFilesItem] = useState<AdminResourceItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      adminService.listResources(search),
      catalogService.getAcademicCatalogue(),
    ])
      .then(([rList, cat]) => {
        setResources(rList);
        setCatalogue(cat);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load resources.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleFileReplace = async (resourceId: number, file: File) => {
    try {
      await adminService.replaceResourceFile(resourceId, file);
      loadData();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : 'Unable to replace file.');
    } finally {
      setReplacingFileId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-950">Learning Resource Management</h1>
          <p className="mt-1 text-sm text-ink-600">
            Upload course materials, associate academic offerings, manage multi-page resources, and configure storage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} loading={loading} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Refresh
          </Button>
          <Button size="sm" onClick={() => setUploadModalOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
            Upload Material
          </Button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {/* Hidden file input for file replacement */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0] && replacingFileId) {
            handleFileReplace(replacingFileId, e.target.files[0]);
          }
        }}
      />

      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <Input
          type="search"
          placeholder="Search materials by title or filename…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          className="flex-1"
        />
        <Button type="submit">Search</Button>
      </form>

      {/* Resources Table */}
      <Card className="overflow-hidden">
        <div className="p-4 bg-ink-50 border-b border-ink-100 flex items-center justify-between text-xs font-bold text-ink-700">
          <span>{resources.length} learning resource{resources.length === 1 ? '' : 's'} recorded</span>
        </div>

        {resources.length === 0 ? (
          <div className="p-12 text-center text-sm text-ink-500">
            No learning materials match your search or filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50/50 border-b border-ink-100 text-xs font-bold uppercase text-ink-600">
                <tr>
                  <th className="px-4 py-3">Resource Title</th>
                  <th className="px-4 py-3">File / Storage</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Access Policy</th>
                  <th className="px-4 py-3">Preview Policy</th>
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {resources.map((r) => (
                  <tr key={r.id} className="hover:bg-ink-50/50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900">{r.title}</p>
                      {r.description && <p className="text-xs text-ink-500 line-clamp-1">{r.description}</p>}
                      {r.course_offering_id && (
                        <span className="inline-block mt-1 text-[11px] font-mono text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                          Offering #{r.course_offering_id}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-600 whitespace-nowrap">
                      <p className="font-mono">{r.file_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-ink-400">{(r.file_size_bytes / 1024).toFixed(0)} KB</span>
                        <span className="text-ink-300">•</span>
                        <Badge tone={r.storage_provider === 'vercel_blob' ? 'teal' : 'neutral'} className="text-[10px] py-0 px-1.5">
                          {r.storage_provider === 'vercel_blob' ? 'Vercel Blob' : 'Local Storage'}
                        </Badge>
                      </div>
                      {r.files && r.files.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setViewFilesItem(r)}
                          className="mt-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1"
                        >
                          <Layers className="h-3 w-3" /> {r.files.length} Pages (Series)
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={r.is_published ? 'green' : 'neutral'}>
                        {r.is_published ? 'Published' : 'Draft'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <Badge tone={r.access_policy === 'public' ? 'green' : 'neutral'}>
                        {r.access_policy === 'public' ? 'Public' : 'Protected'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <Badge tone={r.preview_policy === 'public_sample' ? 'teal' : r.preview_policy === 'authenticated_only' ? 'amber' : 'neutral'}>
                        {r.preview_policy === 'public_sample' ? 'Sample Excerpt' : r.preview_policy === 'authenticated_only' ? 'Auth Preview' : 'No Preview'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500 whitespace-nowrap">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setReplacingFileId(r.id);
                          fileInputRef.current?.click();
                        }}
                        title="Replace primary file bytes"
                      >
                        Replace file
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditModalItem(r)} leftIcon={<Edit2 className="h-3.5 w-3.5" />}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeleteModalItem(r)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Upload Modal (Structured Section A, B, C, D) */}
      {uploadModalOpen && (
        <UploadResourceModal
          catalogue={catalogue}
          onClose={() => setUploadModalOpen(false)}
          onSuccess={() => {
            setUploadModalOpen(false);
            loadData();
          }}
        />
      )}

      {/* Edit Metadata Modal */}
      {editModalItem && (
        <EditResourceModal
          item={editModalItem}
          onClose={() => setEditModalItem(null)}
          onSuccess={() => {
            setEditModalItem(null);
            loadData();
          }}
        />
      )}

      {/* Multi-file Pages Modal */}
      {viewFilesItem && (
        <Dialog open onClose={() => setViewFilesItem(null)} title={`Resource Pages: ${viewFilesItem.title}`} size="lg">
          <div className="space-y-4">
            <p className="text-xs text-ink-600">
              This resource contains multiple ordered document pages or photographs belonging to the same academic material.
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {viewFilesItem.files?.map((f) => (
                <div key={f.id} className="flex items-center justify-between p-3 bg-ink-50 rounded-xl border border-ink-100">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-teal-100 text-teal-800">
                      Page {f.page_order}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-ink-900 font-mono">{f.original_filename}</p>
                      <p className="text-[11px] text-ink-500">{(f.file_size_bytes / 1024).toFixed(0)} KB • {f.mime_type}</p>
                    </div>
                  </div>
                  <Badge tone={f.storage_provider === 'vercel_blob' ? 'teal' : 'neutral'}>
                    {f.storage_provider}
                  </Badge>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setViewFilesItem(null)}>Close</Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalItem && (
        <Dialog open onClose={() => setDeleteModalItem(null)} title="Delete Learning Resource?">
          <p className="text-sm text-ink-600">
            Are you sure you want to delete <strong>{deleteModalItem.title}</strong>? If this resource is referenced by existing student entitlements or packages, the deletion will be rejected.
          </p>
          <div className="mt-6 flex justify-end gap-2.5">
            <Button variant="outline" onClick={() => setDeleteModalItem(null)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                try {
                  await adminService.deleteResource(deleteModalItem.id);
                  setDeleteModalItem(null);
                  loadData();
                } catch (cause) {
                  alert(cause instanceof Error ? cause.message : 'Unable to delete resource.');
                }
              }}
            >
              Confirm delete
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

interface UploadFileItem {
  id: string;
  file: File;
  pageOrder: number;
}

function UploadResourceModal({
  catalogue,
  onClose,
  onSuccess,
}: {
  catalogue?: AcademicCatalogue | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  // Section A: Academic Identification
  const [facultyId, setFacultyId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programmeId, setProgrammeId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [courseOfferingId, setCourseOfferingId] = useState('');

  // Section B: Resource Information
  const [title, setTitle] = useState('');
  const [resourceTypeId, setResourceTypeId] = useState('');
  const [description, setDescription] = useState('');
  const [examYear, setExamYear] = useState('');

  // Section C: File Uploads (Multiple images or single PDF)
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Section D: Access & Publication
  const [accessPolicy, setAccessPolicy] = useState('subscription_or_entitlement');
  const [requiresVerification, setRequiresVerification] = useState(true);
  const [previewPolicy, setPreviewPolicy] = useState<'none' | 'public_sample' | 'authenticated_only'>('none');
  const [previewContent, setPreviewContent] = useState('');
  const [isPublished, setIsPublished] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Filter departments based on faculty
  const availableDepts = useMemo(() => {
    if (!catalogue) return [];
    return facultyId
      ? catalogue.departments.filter((d) => String(d.faculty_id) === facultyId)
      : catalogue.departments;
  }, [catalogue, facultyId]);

  // Filter programmes based on faculty/dept
  const availableProgrammes = useMemo(() => {
    if (!catalogue) return [];
    return facultyId
      ? catalogue.programmes.filter((p) => String(p.faculty_id) === facultyId)
      : catalogue.programmes;
  }, [catalogue, facultyId]);

  // Available Course Offerings matching selection
  const availableOfferings = useMemo(() => {
    if (!catalogue) return [];
    const list: Array<{
      offeringId: number;
      courseId: number;
      courseCode: string;
      courseTitle: string;
      creditUnits: number | null;
      levelName: string | null;
      semesterNumber: number | null;
      sessionName: string | null;
      curriculumVersion: string;
    }> = [];

    for (const course of catalogue.courses) {
      if (programmeId && String(course.programme_id) !== programmeId) continue;
      if (departmentId && String(course.department_id) !== departmentId) continue;

      for (const off of course.offerings) {
        if (sessionId && String(off.academic_session_id) !== sessionId) continue;
        if (levelId && String(off.academic_level_id) !== levelId) continue;
        if (semesterId && String(off.semester_id) !== semesterId) continue;

        list.push({
          offeringId: off.id,
          courseId: course.id,
          courseCode: course.code,
          courseTitle: course.title,
          creditUnits: off.credit_units,
          levelName: off.level,
          semesterNumber: off.semester,
          sessionName: off.academic_session,
          curriculumVersion: off.curriculum_version,
        });
      }
    }
    return list;
  }, [catalogue, programmeId, departmentId, sessionId, levelId, semesterId]);

  // Selected Offering details
  const selectedOffering = useMemo(() => {
    return availableOfferings.find((o) => String(o.offeringId) === courseOfferingId) ?? null;
  }, [availableOfferings, courseOfferingId]);

  // File handling
  const addFiles = (newFiles: FileList | File[]) => {
    const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
    const added: UploadFileItem[] = [];
    let currentCount = files.length;

    Array.from(newFiles).forEach((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      if (!validExtensions.includes(ext)) {
        setErr(`Unsupported file type: ${f.name}. Supported formats: PDF, JPG, PNG, WebP.`);
        return;
      }
      currentCount += 1;
      added.push({
        id: `${Date.now()}-${Math.random()}`,
        file: f,
        pageOrder: currentCount,
      });
    });

    setFiles((prev) => [...prev, ...added]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.map((item, i) => ({ ...item, pageOrder: i + 1 }));
    });
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    setFiles((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy.map((item, i) => ({ ...item, pageOrder: i + 1 }));
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setErr('Please select or drop at least one file or image to upload.');
      return;
    }
    setUploading(true);
    setErr(null);

    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('description', description.trim() || '');
    formData.append('is_published', isPublished ? 'true' : 'false');
    formData.append('access_policy', accessPolicy);
    formData.append('requires_verification', requiresVerification ? 'true' : 'false');
    formData.append('preview_policy', previewPolicy);
    if (previewContent.trim()) {
      formData.append('preview_content', previewContent.trim());
    }

    if (resourceTypeId) formData.append('resource_type_id', resourceTypeId);
    if (courseOfferingId) formData.append('course_offering_id', courseOfferingId);
    if (selectedOffering) formData.append('course_id', String(selectedOffering.courseId));
    if (levelId) formData.append('academic_level_id', levelId);
    if (sessionId) formData.append('academic_session_id', sessionId);
    if (semesterId) formData.append('semester_id', semesterId);

    // Append ordered files
    files.forEach((item) => {
      formData.append('files', item.file);
    });

    try {
      await adminService.uploadResource(formData);
      onSuccess();
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : 'Unable to upload learning resource.');
      setUploading(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Upload Learning Material" size="xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {err && <Alert tone="error">{err}</Alert>}

        {/* SECTION A: ACADEMIC IDENTIFICATION */}
        <section className="p-4 bg-ink-50 rounded-2xl border border-ink-100 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-ink-200">
            <GraduationCap className="h-5 w-5 text-teal-700" />
            <h3 className="font-display font-bold text-sm text-ink-950 uppercase tracking-wider">
              Section A: Academic Directory Alignment
            </h3>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <Select
              label="1. Faculty"
              value={facultyId}
              onChange={(e) => {
                setFacultyId(e.target.value);
                setDepartmentId('');
                setProgrammeId('');
                setCourseOfferingId('');
              }}
            >
              <option value="">All faculties</option>
              {catalogue?.faculties.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>

            <Select
              label="2. Department"
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setCourseOfferingId('');
              }}
            >
              <option value="">All departments</option>
              {availableDepts.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>

            <Select
              label="3. Programme"
              value={programmeId}
              onChange={(e) => {
                setProgrammeId(e.target.value);
                setCourseOfferingId('');
              }}
            >
              <option value="">All programmes</option>
              {availableProgrammes.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>

            <Select
              label="4. Academic Session"
              value={sessionId}
              onChange={(e) => {
                setSessionId(e.target.value);
                setCourseOfferingId('');
              }}
            >
              <option value="">Select session</option>
              {catalogue?.sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>

            <Select
              label="5. Level"
              value={levelId}
              onChange={(e) => {
                setLevelId(e.target.value);
                setCourseOfferingId('');
              }}
            >
              <option value="">Select level</option>
              {catalogue?.levels.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>

            <Select
              label="6. Semester"
              value={semesterId}
              onChange={(e) => {
                setSemesterId(e.target.value);
                setCourseOfferingId('');
              }}
            >
              <option value="">Select semester</option>
              {catalogue?.semesters.map((s) => (
                <option key={s.id} value={s.id}>{s.number === 1 ? 'First' : 'Second'} Semester</option>
              ))}
            </Select>
          </div>

          <div>
            <Select
              label="7. Registered Course Offering"
              value={courseOfferingId}
              onChange={(e) => setCourseOfferingId(e.target.value)}
              className="bg-white font-medium"
            >
              <option value="">-- Select corresponding Course Offering --</option>
              {availableOfferings.map((off) => (
                <option key={off.offeringId} value={off.offeringId}>
                  {off.courseCode}: {off.courseTitle} ({off.creditUnits ?? 0} Units • {off.levelName} • Sem {off.semesterNumber})
                </option>
              ))}
            </Select>
          </div>

          {selectedOffering && (
            <div className="p-3 bg-teal-50/80 rounded-xl border border-teal-200 text-xs text-teal-950 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-700 shrink-0" />
                <span className="font-semibold">Auto-populated:</span>
                <span className="font-bold text-teal-900">{selectedOffering.courseCode} — {selectedOffering.courseTitle}</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-teal-800">
                <Badge tone="teal">{selectedOffering.creditUnits ?? 0} Credit Units</Badge>
                <span>Curriculum: {selectedOffering.curriculumVersion}</span>
              </div>
            </div>
          )}
        </section>

        {/* SECTION B: RESOURCE INFORMATION */}
        <section className="space-y-3.5">
          <div className="flex items-center gap-2 pb-2 border-b border-ink-100">
            <FileText className="h-5 w-5 text-teal-700" />
            <h3 className="font-display font-bold text-sm text-ink-950 uppercase tracking-wider">
              Section B: Resource Information
            </h3>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Input
              label="Resource Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g. MCB322 Lecture Handout: Bacterial Diversity"
            />
            <Select
              label="Resource Type"
              value={resourceTypeId}
              onChange={(e) => setResourceTypeId(e.target.value)}
            >
              <option value="">Select Resource Type</option>
              {catalogue?.resource_types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Input
              label="Description / Syllabus Notes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Key concepts covered, textbook chapters, or exam details..."
            />
            <Input
              label="Academic Session / Exam Year"
              value={examYear}
              onChange={(e) => setExamYear(e.target.value)}
              placeholder="e.g. 2025/2026 Session"
            />
          </div>
        </section>

        {/* SECTION C: FILE UPLOAD (MULTI-IMAGE / PDF) */}
        <section className="space-y-3.5">
          <div className="flex items-center gap-2 pb-2 border-b border-ink-100">
            <Upload className="h-5 w-5 text-teal-700" />
            <h3 className="font-display font-bold text-sm text-ink-950 uppercase tracking-wider">
              Section C: Document & Image Upload
            </h3>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
            }}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
              isDragging ? 'border-teal-500 bg-teal-50/50' : 'border-ink-200 hover:border-teal-400 bg-ink-50/30'
            }`}
          >
            <input
              type="file"
              id="resource-files-input"
              multiple
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); }}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="h-10 w-10 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center">
                <Upload className="h-5 w-5" />
              </div>
              <p className="text-xs font-semibold text-ink-900">
                Drag and drop your PDF or photographed test pages here, or{' '}
                <label htmlFor="resource-files-input" className="text-teal-700 font-bold cursor-pointer hover:underline">
                  browse files
                </label>
              </p>
              <p className="text-[11px] text-ink-500">
                Supported formats: PDF (.pdf), JPEG (.jpg, .jpeg), PNG (.png), WebP (.webp). Max 50 MB.
              </p>
            </div>
          </div>

          {/* List of ordered files */}
          {files.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs font-bold text-ink-700 px-1">
                <span>{files.length} File{files.length === 1 ? '' : 's'} Selected (Series order preserved)</span>
                <span className="text-ink-500 font-normal">
                  Total: {(files.reduce((acc, cur) => acc + cur.file.size, 0) / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {files.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-ink-200 shadow-xs text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="shrink-0 px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-teal-50 text-teal-800 border border-teal-200">
                        Page {item.pageOrder}
                      </span>
                      <div className="truncate">
                        <p className="font-semibold text-ink-900 truncate">{item.file.name}</p>
                        <p className="text-[10px] text-ink-400 font-mono">
                          {(item.file.size / 1024).toFixed(0)} KB • {item.file.type || 'Document'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveFile(idx, 'up')}
                        disabled={idx === 0}
                        title="Move Up"
                        className="p-1 rounded text-ink-500 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveFile(idx, 'down')}
                        disabled={idx === files.length - 1}
                        title="Move Down"
                        className="p-1 rounded text-ink-500 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        title="Remove file"
                        className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* SECTION D: ACCESS AND PUBLICATION */}
        <section className="space-y-3.5">
          <div className="flex items-center gap-2 pb-2 border-b border-ink-100">
            <Lock className="h-5 w-5 text-teal-700" />
            <h3 className="font-display font-bold text-sm text-ink-950 uppercase tracking-wider">
              Section D: Access & Publication Control
            </h3>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Select
              label="Access Policy"
              value={accessPolicy}
              onChange={(e) => setAccessPolicy(e.target.value)}
            >
              <option value="subscription_or_entitlement">Subscription or Entitlement Required</option>
              <option value="entitlement_only">Direct Micro-Entitlement Only (₦300 Pass)</option>
              <option value="public">Public (Free Download)</option>
            </Select>

            <Select
              label="Preview Policy"
              value={previewPolicy}
              onChange={(e) => setPreviewPolicy(e.target.value as typeof previewPolicy)}
            >
              <option value="none">No Preview (Locked until authorized)</option>
              <option value="public_sample">Public Sample Excerpt (Open to all)</option>
              <option value="authenticated_only">Preview for Signed-In Students Only</option>
            </Select>
          </div>

          {previewPolicy !== 'none' && (
            <div>
              <label className="text-xs font-bold text-ink-700 block mb-1">
                Sample Excerpt / Key Formulas / Notes Summary
              </label>
              <textarea
                value={previewContent}
                onChange={(e) => setPreviewContent(e.target.value)}
                rows={3}
                className="w-full text-xs font-sans rounded-xl border border-ink-200 p-2.5 focus:border-teal-500 focus:outline-none"
                placeholder="Enter approved sample notes or excerpt to preview..."
              />
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-ink-50 rounded-xl">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="req-verification"
                checked={requiresVerification}
                onChange={(e) => setRequiresVerification(e.target.checked)}
                className="rounded text-teal-600 focus:ring-teal-500"
              />
              <label htmlFor="req-verification" className="text-xs font-bold text-ink-800">
                Requires Student Verification (Matric / JAMB verified)
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="publish-toggle"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="rounded text-teal-600 focus:ring-teal-500"
              />
              <label htmlFor="publish-toggle" className="text-xs font-bold text-ink-800">
                Publish Immediately (Visible to students)
              </label>
            </div>
          </div>
        </section>

        <div className="mt-6 flex justify-end gap-2.5 pt-4 border-t border-ink-100">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={uploading} leftIcon={<Upload className="h-4 w-4" />}>
            Upload Learning Material
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditResourceModal({
  item,
  onClose,
  onSuccess,
}: {
  item: AdminResourceItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const [isPublished, setIsPublished] = useState(item.is_published);
  const [accessPolicy, setAccessPolicy] = useState(item.access_policy);
  const [previewPolicy, setPreviewPolicy] = useState<'none' | 'public_sample' | 'authenticated_only'>(item.preview_policy ?? 'none');
  const [previewContent, setPreviewContent] = useState(item.preview_content ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await adminService.updateResource(item.id, {
        title: title.trim(),
        description: description.trim() || null,
        is_published: isPublished,
        access_policy: accessPolicy,
        preview_policy: previewPolicy,
        preview_content: previewContent.trim() || null,
      });
      onSuccess();
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : 'Unable to update resource.');
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={`Edit Material: ${item.file_name}`} size="md">
      <form onSubmit={save} className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}

        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />

        <Select label="Access Policy" value={accessPolicy} onChange={(e) => setAccessPolicy(e.target.value)}>
          <option value="subscription_or_entitlement">Subscription or Entitlement Required</option>
          <option value="entitlement_only">Direct Entitlement Only</option>
          <option value="public">Public Access</option>
        </Select>

        <Select
          label="Preview Policy"
          value={previewPolicy}
          onChange={(e) => setPreviewPolicy(e.target.value as typeof previewPolicy)}
        >
          <option value="none">No Preview (Protected/Restricted)</option>
          <option value="public_sample">Public Sample Excerpt (Open to all visitors)</option>
          <option value="authenticated_only">Preview for Signed-In Students Only</option>
        </Select>

        {previewPolicy !== 'none' && (
          <div>
            <label className="text-xs font-bold text-ink-700 block mb-1">
              Sample Excerpt / Key Formulas Notes
            </label>
            <textarea
              value={previewContent}
              onChange={(e) => setPreviewContent(e.target.value)}
              rows={4}
              className="w-full text-xs font-sans rounded-xl border border-ink-200 p-2.5 focus:border-teal-500 focus:outline-none"
              placeholder="Enter approved sample notes or excerpt to display to students..."
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="edit-publish-toggle"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="rounded text-teal-600 focus:ring-teal-500"
          />
          <label htmlFor="edit-publish-toggle" className="text-xs font-bold text-ink-800">
            Resource is Published
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2.5 pt-3 border-t border-ink-100">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save changes</Button>
        </div>
      </form>
    </Dialog>
  );
}
