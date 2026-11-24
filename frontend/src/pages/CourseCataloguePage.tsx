import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Search } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { catalogService } from '@/services/catalog';
import type { AcademicCatalogue } from '@/types';

type OfferingRow = {
  course: AcademicCatalogue['courses'][number];
  offering: AcademicCatalogue['courses'][number]['offerings'][number];
};

export function CourseCataloguePage() {
  const [catalogue, setCatalogue] = useState<AcademicCatalogue | null>(null);
  const [facultyId, setFacultyId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programmeId, setProgrammeId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    catalogService.getAcademicCatalogue()
      .then((data) => { if (active) setCatalogue(data); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load the academic catalogue.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => {
    if (!catalogue) return [];
    const term = search.trim().toLowerCase();
    return catalogue.courses.flatMap((course) => course.offerings.map((offering) => ({ course, offering })))
      .filter(({ course, offering }) => (
        (!facultyId || String(catalogue.programmes.find((programme) => programme.id === course.programme_id)?.faculty_id) === facultyId)
        && (!departmentId || String(course.department_id) === departmentId)
        && (!programmeId || String(course.programme_id) === programmeId)
        && (!sessionId || String(offering.academic_session_id) === sessionId)
        && (!levelId || String(offering.academic_level_id) === levelId)
        && (!semesterId || String(offering.semester_id) === semesterId)
        && (!term || `${course.code} ${course.title}`.toLowerCase().includes(term))
      ));
  }, [catalogue, departmentId, facultyId, levelId, programmeId, search, semesterId, sessionId]);

  return (
    <div className="container-page py-8 sm:py-12">
      <header className="mb-7 max-w-3xl">
        <Badge tone="teal" className="mb-3"><BookOpen className="h-3.5 w-3.5" /> Academic catalogue</Badge>
        <h1 className="font-display text-3xl font-extrabold text-ink-950 sm:text-4xl">Courses by level and semester</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-600 sm:text-base">
          Browse the course offerings currently listed for SAZU. Course sheets supplied for this directory are marked as unverified until confirmed against official records.
        </p>
      </header>

      <Card className="mb-6 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div className="sm:col-span-2 xl:col-span-2">
            <Input
              label="Search courses"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Code or course title"
              leftIcon={<Search className="h-4 w-4" />}
            />
          </div>
          <Select label="Faculty" value={facultyId} onChange={(event) => {
            setFacultyId(event.target.value);
            setProgrammeId('');
            setDepartmentId('');
          }}>
            <option value="">All faculties</option>
            {(catalogue?.faculties ?? []).map((faculty) => (
              <option key={faculty.id} value={faculty.id}>{faculty.name}</option>
            ))}
          </Select>
          <Select label="Department" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="">All departments</option>
            {(catalogue?.departments ?? [])
              .filter((department) => !facultyId || String(department.faculty_id) === facultyId)
              .map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
          </Select>
          <Select label="Programme" value={programmeId} onChange={(event) => setProgrammeId(event.target.value)}>
            <option value="">All programmes</option>
            {(catalogue?.programmes ?? []).filter((programme) => !facultyId || String(programme.faculty_id) === facultyId).map((programme) => (
              <option key={programme.id} value={programme.id}>{programme.name}</option>
            ))}
          </Select>
          <Select label="Academic session" value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
            <option value="">All sessions</option>
            {(catalogue?.sessions ?? []).map((session) => (
              <option key={session.id} value={session.id}>{session.name}</option>
            ))}
          </Select>
          <Select label="Level" value={levelId} onChange={(event) => setLevelId(event.target.value)}>
            <option value="">All levels</option>
            {(catalogue?.levels ?? []).map((level) => (
              <option key={level.id} value={level.id}>{level.name}</option>
            ))}
          </Select>
          <Select label="Semester" value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
            <option value="">All semesters</option>
            {(catalogue?.semesters ?? []).map((semester) => (
              <option key={semester.id} value={semester.id}>
                {semester.number === 1 ? 'First' : 'Second'} · {catalogue?.sessions.find((session) => session.id === semester.academic_session_id)?.name ?? ''}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {error ? (
        <Alert tone="error" title="Catalogue unavailable">{error}</Alert>
      ) : loading ? (
        <Card className="p-6 text-sm text-ink-600">Loading course offerings…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-ink-300" />
          <h2 className="mt-3 font-display text-xl font-bold text-ink-900">No course offerings match</h2>
          <p className="mt-2 text-sm text-ink-600">Try another session or clear one of the filters.</p>
          <Button className="mt-4" variant="outline" onClick={() => {
            setProgrammeId('');
            setFacultyId('');
            setDepartmentId('');
            setSessionId('');
            setLevelId('');
            setSemesterId('');
            setSearch('');
          }}>Clear filters</Button>
        </Card>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-600" aria-live="polite">
            <span className="font-semibold text-ink-900">{rows.length}</span> course offering{rows.length === 1 ? '' : 's'}
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map(({ course, offering }) => (
              <CourseOfferingCard key={offering.id} course={course} offering={offering} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CourseOfferingCard({ course, offering }: OfferingRow) {
  const isUnverified = offering.verification_status !== 'verified';
  const coverage = course.coverage;
  return (
    <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-pop">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-lg bg-ink-50 px-2.5 py-1 font-mono text-xs font-bold text-ink-700">{course.code}</span>
        <Badge tone={isUnverified ? 'amber' : 'green'}>
          {isUnverified ? 'Unverified listing' : 'Verified'}
        </Badge>
      </div>
      <h2 className="mt-3 font-display text-lg font-bold leading-snug text-ink-950">{course.title}</h2>
      <p className="mt-2 text-sm text-ink-600">
        {offering.level ?? 'Level not specified'}{offering.semester != null && <> <span aria-hidden>·</span> {offering.semester === 1 ? 'First' : 'Second'} semester</>}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {offering.academic_session && <Badge tone="neutral">{offering.academic_session}</Badge>}
        {offering.credit_units != null && <Badge tone="teal">{offering.credit_units} units</Badge>}
        {offering.course_type && <Badge tone="neutral">{offering.course_type}</Badge>}
      </div>

      {coverage && (
        <div className="mt-4 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-ink-700">Course Materials</span>
            <Badge
              tone={
                coverage.status === 'complete'
                  ? 'green'
                  : coverage.status === 'partial'
                  ? 'amber'
                  : 'neutral'
              }
            >
              {coverage.status === 'complete'
                ? 'Complete (3/3)'
                : coverage.status === 'partial'
                ? `${coverage.available_core_count}/3 Available`
                : 'Coming soon'}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span
              className={`rounded px-2 py-0.5 font-medium ${
                coverage.has_handout
                  ? 'bg-emerald-100/70 text-emerald-800'
                  : 'bg-ink-100 text-ink-400'
              }`}
            >
              {coverage.has_handout ? '✓ Handout' : '○ No Handout'}
            </span>
            <span
              className={`rounded px-2 py-0.5 font-medium ${
                coverage.has_test_pq
                  ? 'bg-emerald-100/70 text-emerald-800'
                  : 'bg-ink-100 text-ink-400'
              }`}
            >
              {coverage.has_test_pq ? '✓ Test PQ' : '○ No Test PQ'}
            </span>
            <span
              className={`rounded px-2 py-0.5 font-medium ${
                coverage.has_exam_pq
                  ? 'bg-emerald-100/70 text-emerald-800'
                  : 'bg-ink-100 text-ink-400'
              }`}
            >
              {coverage.has_exam_pq ? '✓ Exam PQ' : '○ No Exam PQ'}
            </span>
          </div>
        </div>
      )}

      <p className="mt-4 flex-1 text-xs leading-relaxed text-ink-500">
        {offering.source_note ?? course.source_note ?? 'Source details are not recorded.'}
      </p>
      <Link to={`/materials?course=${course.id}`} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800">
        View course materials <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  );
}
