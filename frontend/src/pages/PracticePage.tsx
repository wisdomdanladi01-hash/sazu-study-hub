import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Clock, HelpCircle, ListChecks, Lock, Play, RotateCcw, Search, Target } from 'lucide-react';
import { assessmentService, lockMessage, type PracticeConfig } from '@/services/assessments';
import { useAuth } from '@/auth/AuthContext';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function PracticePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const [query, setQuery] = useState(searchParams.get('course') ?? '');
  const [items, setItems] = useState<PracticeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    assessmentService
      .list()
      .then((data) => active && setItems(data))
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : 'Unable to load practice tests.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // Refetch when the signed-in student changes so lock states are accurate.
  }, [profile?.id]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const cleanQ = q.replace(/[^a-z0-9]/gi, '');
    const tokens = q.split(/[\s\-_]+/).filter(Boolean);

    return items.filter((item) => {
      const candidates = [
        item.title,
        item.course.code,
        item.course.title,
        item.description ?? '',
      ].map((str) => str.toLowerCase());
      const cleanCandidates = candidates.map((str) => str.replace(/[^a-z0-9]/gi, ''));

      if (candidates.some((c) => c.includes(q))) return true;
      if (cleanQ && cleanCandidates.some((cc) => cc.includes(cleanQ))) return true;
      if (tokens.length > 1 && tokens.every((tok) => candidates.some((c) => c.includes(tok)))) return true;

      return false;
    });
  }, [items, query]);

  return (
    <div className="container-page py-8 sm:py-10 space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-950">Practice Tests</h1>
        <p className="mt-1.5 text-sm text-ink-600 max-w-2xl">
          Timed tests built from past questions and course materials. Your answers are marked by the server and every test
          shows how you did, so you know what to revise.
        </p>
      </div>

      <Alert tone="info" title="Study aid">
        Practice tests help you prepare. They are not official continuous assessments or exam scores.
      </Alert>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
        <input
          type="text"
          value={query}
          placeholder="Search by course code or title (e.g. COS 102)"
          onChange={(event) => {
            setQuery(event.target.value);
            if (searchParams.has('course')) setSearchParams({});
          }}
          className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-ink-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
        />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <p className="p-12 text-center text-sm text-ink-500">Loading practice tests…</p>
      ) : visible.length === 0 ? (
        <Card className="p-12 text-center">
          <HelpCircle className="h-10 w-10 text-ink-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-ink-900">No practice tests available</h3>
          <p className="text-sm text-ink-500 mt-1 max-w-sm mx-auto">
            {items.length === 0
              ? 'Tests appear here once your administrators publish them.'
              : 'Nothing matched your search. Try a different course code.'}
          </p>
          {query && (
            <Button className="mt-4" variant="outline" size="sm" onClick={() => setQuery('')}>
              Clear search
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {visible.map((test) => {
            const exhausted = test.max_attempts !== null && test.attempts_used >= test.max_attempts && !test.in_progress_attempt_id;
            return (
              <Card key={test.id} className="p-6 flex flex-col justify-between hover:border-teal-300 transition">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Badge tone="teal">{test.course.code}</Badge>
                    {test.requires_subscription ? <Badge tone="neutral">Subscribers</Badge> : <Badge tone="neutral">Free</Badge>}
                    {test.best_score_percent !== null && <Badge tone="neutral">Best {test.best_score_percent}%</Badge>}
                  </div>
                  <h3 className="font-display text-lg font-bold text-ink-950">{test.title}</h3>
                  <p className="text-xs font-medium text-ink-500 mt-0.5">{test.course.title}</p>
                  {test.description && <p className="mt-3 text-sm text-ink-600 line-clamp-2">{test.description}</p>}
                  <div className="mt-5 grid grid-cols-3 gap-3 p-3 bg-ink-50 rounded-xl border border-ink-100 text-xs text-ink-700">
                    <span className="flex items-center gap-1.5"><ListChecks className="h-4 w-4 text-teal-600" />{test.question_count} questions</span>
                    <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-teal-600" />{test.duration_minutes} min</span>
                    <span className="flex items-center gap-1.5"><Target className="h-4 w-4 text-teal-600" />Pass {test.pass_mark_percent}%</span>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-ink-100 flex items-center justify-between gap-3">
                  <span className="text-xs text-ink-500">
                    {test.locked ? (
                      <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" />{lockMessage(test.lock_reason)}</span>
                    ) : exhausted ? (
                      'No attempts left'
                    ) : test.max_attempts ? (
                      `${test.attempts_used}/${test.max_attempts} attempts used`
                    ) : (
                      `${test.attempts_used} attempt${test.attempts_used === 1 ? '' : 's'}`
                    )}
                  </span>
                  <Link to={`/practice/${test.id}`}>
                    <Button
                      size="sm"
                      variant={test.locked ? 'outline' : 'primary'}
                      leftIcon={test.in_progress_attempt_id ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    >
                      {test.in_progress_attempt_id ? 'Resume' : test.locked ? 'View' : 'Start'}
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-6 bg-ink-950 text-white border-ink-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-sm text-ink-300 max-w-xl">
          Revise the handouts and past questions first, then test yourself here.
        </p>
        <Link to="/materials">
          <Button variant="outline" size="sm" leftIcon={<BookOpen className="h-4 w-4" />} className="bg-transparent border-ink-700 text-ink-100 hover:bg-ink-800">
            Browse materials
          </Button>
        </Link>
      </Card>
    </div>
  );
}
