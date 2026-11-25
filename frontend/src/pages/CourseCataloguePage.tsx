import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Search, GraduationCap } from 'lucide-react';
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

      {/* 100L Gateway Foundation Spotlight Banner */}
      <Card className="mb-6 overflow-hidden border-teal-200 bg-linear-to-r from-teal-50/70 via-white to-emerald-50/40 p-0 shadow-xs">
        <div className="grid sm:grid-cols-12 items-center">
          <div className="p-5 sm:p-6 sm:col-span-8 lg:col-span-9 flex flex-col sm:flex-row items-start gap-4">
            <div className="p-3 rounded-2xl bg-teal-100 text-teal-800 shrink-0 shadow-2xs">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base sm:text-lg font-bold text-ink-950">
                  100-Level Academic Gateway: Build Your CGPA Foundation Early
                </h2>
                <Badge tone="teal">Crucial for Newcomers</Badge>
              </div>
              <p className="text-xs sm:text-sm text-ink-700 leading-relaxed max-w-4xl">
                Your 100-Level grades establish the benchmark for your graduating Cumulative GPA (CGPA). Mastering early foundational sciences, general university requirements, and departmental introductory courses creates the stability needed for honors graduation. Verified Continuous Assessment (C.A.) test papers and worked marking guides are highlighted below to help first-year students study ahead and pass with distinction.
              </p>
            </div>
          </div>
          <div className="hidden sm:block sm:col-span-4 lg:col-span-3 h-full">
            <img
              src="https://images.pexels.com/photos/159711/books-bookstore-book-reading-159711.jpeg?auto=compress&cs=tinysrgb&w=800"
              alt="Academic library books and study materials"
              className="w-full h-full object-cover min-h-[140px]"
              loading="lazy"
            />
          </div>
        </div>
      </Card>

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
  const isMTH201 = course.code.toUpperCase().replace(/\s+/g, '') === 'MTH201' || course.title.toLowerCase().includes('mathematical method');
  const is100L = offering.level === '100' || course.code.match(/^[A-Z]+\s*1/i);

  return (
    <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-pop">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-ink-50 px-2.5 py-1 font-mono text-xs font-bold text-ink-700">{course.code}</span>
          {isMTH201 && (
            <Badge tone="amber">🔥 High-Impact Core</Badge>
          )}
          {is100L && !isMTH201 && (
            <Badge tone="teal">✨ 100L Foundation</Badge>
          )}
        </div>
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

      {isMTH201 && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-amber-950 mb-1">
            <span className="text-amber-600">🔥</span> Crucial Core Course · Historically Demanding
          </div>
          <p className="text-[11px] text-amber-900 leading-relaxed">
            Many students find MTH201 challenging. Having verified past test questions and step-by-step marking guides significantly improves pass rates.
          </p>
        </div>
      )}

      {is100L && !isMTH201 && (
        <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50/60 p-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-teal-950">
            <GraduationCap className="h-3.5 w-3.5 text-teal-700 shrink-0" />
            <span>First-Year Success Gateway: Essential for a stable CGPA.</span>
          </div>
        </div>
      )}

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
              className={`rounded px-2 py-0.5 font-medium ${coverage.has_handout
                ? 'bg-emerald-100/70 text-emerald-800'
                : 'bg-ink-100 text-ink-400'
                }`}
            >
              {coverage.has_handout ? '✓ Handout' : '○ No Handout'}
            </span>
            <span
              className={`rounded px-2 py-0.5 font-medium ${coverage.has_test_pq
                ? 'bg-emerald-100/70 text-emerald-800'
                : 'bg-ink-100 text-ink-400'
                }`}
            >
              {coverage.has_test_pq ? '✓ Test PQ' : '○ No Test PQ'}
            </span>
            <span
              className={`rounded px-2 py-0.5 font-medium ${coverage.has_exam_pq
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
