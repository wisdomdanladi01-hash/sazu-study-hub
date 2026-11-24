import { useEffect, useState } from 'react';
import { adminService, type AdminCourseOffering } from '@/services/admin';
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
  Search,
  Edit2,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export function AdminCourseOfferingsPage() {
  const [offerings, setOfferings] = useState<AdminCourseOffering[]>([]);
  const [catalogue, setCatalogue] = useState<AcademicCatalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [programmeFilter, setProgrammeFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [coverageFilter, setCoverageFilter] = useState('');

  // Edit offering modal
  const [editItem, setEditItem] = useState<AdminCourseOffering | null>(null);

  const loadData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      adminService.listCourseOfferings(),
      catalogService.getAcademicCatalogue(),
    ])
      .then(([oList, cat]) => {
        setOfferings(oList);
        setCatalogue(cat);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load course offerings.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = offerings.filter((item) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      item.course_code.toLowerCase().includes(q) ||
      item.course_title.toLowerCase().includes(q);
    const matchesProg = !programmeFilter || String(item.programme_id) === programmeFilter;
    const matchesLevel = !levelFilter || item.level === levelFilter;
    const matchesSem = !semesterFilter || String(item.semester) === semesterFilter;
    const matchesStatus = !statusFilter || item.verification_status === statusFilter;
    const matchesCoverage = (() => {
      if (!coverageFilter) return true;
      const cov = item.coverage;
      if (!cov) return coverageFilter === 'missing_all';
      if (coverageFilter === 'complete') return cov.status === 'complete';
      if (coverageFilter === 'partial') return cov.status === 'partial';
      if (coverageFilter === 'missing_all') return cov.status === 'missing_all';
      if (coverageFilter === 'lacking_handout') return !cov.has_handout;
      if (coverageFilter === 'lacking_test_pq') return !cov.has_test_pq;
      if (coverageFilter === 'lacking_exam_pq') return !cov.has_exam_pq;
      return true;
    })();
    return matchesSearch && matchesProg && matchesLevel && matchesSem && matchesStatus && matchesCoverage;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-950">Course Offerings &amp; Verification</h1>
          <p className="mt-1 text-sm text-ink-600">
            View, verify, and update curriculum course units and semester allocations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} loading={loading} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Refresh
          </Button>
          <Link to="/admin/import">
            <Button size="sm" leftIcon={<FileSpreadsheet className="h-4 w-4" />}>
              Import CSV
            </Button>
          </Link>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {/* Filter Controls */}
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="sm:col-span-2 xl:col-span-2">
            <Input
              label="Search course"
              type="search"
              placeholder="Code (e.g. CSC202) or title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
            />
          </div>
          <Select label="Programme" value={programmeFilter} onChange={(e) => setProgrammeFilter(e.target.value)}>
            <option value="">All programmes</option>
            {catalogue?.programmes.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Select label="Level" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
            <option value="">All levels</option>
            {catalogue?.levels.map((l) => (
              <option key={l.id} value={l.code}>{l.name}</option>
            ))}
          </Select>
          <Select label="Semester" value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)}>
            <option value="">All semesters</option>
            <option value="1">1st Semester</option>
            <option value="2">2nd Semester</option>
          </Select>
          <Select label="Material Completeness" value={coverageFilter} onChange={(e) => setCoverageFilter(e.target.value)}>
            <option value="">All completeness</option>
            <option value="complete">Complete (3/3)</option>
            <option value="partial">Partial materials</option>
            <option value="missing_all">Missing all (0/3)</option>
            <option value="lacking_handout">Lacking Handout</option>
            <option value="lacking_test_pq">Lacking Test PQ</option>
            <option value="lacking_exam_pq">Lacking Exam PQ</option>
          </Select>
          <Select label="Verification" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="verified">Verified</option>
            <option value="user_supplied">User-supplied</option>
            <option value="pending_confirmation">Pending confirmation</option>
          </Select>
        </div>
      </Card>

      {/* Table of Offerings */}
      <Card className="overflow-hidden">
        <div className="p-4 bg-ink-50 border-b border-ink-100 flex items-center justify-between">
          <span className="text-xs font-bold text-ink-700">
            Showing {filtered.length} of {offerings.length} course offering{offerings.length === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            <Badge tone="green">Verified</Badge>
            <Badge tone="amber">User-supplied / Pending</Badge>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-ink-500">
            No course offerings match the filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50/50 border-b border-ink-100 text-xs font-bold uppercase text-ink-600">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Course Title</th>
                  <th className="px-4 py-3">Programme</th>
                  <th className="px-4 py-3">Level &amp; Sem</th>
                  <th className="px-4 py-3">Units</th>
                  <th className="px-4 py-3">Curriculum / Session</th>
                  <th className="px-4 py-3">Material Completeness</th>
                  <th className="px-4 py-3">Verification</th>
                  <th className="px-4 py-3">Source Note</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((item) => {
                  const isVerified = item.verification_status === 'verified';
                  return (
                    <tr key={item.id} className="hover:bg-ink-50/50">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-ink-800">{item.course_code}</td>
                      <td className="px-4 py-3 font-semibold text-ink-950 max-w-xs">{item.course_title}</td>
                      <td className="px-4 py-3 text-xs text-ink-600 truncate max-w-xs">{item.programme_name ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-ink-700 whitespace-nowrap">
                        Level {item.level ?? '—'} &middot; {item.semester === 1 ? '1st' : item.semester === 2 ? '2nd' : '—'} sem
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-ink-800">{item.credit_units ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-ink-500 whitespace-nowrap">
                        {item.academic_session ? `${item.academic_session} (${item.curriculum_version})` : item.curriculum_version}
                      </td>
                      <td className="px-4 py-3">
                        {item.coverage ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                tone={
                                  item.coverage.status === 'complete'
                                    ? 'green'
                                    : item.coverage.status === 'partial'
                                    ? 'amber'
                                    : 'red'
                                }
                              >
                                {item.coverage.status === 'complete'
                                  ? 'Complete (3/3)'
                                  : item.coverage.status === 'partial'
                                  ? `Partial (${item.coverage.available_core_count}/3)`
                                  : 'Missing All (0/3)'}
                              </Badge>
                              <Link
                                to={`/admin/resources?search=${encodeURIComponent(item.course_code)}`}
                                className="text-[11px] font-semibold text-teal-700 hover:underline"
                                title={`Manage materials for ${item.course_code}`}
                              >
                                ({item.coverage.counts.total} item{item.coverage.counts.total === 1 ? '' : 's'})
                              </Link>
                            </div>
                            <div className="flex flex-wrap items-center gap-1 text-[10px]">
                              <span
                                className={`rounded px-1.5 py-0.5 font-medium ${
                                  item.coverage.has_handout
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-rose-50 text-rose-600 border border-rose-200 line-through'
                                }`}
                              >
                                Handout
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 font-medium ${
                                  item.coverage.has_test_pq
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-rose-50 text-rose-600 border border-rose-200 line-through'
                                }`}
                              >
                                Test PQ
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 font-medium ${
                                  item.coverage.has_exam_pq
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-rose-50 text-rose-600 border border-rose-200 line-through'
                                }`}
                              >
                                Exam PQ
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-400">No data</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={isVerified ? 'green' : 'amber'}>
                          {item.verification_status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-500 max-w-xs truncate" title={item.source_note ?? ''}>
                        {item.source_note ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setEditItem(item)} leftIcon={<Edit2 className="h-3.5 w-3.5" />}>
                          Edit
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit Offering Modal */}
      {editItem && (
        <EditOfferingModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSuccess={() => {
            setEditItem(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}

function EditOfferingModal({
  item,
  onClose,
  onSuccess,
}: {
  item: AdminCourseOffering;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [verificationStatus, setVerificationStatus] = useState(item.verification_status);
  const [sourceNote, setSourceNote] = useState(item.source_note ?? '');
  const [creditUnits, setCreditUnits] = useState(item.credit_units ? String(item.credit_units) : '');
  const [courseType, setCourseType] = useState(item.course_type ?? 'compulsory');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await adminService.updateCourseOffering(item.id, {
        verification_status: verificationStatus,
        source_note: sourceNote.trim() || null,
        credit_units: creditUnits ? Number(creditUnits) : null,
        course_type: courseType || null,
      });
      onSuccess();
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : 'Unable to update course offering.');
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={`Update Offering: ${item.course_code}`}>
      <form onSubmit={save} className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <div>
          <p className="text-xs text-ink-500 font-semibold">Course Title</p>
          <p className="text-sm font-bold text-ink-950 mt-0.5">{item.course_title}</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Select
            label="Verification status"
            value={verificationStatus}
            onChange={(e) => setVerificationStatus(e.target.value as AdminCourseOffering['verification_status'])}
          >
            <option value="verified">Verified (Official)</option>
            <option value="user_supplied">User-supplied (Unverified registration form)</option>
            <option value="pending_confirmation">Pending confirmation</option>
          </Select>
          <Input
            label="Credit units"
            type="number"
            min="1"
            max="12"
            value={creditUnits}
            onChange={(e) => setCreditUnits(e.target.value)}
            placeholder="e.g. 2"
          />
        </div>

        <Select label="Course type" value={courseType} onChange={(e) => setCourseType(e.target.value)}>
          <option value="compulsory">Compulsory</option>
          <option value="elective">Elective</option>
          <option value="general">General Studies (GST)</option>
        </Select>

        <Input
          label="Source note / Provenance"
          value={sourceNote}
          onChange={(e) => setSourceNote(e.target.value)}
          placeholder="e.g. SAZU Computer Science Registration Form (2024/2025)"
        />

        <div className="mt-6 flex justify-end gap-2.5">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save offering</Button>
        </div>
      </form>
    </Dialog>
  );
}
