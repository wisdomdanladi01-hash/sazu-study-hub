import { useEffect, useState } from 'react';
import {
  adminService,
  type AdminAcademicSession,
  type AdminDepartment,
  type AdminFaculty,
  type AdminProgramme,
  type AdminSemester,
} from '@/services/admin';
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
  Edit2,
  RefreshCw,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import { formatDate } from '@/utils/format';

type AcademicTab = 'sessions' | 'semesters' | 'faculties' | 'departments' | 'programmes';

export function AdminAcademicPage() {
  const [tab, setTab] = useState<AcademicTab>('sessions');
  const [sessions, setSessions] = useState<AdminAcademicSession[]>([]);
  const [semesters, setSemesters] = useState<AdminSemester[]>([]);
  const [faculties, setFaculties] = useState<AdminFaculty[]>([]);
  const [departments, setDepartments] = useState<AdminDepartment[]>([]);
  const [programmes, setProgrammes] = useState<AdminProgramme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [facultyFilter, setFacultyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sessionFilter, setSessionFilter] = useState<string>('');

  // Modals
  const [sessionModal, setSessionModal] = useState<{ open: boolean; item: AdminAcademicSession | null }>({ open: false, item: null });
  const [semesterModal, setSemesterModal] = useState<{ open: boolean; item: AdminSemester | null }>({ open: false, item: null });
  const [facultyModal, setFacultyModal] = useState<{ open: boolean; item: AdminFaculty | null }>({ open: false, item: null });
  const [deptModal, setDeptModal] = useState<{ open: boolean; item: AdminDepartment | null }>({ open: false, item: null });
  const [progModal, setProgModal] = useState<{ open: boolean; item: AdminProgramme | null }>({ open: false, item: null });

  const loadData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      adminService.listSessions().catch(() => [] as AdminAcademicSession[]),
      adminService.listSemesters().catch(() => [] as AdminSemester[]),
      adminService.listFaculties(),
      adminService.listDepartments(),
      adminService.listProgrammes(),
    ])
      .then(([s, sem, f, d, p]) => {
        setSessions(s);
        setSemesters(sem);
        setFaculties(f);
        setDepartments(d);
        setProgrammes(p);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load academic directory.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleSessionActive = async (session: AdminAcademicSession) => {
    try {
      await adminService.updateSession(session.id, { is_active: !session.is_active });
      setSuccess(`Academic session ${session.name} is now ${!session.is_active ? 'active' : 'inactive'}.`);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update session status.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-950">Academic Directory</h1>
          <p className="mt-1 text-sm text-ink-600">
            Manage academic sessions, semesters, faculties, departments, and degree programmes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} loading={loading} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Refresh
          </Button>
          {tab === 'sessions' && (
            <Button size="sm" onClick={() => setSessionModal({ open: true, item: null })} leftIcon={<Plus className="h-4 w-4" />}>
              Add Session
            </Button>
          )}
          {tab === 'semesters' && (
            <Button size="sm" onClick={() => setSemesterModal({ open: true, item: null })} leftIcon={<Plus className="h-4 w-4" />}>
              Add Semester
            </Button>
          )}
          {tab === 'faculties' && (
            <Button size="sm" onClick={() => setFacultyModal({ open: true, item: null })} leftIcon={<Plus className="h-4 w-4" />}>
              Add Faculty
            </Button>
          )}
          {tab === 'departments' && (
            <Button size="sm" onClick={() => setDeptModal({ open: true, item: null })} leftIcon={<Plus className="h-4 w-4" />}>
              Add Department
            </Button>
          )}
          {tab === 'programmes' && (
            <Button size="sm" onClick={() => setProgModal({ open: true, item: null })} leftIcon={<Plus className="h-4 w-4" />}>
              Add Programme
            </Button>
          )}
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {success && (
        <Alert tone="success" onClose={() => setSuccess(null)}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{success}</span>
          </div>
        </Alert>
      )}

      {/* Tabs */}
      <div className="border-b border-ink-200 flex gap-2 overflow-x-auto">
        <button
          onClick={() => { setTab('sessions'); setSearch(''); }}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${tab === 'sessions'
            ? 'border-teal-600 text-teal-800'
            : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
        >
          Academic Sessions ({sessions.length})
        </button>
        <button
          onClick={() => { setTab('semesters'); setSearch(''); }}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${tab === 'semesters'
            ? 'border-teal-600 text-teal-800'
            : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
        >
          Semesters ({semesters.length})
        </button>
        <button
          onClick={() => { setTab('faculties'); setSearch(''); }}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${tab === 'faculties'
            ? 'border-teal-600 text-teal-800'
            : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
        >
          Faculties ({faculties.length})
        </button>
        <button
          onClick={() => { setTab('departments'); setSearch(''); }}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${tab === 'departments'
            ? 'border-teal-600 text-teal-800'
            : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
        >
          Departments ({departments.length})
        </button>
        <button
          onClick={() => { setTab('programmes'); setSearch(''); }}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${tab === 'programmes'
            ? 'border-teal-600 text-teal-800'
            : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
        >
          Programmes ({programmes.length})
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input
            type="search"
            placeholder={`Search ${tab}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>
        {tab === 'semesters' && (
          <div className="w-full sm:w-64">
            <Select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)}>
              <option value="">All Academic Sessions</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.name} {s.is_active ? '(Active)' : ''}</option>
              ))}
            </Select>
          </div>
        )}
        {(tab === 'departments' || tab === 'programmes') && (
          <div className="w-full sm:w-64">
            <Select value={facultyFilter} onChange={(e) => setFacultyFilter(e.target.value)}>
              <option value="">All Faculties</option>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
          </div>
        )}
        {(tab === 'departments' || tab === 'programmes') && (
          <div className="w-full sm:w-48">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="approved_not_commenced">Approved (not commenced)</option>
              <option value="pending_confirmation">Pending confirmation</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
        )}
      </div>

      {/* TAB 1: SESSIONS */}
      {tab === 'sessions' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50/50 border-b border-ink-100 text-xs font-bold uppercase text-ink-600">
                <tr>
                  <th className="px-4 py-3">Session Name</th>
                  <th className="px-4 py-3">Starts On</th>
                  <th className="px-4 py-3">Ends On</th>
                  <th className="px-4 py-3">Active Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {sessions
                  .filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()))
                  .map((s) => (
                    <tr key={s.id} className="hover:bg-ink-50/50">
                      <td className="px-4 py-3 font-semibold text-ink-900">{s.name}</td>
                      <td className="px-4 py-3 text-xs text-ink-600">{formatDate(s.starts_on)}</td>
                      <td className="px-4 py-3 text-xs text-ink-600">{formatDate(s.ends_on)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={s.is_active ? 'green' : 'neutral'}>
                          {s.is_active ? 'Active Current Session' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleSessionActive(s)}
                        >
                          {s.is_active ? 'Set Inactive' : 'Set Active'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSessionModal({ open: true, item: s })}
                          leftIcon={<Edit2 className="h-3.5 w-3.5" />}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 2: SEMESTERS */}
      {tab === 'semesters' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50/50 border-b border-ink-100 text-xs font-bold uppercase text-ink-600">
                <tr>
                  <th className="px-4 py-3">Academic Session</th>
                  <th className="px-4 py-3">Semester</th>
                  <th className="px-4 py-3">Starts On</th>
                  <th className="px-4 py-3">Ends On</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {semesters
                  .filter((sem) => {
                    if (sessionFilter && String(sem.academic_session_id) !== sessionFilter) return false;
                    const sess = sessions.find((s) => s.id === sem.academic_session_id);
                    const label = `${sess?.name ?? ''} Semester ${sem.number}`;
                    return !search || label.toLowerCase().includes(search.toLowerCase());
                  })
                  .map((sem) => {
                    const sess = sessions.find((s) => s.id === sem.academic_session_id);
                    return (
                      <tr key={sem.id} className="hover:bg-ink-50/50">
                        <td className="px-4 py-3 font-semibold text-ink-900">
                          {sess?.name ?? `Session #${sem.academic_session_id}`}
                          {sess?.is_active && (
                            <Badge tone="teal" className="ml-2 text-[10px]">Active</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-ink-800">
                          {sem.number === 1 ? '1st Semester' : sem.number === 2 ? '2nd Semester' : `Semester ${sem.number}`}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-600">{formatDate(sem.starts_on)}</td>
                        <td className="px-4 py-3 text-xs text-ink-600">{formatDate(sem.ends_on)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSemesterModal({ open: true, item: sem })}
                            leftIcon={<Edit2 className="h-3.5 w-3.5" />}
                          >
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 3: FACULTIES */}
      {tab === 'faculties' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50/50 border-b border-ink-100 text-xs font-bold uppercase text-ink-600">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {faculties
                  .filter((f) => !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.code.toLowerCase().includes(search.toLowerCase()))
                  .map((f) => (
                    <tr key={f.id} className="hover:bg-ink-50/50">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-ink-900">{f.code}</td>
                      <td className="px-4 py-3 font-semibold text-ink-900">{f.name}</td>
                      <td className="px-4 py-3">
                        <Badge tone={f.is_active ? 'green' : 'neutral'}>
                          {f.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setFacultyModal({ open: true, item: f })} leftIcon={<Edit2 className="h-3.5 w-3.5" />}>
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 4: DEPARTMENTS */}
      {tab === 'departments' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50/50 border-b border-ink-100 text-xs font-bold uppercase text-ink-600">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Parent Faculty</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {departments
                  .filter((d) => {
                    if (facultyFilter && String(d.faculty_id) !== facultyFilter) return false;
                    if (statusFilter && d.status !== statusFilter) return false;
                    return !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.code.toLowerCase().includes(search.toLowerCase());
                  })
                  .map((d) => {
                    const parentFaculty = faculties.find((f) => f.id === d.faculty_id);
                    return (
                      <tr key={d.id} className="hover:bg-ink-50/50">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-ink-900">{d.code}</td>
                        <td className="px-4 py-3 font-semibold text-ink-900">{d.name}</td>
                        <td className="px-4 py-3 text-xs text-ink-600">
                          {parentFaculty?.name ?? <span className="text-ink-400 italic">None assigned</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={d.status === 'active' ? 'green' : 'amber'}>
                            {d.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setDeptModal({ open: true, item: d })} leftIcon={<Edit2 className="h-3.5 w-3.5" />}>
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 5: PROGRAMMES */}
      {tab === 'programmes' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50/50 border-b border-ink-100 text-xs font-bold uppercase text-ink-600">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Programme Title</th>
                  <th className="px-4 py-3">Faculty</th>
                  <th className="px-4 py-3">Award / Level</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {programmes
                  .filter((p) => {
                    if (facultyFilter && String(p.faculty_id) !== facultyFilter) return false;
                    if (statusFilter && p.status !== statusFilter) return false;
                    return !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase());
                  })
                  .map((p) => {
                    const parentFaculty = faculties.find((f) => f.id === p.faculty_id);
                    return (
                      <tr key={p.id} className="hover:bg-ink-50/50">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-ink-900">{p.code}</td>
                        <td className="px-4 py-3 font-semibold text-ink-900">{p.name}</td>
                        <td className="px-4 py-3 text-xs text-ink-600">
                          {parentFaculty?.name ?? <span className="text-ink-400 italic">None assigned</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-600">
                          {p.award ?? 'Degree'} &middot; <span className="capitalize">{p.study_level}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={p.status === 'active' ? 'green' : 'amber'}>
                            {p.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setProgModal({ open: true, item: p })} leftIcon={<Edit2 className="h-3.5 w-3.5" />}>
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* SESSION MODAL */}
      {sessionModal.open && (
        <SessionModal
          item={sessionModal.item}
          onClose={() => setSessionModal({ open: false, item: null })}
          onSuccess={() => { setSessionModal({ open: false, item: null }); loadData(); }}
        />
      )}

      {/* SEMESTER MODAL */}
      {semesterModal.open && (
        <SemesterModal
          item={semesterModal.item}
          sessions={sessions}
          onClose={() => setSemesterModal({ open: false, item: null })}
          onSuccess={() => { setSemesterModal({ open: false, item: null }); loadData(); }}
        />
      )}

      {/* FACULTY MODAL */}
      {facultyModal.open && (
        <FacultyModal
          item={facultyModal.item}
          onClose={() => setFacultyModal({ open: false, item: null })}
          onSuccess={() => { setFacultyModal({ open: false, item: null }); loadData(); }}
        />
      )}

      {/* DEPARTMENT MODAL */}
      {deptModal.open && (
        <DepartmentModal
          item={deptModal.item}
          faculties={faculties}
          programmes={programmes}
          onClose={() => setDeptModal({ open: false, item: null })}
          onSuccess={() => { setDeptModal({ open: false, item: null }); loadData(); }}
        />
      )}

      {/* PROGRAMME MODAL */}
      {progModal.open && (
        <ProgrammeModal
          item={progModal.item}
          faculties={faculties}
          onClose={() => setProgModal({ open: false, item: null })}
          onSuccess={() => { setProgModal({ open: false, item: null }); loadData(); }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// SESSION MODAL
// -------------------------------------------------------------
function SessionModal({
  item,
  onClose,
  onSuccess,
}: {
  item: AdminAcademicSession | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [startsOn, setStartsOn] = useState(item?.starts_on ?? '');
  const [endsOn, setEndsOn] = useState(item?.ends_on ?? '');
  const [isActive, setIsActive] = useState(item?.is_active ?? false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (new Date(endsOn) <= new Date(startsOn)) {
      setErr('Session end date must be later than start date.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (item) {
        await adminService.updateSession(item.id, {
          name: name.trim(),
          starts_on: startsOn,
          ends_on: endsOn,
          is_active: isActive,
        });
      } else {
        await adminService.createSession({
          name: name.trim(),
          starts_on: startsOn,
          ends_on: endsOn,
          is_active: isActive,
        });
      }
      onSuccess();
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : 'Unable to save academic session.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={item ? 'Edit Academic Session' : 'Add Academic Session'}>
      <form onSubmit={save} className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <Input
          label="Session Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. 2026/2027"
        />
        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            label="Starts On"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            required
          />
          <Input
            label="Ends On"
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            required
          />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="is_active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-ink-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
          />
          <label htmlFor="is_active" className="text-sm font-medium text-ink-800">
            Current Active Academic Session
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save Academic Session</Button>
        </div>
      </form>
    </Dialog>
  );
}

// -------------------------------------------------------------
// SEMESTER MODAL
// -------------------------------------------------------------
function SemesterModal({
  item,
  sessions,
  onClose,
  onSuccess,
}: {
  item: AdminSemester | null;
  sessions: AdminAcademicSession[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [sessionId, setSessionId] = useState(item?.academic_session_id ? String(item.academic_session_id) : (sessions[0]?.id ? String(sessions[0].id) : ''));
  const [number, setNumber] = useState(item?.number ? String(item.number) : '1');
  const [startsOn, setStartsOn] = useState(item?.starts_on ?? '');
  const [endsOn, setEndsOn] = useState(item?.ends_on ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) {
      setErr('Please select an academic session.');
      return;
    }
    if (new Date(endsOn) <= new Date(startsOn)) {
      setErr('Semester end date must be later than start date.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (item) {
        await adminService.updateSemester(item.id, {
          academic_session_id: Number(sessionId),
          number: Number(number),
          starts_on: startsOn,
          ends_on: endsOn,
        });
      } else {
        await adminService.createSemester({
          academic_session_id: Number(sessionId),
          number: Number(number),
          starts_on: startsOn,
          ends_on: endsOn,
        });
      }
      onSuccess();
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : 'Unable to save semester.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={item ? 'Edit Semester' : 'Add Semester'}>
      <form onSubmit={save} className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <Select
          label="Academic Session"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          required
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>{s.name} {s.is_active ? '(Active)' : ''}</option>
          ))}
        </Select>
        <Select
          label="Semester Term"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          required
        >
          <option value="1">1st Semester</option>
          <option value="2">2nd Semester</option>
        </Select>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            label="Starts On"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            required
          />
          <Input
            label="Ends On"
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            required
          />
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save Semester</Button>
        </div>
      </form>
    </Dialog>
  );
}

// -------------------------------------------------------------
// FACULTY MODAL
// -------------------------------------------------------------
function FacultyModal({
  item,
  onClose,
  onSuccess,
}: {
  item: AdminFaculty | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [code, setCode] = useState(item?.code ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      if (item) {
        await adminService.updateFaculty(item.id, { name: name.trim() });
      } else {
        await adminService.createFaculty({ code: code.trim().toUpperCase(), name: name.trim() });
      }
      onSuccess();
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : 'Unable to save faculty.');
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={item ? 'Edit Faculty' : 'Add Faculty'}>
      <form onSubmit={save} className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <Input label="Faculty code" value={code} onChange={(e) => setCode(e.target.value)} disabled={Boolean(item)} required placeholder="e.g. SCI" />
        <Input label="Faculty name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Faculty of Science" />
        <div className="mt-6 flex justify-end gap-2.5">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save faculty</Button>
        </div>
      </form>
    </Dialog>
  );
}

// -------------------------------------------------------------
// DEPARTMENT MODAL
// -------------------------------------------------------------
function DepartmentModal({
  item,
  faculties,
  programmes,
  onClose,
  onSuccess,
}: {
  item: AdminDepartment | null;
  faculties: AdminFaculty[];
  programmes: AdminProgramme[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [code, setCode] = useState(item?.code ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [facultyId, setFacultyId] = useState<string>(item?.faculty_id ? String(item.faculty_id) : '');
  const [programmeId, setProgrammeId] = useState<string>(item?.programme_id ? String(item.programme_id) : '');
  const [status, setStatus] = useState<string>(item?.status ?? 'active');
  const [sourceNote, setSourceNote] = useState<string>(item?.source_note ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      if (item) {
        await adminService.updateDepartment(item.id, {
          name: name.trim(),
          faculty_id: facultyId ? Number(facultyId) : null,
          programme_id: programmeId ? Number(programmeId) : null,
          status,
          source_note: sourceNote.trim() || null,
        });
      } else {
        await adminService.createDepartment({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          faculty_id: facultyId ? Number(facultyId) : null,
          programme_id: programmeId ? Number(programmeId) : null,
          status,
          source_note: sourceNote.trim() || null,
        });
      }
      onSuccess();
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : 'Unable to save department.');
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={item ? 'Edit Department' : 'Add Department'}>
      <form onSubmit={save} className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <Input label="Department code" value={code} onChange={(e) => setCode(e.target.value)} disabled={Boolean(item)} required placeholder="e.g. CMP" />
        <Input label="Department name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Computer Science" />
        <Select label="Parent faculty" value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
          <option value="">Pending faculty assignment</option>
          {faculties.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </Select>
        <Select label="Primary degree programme" value={programmeId} onChange={(e) => setProgrammeId(e.target.value)}>
          <option value="">No primary programme linked</option>
          {programmes.map((p) => (
            <option key={p.id} value={p.id}>{p.code} &middot; {p.name}</option>
          ))}
        </Select>
        <Select label="Verification status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="approved_not_commenced">Approved (not yet commenced)</option>
          <option value="pending_confirmation">Pending confirmation</option>
          <option value="inactive">Inactive</option>
        </Select>
        <Input label="Source / Verification Note" value={sourceNote} onChange={(e) => setSourceNote(e.target.value)} placeholder="e.g. Approved 2026/2027 by Senate" />
        <div className="mt-6 flex justify-end gap-2.5">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save department</Button>
        </div>
      </form>
    </Dialog>
  );
}

// -------------------------------------------------------------
// PROGRAMME MODAL
// -------------------------------------------------------------
function ProgrammeModal({
  item,
  faculties,
  onClose,
  onSuccess,
}: {
  item: AdminProgramme | null;
  faculties: AdminFaculty[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [code, setCode] = useState(item?.code ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [facultyId, setFacultyId] = useState<string>(item?.faculty_id ? String(item.faculty_id) : '');
  const [award, setAward] = useState(item?.award ?? 'B.Sc.');
  const [studyLevel, setStudyLevel] = useState(item?.study_level ?? 'undergraduate');
  const [status, setStatus] = useState<string>(item?.status ?? 'active');
  const [sourceNote, setSourceNote] = useState<string>(item?.source_note ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      if (item) {
        await adminService.updateProgramme(item.id, {
          name: name.trim(),
          faculty_id: facultyId ? Number(facultyId) : null,
          award: award.trim() || null,
          study_level: studyLevel,
          status,
          source_note: sourceNote.trim() || null,
        });
      } else {
        await adminService.createProgramme({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          faculty_id: facultyId ? Number(facultyId) : null,
          award: award.trim() || null,
          study_level: studyLevel,
          status,
          source_note: sourceNote.trim() || null,
        });
      }
      onSuccess();
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : 'Unable to save programme.');
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={item ? 'Edit Programme' : 'Add Programme'}>
      <form onSubmit={save} className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <Input label="Programme code" value={code} onChange={(e) => setCode(e.target.value)} disabled={Boolean(item)} required placeholder="e.g. BSC-COMPUTER-SCIENCE" />
        <Input label="Programme title" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Computer Science" />
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Award (Degree title)" value={award} onChange={(e) => setAward(e.target.value)} placeholder="e.g. B.Sc., LL.B., M.Sc." />
          <Select label="Study level" value={studyLevel} onChange={(e) => setStudyLevel(e.target.value)}>
            <option value="undergraduate">Undergraduate</option>
            <option value="postgraduate">Postgraduate</option>
            <option value="doctoral">Doctoral</option>
          </Select>
        </div>
        <Select label="Parent faculty" value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
          <option value="">Pending faculty assignment</option>
          {faculties.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </Select>
        <Select label="Verification status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="approved_not_commenced">Approved (not yet commenced)</option>
          <option value="pending_confirmation">Pending confirmation</option>
          <option value="inactive">Inactive</option>
        </Select>
        <Input label="Source / Verification Note" value={sourceNote} onChange={(e) => setSourceNote(e.target.value)} placeholder="e.g. Approved 2026/2027 commencement" />
        <div className="mt-6 flex justify-end gap-2.5">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save programme</Button>
        </div>
      </form>
    </Dialog>
  );
}
