import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogResource } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  BookOpen,
  FileQuestion,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileText,
  ClipboardList,
  Sparkles,
  Lock,
  Download,
  ArrowRight,
} from 'lucide-react';

interface CourseResourceCardProps {
  course: {
    id: number;
    code: string;
    title: string;
    department?: string;
  };
  resources: CatalogResource[];
  defaultExpanded?: boolean;
}

export function CourseResourceCard({ course, resources, defaultExpanded = false }: CourseResourceCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const isMTH201 =
    (course.code || '').toUpperCase().replace(/\s+/g, '') === 'MTH201' ||
    (course.title || '').toLowerCase().includes('mathematical method');
  const level = resources[0]?.level;
  const is100L = level === '100' || (course.code || '').match(/^[A-Z]+\s*1/i);
  const semester = resources[0]?.semester;

  const isReferenceCourse =
    (course.code || '').toUpperCase().includes('GST103') ||
    (course.code || '').toUpperCase().includes('STA105') ||
    (course.title || '').toLowerCase().includes('reference') ||
    resources.some(
      (r) =>
        (r.type || '').toLowerCase().includes('reference') ||
        (r.title || '').toLowerCase().includes('reference')
    );

  // Categorize materials
  const handouts = resources.filter(
    (r) =>
      r.type.toLowerCase().includes('handout') ||
      r.type.toLowerCase().includes('note') ||
      r.type.toLowerCase().includes('textbook') ||
      r.type.toLowerCase().includes('syllabus') ||
      r.type.toLowerCase().includes('guide')
  );

  const pastQuestions = resources.filter(
    (r) =>
      r.type.toLowerCase().includes('past question') ||
      r.type.toLowerCase().includes('test') ||
      r.type.toLowerCase().includes('exam')
  );

  const solutions = resources.filter(
    (r) =>
      r.type.toLowerCase().includes('solution') ||
      r.type.toLowerCase().includes('marking') ||
      r.type.toLowerCase().includes('calculation') ||
      r.type.toLowerCase().includes('numerical') ||
      r.type.toLowerCase().includes('answer')
  );

  const assignments = resources.filter(
    (r) =>
      r.type.toLowerCase().includes('assignment') ||
      r.type.toLowerCase().includes('problem set')
  );

  // Fallback for uncategorized
  const other = resources.filter(
    (r) =>
      !handouts.includes(r) &&
      !pastQuestions.includes(r) &&
      !solutions.includes(r) &&
      !assignments.includes(r)
  );

  return (
    <Card className="overflow-hidden border border-ink-200 transition-all duration-300 hover:shadow-md hover:border-teal-300 bg-white">
      {/* Course Card Header */}
      <div className="p-5 sm:p-6 flex flex-col justify-between">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-black text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200/80 shadow-2xs">
              {course.code}
            </span>
            {isMTH201 && (
              <Badge tone="amber" className="flex items-center gap-1 font-bold">
                <Sparkles className="h-3 w-3" /> Essential Pass-Booster
              </Badge>
            )}
            {is100L && !isMTH201 && (
              <Badge tone="green" className="font-semibold">
                ✨ 100L Foundation
              </Badge>
            )}
            {isReferenceCourse && (
              <Badge tone="purple" className="flex items-center gap-1 font-semibold border border-purple-200">
                <BookOpen className="h-3 w-3 text-purple-700" /> Reference Material
              </Badge>
            )}
            {level && <Badge tone="neutral">Level {level}</Badge>}
            {semester && <Badge tone="neutral">{semester} Semester</Badge>}
          </div>

          <Badge tone="teal" className="font-bold text-xs">
            {resources.length} {resources.length === 1 ? 'Material' : 'Materials Available'}
          </Badge>
        </div>

        <h3 className="mt-3.5 font-display text-lg sm:text-xl font-bold text-ink-950 leading-snug">
          {course.title}
        </h3>

        {course.department && (
          <p className="text-xs text-ink-500 font-medium mt-1">{course.department}</p>
        )}

        {isReferenceCourse && (
          <div className="mt-3 p-3 rounded-xl bg-purple-50/70 border border-purple-200/80 text-xs text-purple-950 leading-relaxed flex items-start gap-2">
            <span className="font-bold shrink-0 text-purple-800">External Reference Notice:</span>
            <span>
              These documents are supplementary reference materials from external university curricula (e.g. general studies or cross-institutional texts). Sourced for comparative conceptual study and literature reference only — not official SAZU syllabus materials.
            </span>
          </div>
        )}

        {/* Content Summary Breakdown Pills */}
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {handouts.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-900 font-semibold border border-teal-200/70">
              <BookOpen className="h-3.5 w-3.5 text-teal-700" />
              {handouts.length} Handout{handouts.length > 1 ? 's' : ''} &amp; Notes
            </span>
          )}
          {pastQuestions.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 font-semibold border border-amber-200/70">
              <FileQuestion className="h-3.5 w-3.5 text-amber-700" />
              {pastQuestions.length} Past Question{pastQuestions.length > 1 ? 's' : ''} / Tests
            </span>
          )}
          {solutions.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200/70">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
              {solutions.length} Worked Solution{solutions.length > 1 ? 's' : ''}
            </span>
          )}
          {assignments.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-900 font-semibold border border-sky-200/70">
              <ClipboardList className="h-3.5 w-3.5 text-sky-700" />
              {assignments.length} Model Assignment{assignments.length > 1 ? 's' : ''}
            </span>
          )}
          {other.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-ink-100 text-ink-800 font-semibold">
              <FileText className="h-3.5 w-3.5 text-ink-600" />
              {other.length} Reference{other.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Action Toggle Footer */}
        <div className="mt-5 pt-3.5 border-t border-ink-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-teal-700 hover:text-teal-900 transition cursor-pointer"
          >
            <span>{isExpanded ? 'Hide Course Materials' : `View All Course Materials (${resources.length})`}</span>
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
          </button>

          <Link
            to={`/practice?course=${encodeURIComponent(course.code)}`}
            className="text-xs font-semibold text-ink-600 hover:text-teal-700 hidden sm:inline-flex items-center gap-1"
          >
            Practice Tests <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Expanded Course Materials Breakdown */}
      {isExpanded && (
        <div className="bg-slate-50/80 border-t border-ink-200 p-4 sm:p-5 space-y-3 animate-fade-in">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-500 mb-2">
            Available Study Materials for {course.code}
          </p>

          <div className="space-y-2.5">
            {resources.map((item) => {
              const itemIsRef =
                (item.type || '').toLowerCase().includes('reference') ||
                (item.title || '').toLowerCase().includes('reference') ||
                isReferenceCourse;

              return (
                <div
                  key={item.id}
                  className="rounded-xl p-3.5 bg-white border border-ink-200 hover:border-teal-300 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-semibold text-xs px-2 py-0.5 rounded border ${itemIsRef ? 'text-purple-800 bg-purple-50 border-purple-200' : 'text-teal-800 bg-teal-50 border-teal-200/60'}`}>
                        {itemIsRef ? 'External Reference' : item.type}
                      </span>
                      {item.session && (
                        <span className="text-[11px] font-mono text-ink-600 bg-ink-100 px-2 py-0.5 rounded">
                          Session: {item.session}
                        </span>
                      )}
                      <span className="text-[11px] text-ink-500 flex items-center gap-1">
                        {item.accessPolicy === 'public' ? (
                          <>
                            <Download className="h-3 w-3 text-teal-600" /> Free Public
                          </>
                        ) : (
                          <>
                            <Lock className="h-3 w-3 text-amber-600" /> Subscribed
                          </>
                        )}
                      </span>
                    </div>

                    <h4 className="font-display font-bold text-sm text-ink-950 mt-1.5 leading-snug">
                      {item.title}
                    </h4>

                    <p className="text-xs text-ink-600 line-clamp-1 mt-0.5">
                      {item.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link to={`/materials/${item.id}`}>
                      <Button size="sm" variant="outline" className="text-xs">
                        {item.accessPolicy === 'public' ? 'Details' : 'Details / Unlock'}
                      </Button>
                    </Link>
                    <Link to={`/materials/${item.id}/read`}>
                      <Button size="sm" leftIcon={<Eye className="h-3.5 w-3.5" />} className="text-xs font-bold shadow-2xs">
                        Read
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
