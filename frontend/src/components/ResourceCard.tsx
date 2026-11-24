import { Link } from 'react-router-dom';
import type { Course, Resource } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { FileText, BookOpen, FileQuestion, GraduationCap, ClipboardList, Lock, Download } from 'lucide-react';
import { formatRelative } from '@/utils/format';

const typeIcon: Record<string, typeof FileText> = {
  'Lecture Notes': FileText,
  Handout: BookOpen,
  'Past Question': FileQuestion,
  'Practice Material': ClipboardList,
  'Study Guide': GraduationCap,
};

export function ResourceCard({ resource, course }: { resource: Resource; course: Course }) {
  const Icon = typeIcon[resource.type] ?? FileText;
  const isMTH201 = (course.code || '').toUpperCase().replace(/\s+/g, '') === 'MTH201' || (course.title || '').toLowerCase().includes('mathematical method');
  const is100L = resource.level === '100' || (course.code || '').match(/^[A-Z]+\s*1/i);

  return (
    <Link to={`/materials/${resource.id}`} className="block group h-full">
      <Card className="h-full p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop hover:border-teal-200">
        <div className="flex items-start justify-between gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {isMTH201 && <Badge tone="amber">🔥 Pass-Booster</Badge>}
            {is100L && !isMTH201 && <Badge tone="green">✨ 100L Foundation</Badge>}
            <Badge tone="teal">{resource.type}</Badge>
          </div>
        </div>
        <h3 className="mt-4 font-display font-bold text-ink-950 leading-snug group-hover:text-teal-700 transition-colors">
          {resource.title}
        </h3>
        <p className="mt-1 text-sm font-semibold text-ink-600">
          {course.code} &middot; {course.title}
        </p>
        <p className="mt-2 text-sm text-ink-600 line-clamp-2">{resource.description}</p>
        <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-ink-100">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
            <Badge tone="neutral">Level {resource.level}</Badge>
            <Badge tone="neutral">{resource.semester}</Badge>
            {resource.fileSizeBytes ? <span className="hidden sm:inline">· {formatFileSize(resource.fileSizeBytes)}</span> : null}
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold">
            {resource.accessPolicy === 'public' ? (
              <span className="inline-flex items-center gap-1 text-teal-700"><Download className="h-3.5 w-3.5" /> Public access</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-ink-400"><Lock className="h-3.5 w-3.5" /> Access controlled</span>
            )}
          </div>
        </div>
        <p className="mt-2 text-[0.6875rem] text-ink-400">Added {formatRelative(resource.uploadedAt)}</p>
      </Card>
    </Link>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
