import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { catalogService } from '@/services/catalog';
import type { AcademicCatalogue, Level, ResourceType, Semester } from '@/types';
import type { ResourcePage } from '@/services/catalog';
import { ResourceCard } from '@/components/ResourceCard';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Search, SlidersHorizontal, X, RotateCcw, ChevronLeft, ChevronRight, BookX } from 'lucide-react';

const PAGE_SIZE = 9;

export function MaterialsPage() {
  const [params, setParams] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [catalogue, setCatalogue] = useState<AcademicCatalogue | null>(null);
  const [result, setResult] = useState<ResourcePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const q = params.get('q') ?? '';
  const courseId = params.get('course') ?? '';
  const departmentId = params.get('department') ?? '';
  const level = (params.get('level') ?? '') as Level | '';
  const semester = (params.get('semester') ?? '') as Semester | '';
  const type = (params.get('type') ?? '') as ResourceType | '';
  const sort = (params.get('sort') ?? 'relevance') as 'relevance' | 'newest' | 'title-asc' | 'title-desc';
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);

  const departments = catalogue?.departments ?? [];
  const courses = catalogue?.courses ?? [];
  const resourceTypes = catalogue?.resource_types.map((item) => item.name) ?? [];
  const levels = catalogue?.levels.map((item) => item.code) ?? [];
  const semesters: Semester[] = ['First', 'Second'];

  useEffect(() => {
    let active = true;
    catalogService.getAcademicCatalogue()
      .then((data) => { if (active) setCatalogue(data); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load academic filters.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    catalogService.queryResources({
      q,
      courseId: courseId || null,
      departmentId: departmentId || null,
      level: level || null,
      semester: semester || null,
      type: type || null,
      sort,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((response) => { if (active) setResult(response); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load learning materials.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [q, courseId, departmentId, level, semester, type, sort, page]);

  const update = useCallback((patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (!v) next.delete(k);
      else next.set(k, v);
    });
    setParams(next, { replace: false });
  }, [params, setParams]);

  const resetFilters = () => setParams(q ? { q } : {}, { replace: false });

  const activeFilterCount = [courseId, departmentId, level, semester, type].filter(Boolean).length;

  // close drawer when route changes
  useEffect(() => { setDrawerOpen(false); }, [page]);

  return (
    <div className="container-page py-8 sm:py-10">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-950">Learning Materials</h1>
        <p className="mt-1.5 text-sm text-ink-600 max-w-2xl">
          Browse available lecture notes, handouts, past questions, and study guides. Resource access is checked when you request a download.
        </p>
      </div>

      {/* Search + mobile filter toggle */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <Input
            type="search"
            value={q}
            onChange={(e) => update({ q: e.target.value, page: '' })}
            placeholder="Search course codes, titles, or keywords..."
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            leftIcon={<SlidersHorizontal className="h-4 w-4" />}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
          <Select
            aria-label="Sort"
            value={sort}
            onChange={(e) => update({ sort: e.target.value, page: '' })}
            className="sm:w-44"
          >
            <option value="relevance">Most relevant</option>
            <option value="newest">Newest first</option>
            <option value="title-asc">Title A–Z</option>
            <option value="title-desc">Title Z–A</option>
          </Select>
        </div>
      </div>

      {/* Quick Priority Spotlight Tags */}
      <div className="flex flex-wrap items-center gap-2 mb-6 text-xs">
        <span className="font-semibold text-ink-500">Academic Focus:</span>
        <button
          type="button"
          onClick={() => update({ level: '100', q: '', page: '' })}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border transition font-medium ${level === '100'
            ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
            : 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
            }`}
        >
          <span>✨ 100L Foundation Gateway (First-Year Essentials)</span>
        </button>
        <button
          type="button"
          onClick={() => update({ q: 'MTH201', page: '' })}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border transition font-medium ${q.toUpperCase().includes('MTH201')
            ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
            : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
            }`}
        >
          <span>🔥 MTH201 Pass-Booster (Mathematical Methods PQ &amp; Solutions)</span>
        </button>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr] gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block">
          <FilterPanel
            departmentId={departmentId}
            courseId={courseId}
            level={level}
            semester={semester}
            type={type}
            departments={departments}
            courses={courses}
            levels={levels}
            semesters={semesters}
            types={resourceTypes}
            onChange={update}
            onReset={resetFilters}
            activeCount={activeFilterCount}
          />
        </aside>

        {/* Results */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-ink-600">
              <span className="font-semibold text-ink-900">{result?.total ?? 0}</span> resource{result?.total !== 1 ? 's' : ''}
              {q && <> for &ldquo;{q}&rdquo;</>}
            </p>
            {activeFilterCount > 0 && (
              <button onClick={resetFilters} className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-800">
                <RotateCcw className="h-3.5 w-3.5" /> Reset filters
              </button>
            )}
          </div>

          {error ? (
            <Card className="p-5 border-red-200 text-sm text-red-700">{error}</Card>
          ) : loading ? (
            <Card className="p-5 text-sm text-ink-600">Loading learning materials…</Card>
          ) : !result || result.items.length === 0 ? (
            <EmptyState
              icon={<BookX className="h-7 w-7" />}
              title="No learning materials available"
              description={
                activeFilterCount || q
                  ? 'No published materials match those search terms and filters. Try clearing filters or a different search.'
                  : 'Learning materials will appear here when they are published.'
              }
              action={
                <Button variant="outline" onClick={resetFilters} leftIcon={<RotateCcw className="h-4 w-4" />}>
                  Clear all filters
                </Button>
              }
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {result.items.map((r) => (
                  <ResourceCard key={r.id} resource={r} course={r.course} />
                ))}
              </div>

              {/* Pagination */}
              {result.totalPages > 1 && (
                <nav className="mt-8 flex items-center justify-between" aria-label="Pagination">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => update({ page: String(page - 1) })}
                    leftIcon={<ChevronLeft className="h-4 w-4" />}
                  >
                    Previous
                  </Button>
                  <p className="text-sm text-ink-600">
                    Page <span className="font-semibold text-ink-900">{page}</span> of {result.totalPages}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= result.totalPages}
                    onClick={() => update({ page: String(page + 1) })}
                    rightIcon={<ChevronRight className="h-4 w-4" />}
                  >
                    Next
                  </Button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>

      {/* Mobile filter drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-white rounded-t-2xl shadow-pop animate-slide-up flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
              <h2 className="font-display font-bold text-ink-950">Filters</h2>
              <button onClick={() => setDrawerOpen(false)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-4">
              <FilterPanel
                departmentId={departmentId}
                courseId={courseId}
                level={level}
                semester={semester}
                type={type}
                departments={departments}
                courses={courses}
                levels={levels}
                semesters={semesters}
                types={resourceTypes}
                onChange={update}
                onReset={resetFilters}
                activeCount={activeFilterCount}
                mobile
              />
            </div>
            <div className="px-4 py-3 border-t border-ink-100">
              <Button fullWidth onClick={() => setDrawerOpen(false)}>Show {result?.total ?? 0} results</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface FilterPanelProps {
  departmentId: string;
  courseId: string;
  level: Level | '';
  semester: Semester | '';
  type: ResourceType | '';
  departments: Array<{ id: number; name: string }>;
  courses: Array<{ id: number; code: string; title: string }>;
  levels: Level[];
  semesters: Semester[];
  types: ResourceType[];
  onChange: (patch: Record<string, string>) => void;
  onReset: () => void;
  activeCount?: number;
  mobile?: boolean;
}

function FilterPanel(props: FilterPanelProps) {
  const { departmentId, courseId, level, semester, type, departments, courses, levels, semesters, types, onChange, onReset } = props;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-bold text-ink-950 text-sm uppercase tracking-wide">Filter</h3>
        <button onClick={onReset} className="text-xs font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1">
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </div>
      <div className="space-y-4">
        <Select label="Course" value={courseId} onChange={(e) => onChange({ course: e.target.value, page: '' })}>
          <option value="">All courses</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>{course.code} · {course.title}</option>
          ))}
        </Select>
        <Select label="Department" value={departmentId} onChange={(e) => onChange({ department: e.target.value, page: '' })}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
        <Select label="Level" value={level} onChange={(e) => onChange({ level: e.target.value, page: '' })}>
          <option value="">All levels</option>
          {levels.map((l) => (
            <option key={l} value={l}>Level {l}</option>
          ))}
        </Select>
        <Select label="Semester" value={semester} onChange={(e) => onChange({ semester: e.target.value, page: '' })}>
          <option value="">Both semesters</option>
          {semesters.map((s) => (
            <option key={s} value={s}>{s} semester</option>
          ))}
        </Select>
        <Select label="Resource type" value={type} onChange={(e) => onChange({ type: e.target.value, page: '' })}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
      </div>
      {props.activeCount ? (
        <div className="mt-4 pt-4 border-t border-ink-100">
          <Badge tone="teal">{props.activeCount} filter{props.activeCount !== 1 ? 's' : ''} active</Badge>
        </div>
      ) : null}
    </Card>
  );
}
