import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Clock, Lock, Play, RotateCcw, XCircle } from 'lucide-react';
import {
  assessmentService,
  lockMessage,
  type Attempt,
  type AttemptResult,
  type PracticeConfig,
} from '@/services/assessments';
import { ApiError } from '@/services/api';
import { useAuth } from '@/auth/AuthContext';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';

const LETTERS = 'ABCDE';

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function TestRunnerPage() {
  const { id = '' } = useParams();
  const configId = Number(id);
  const { profile } = useAuth();

  const [config, setConfig] = useState<PracticeConfig | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submittingRef = useRef(false);

  // Load the test summary (lock state, attempts used) for the intro screen.
  useEffect(() => {
    let active = true;
    setLoading(true);
    assessmentService
      .list()
      .then((items) => {
        if (!active) return;
        const found = items.find((item) => item.id === configId) ?? null;
        setConfig(found);
        if (!found) setError('This practice test is not available.');
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : 'Unable to load this test.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [configId, profile?.id]);

  const finish = useCallback(async (attemptId: number) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      setResult(await assessmentService.submit(attemptId));
      setConfirmOpen(false);
    } catch (cause) {
      submittingRef.current = false;
      setError(cause instanceof Error ? cause.message : 'Unable to submit your test. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  // Countdown. The server owns the deadline; this only displays it and auto-submits at zero.
  useEffect(() => {
    if (!attempt || result) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          void finish(attempt.id);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [attempt, result, finish]);

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const started = await assessmentService.start(configId);
      setAttempt(started);
      setAnswers(started.answers);
      setSecondsLeft(started.seconds_remaining);
      setIndex(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to start this test.');
    } finally {
      setBusy(false);
    }
  };

  const choose = async (questionId: number, key: string) => {
    if (!attempt) return;
    const previous = answers[String(questionId)];
    const next = previous === key ? null : key; // tapping the chosen option clears it
    setAnswers((current) => {
      const copy = { ...current };
      if (next === null) delete copy[String(questionId)];
      else copy[String(questionId)] = next;
      return copy;
    });
    try {
      await assessmentService.saveAnswer(attempt.id, questionId, next);
      setSaveWarning(null);
    } catch (cause) {
      const expired = cause instanceof ApiError && cause.status === 401;
      setSaveWarning(
        expired
          ? 'Your session expired, so answers are not being saved. Sign in again in another tab, then keep going.'
          : 'Could not save your last answer. Check your connection.',
      );
    }
  };

  if (loading) return <div className="container-page py-16 text-sm text-ink-600">Loading test…</div>;

  // ------------------------------------------------------------- results
  if (result) {
    const answered = result.answered;
    return (
      <div className="container-page py-8 max-w-3xl space-y-6">
        <Card className="p-6 sm:p-8 text-center">
          <Badge tone={result.passed ? 'teal' : 'neutral'}>{result.passed ? 'Passed' : 'Below pass mark'}</Badge>
          <h1 className="mt-3 font-display text-4xl font-bold text-ink-950">{result.score_percent}%</h1>
          <p className="mt-1 text-sm text-ink-600">
            {result.correct_count} of {result.total_questions} correct · {answered} answered · {result.grade}
          </p>
          {result.status === 'expired' && (
            <p className="mt-2 text-xs text-amber-700">Time ran out, so your saved answers were marked.</p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to="/practice">
              <Button variant="outline" leftIcon={<ArrowLeft className="h-4 w-4" />}>All tests</Button>
            </Link>
            <Button
              leftIcon={<RotateCcw className="h-4 w-4" />}
              onClick={() => {
                setResult(null);
                setAttempt(null);
                submittingRef.current = false;
                void assessmentService.list().then((items) => setConfig(items.find((item) => item.id === configId) ?? config));
              }}
            >
              Try again
            </Button>
          </div>
        </Card>

        {!result.answers_revealed ? (
          <Alert tone="info">Correct answers are not shown for this test.</Alert>
        ) : (
          result.review.map((item) => (
            <Card key={item.question_id} className="p-5">
              <div className="flex items-start gap-3">
                {item.is_correct ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900 whitespace-pre-wrap">
                    {item.number}. {item.text}
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {item.options.map((option, position) => {
                      const isCorrect = option.key === item.correct_key;
                      const isChosen = option.key === item.chosen_key;
                      return (
                        <li
                          key={option.key}
                          className={`rounded-lg border px-3 py-2 text-sm ${
                            isCorrect
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                              : isChosen
                                ? 'border-red-300 bg-red-50 text-red-900'
                                : 'border-ink-100 text-ink-700'
                          }`}
                        >
                          <span className="font-semibold mr-2">{LETTERS[position]}.</span>
                          {option.text}
                          {isCorrect && <span className="ml-2 text-xs font-semibold">Correct answer</span>}
                          {isChosen && !isCorrect && <span className="ml-2 text-xs font-semibold">Your answer</span>}
                        </li>
                      );
                    })}
                  </ul>
                  {item.chosen_key === null && <p className="mt-2 text-xs text-ink-500">You did not answer this question.</p>}
                  {item.explanation && (
                    <p className="mt-3 text-sm text-ink-700 bg-ink-50 rounded-lg p-3 whitespace-pre-wrap">{item.explanation}</p>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    );
  }

  // ------------------------------------------------------------- in progress
  if (attempt) {
    const question = attempt.questions[index];
    const answeredCount = Object.keys(answers).length;
    const low = secondsLeft <= 60;
    return (
      <div className="container-page py-6 max-w-3xl space-y-5">
        <div className="flex items-center justify-between gap-3 sticky top-[var(--header-h)] z-10 bg-ink-50/95 backdrop-blur py-2">
          <div className="min-w-0">
            <p className="text-xs text-ink-500 truncate">{attempt.title}</p>
            <p className="text-sm font-semibold text-ink-900">
              Question {index + 1} of {attempt.questions.length} · {answeredCount} answered
            </p>
          </div>
          <div className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${low ? 'bg-red-100 text-red-700' : 'bg-white text-ink-900 border border-ink-200'}`}>
            <Clock className="h-4 w-4" />
            {formatClock(secondsLeft)}
          </div>
        </div>

        {error && <Alert tone="error">{error}</Alert>}
        {saveWarning && <Alert tone="warning">{saveWarning}</Alert>}

        {question && (
          <Card className="p-5 sm:p-6">
            <p className="text-base sm:text-lg font-semibold text-ink-950 whitespace-pre-wrap">{question.text}</p>
            <div className="mt-5 space-y-2.5">
              {question.options.map((option, position) => {
                const selected = answers[String(question.id)] === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => void choose(question.id, option.key)}
                    className={`w-full text-left rounded-xl border px-4 py-3 text-sm transition ${
                      selected ? 'border-teal-500 bg-teal-50 text-teal-950' : 'border-ink-200 bg-white hover:border-ink-300 text-ink-800'
                    }`}
                  >
                    <span className="font-bold mr-2">{LETTERS[position]}.</span>
                    {option.text}
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} leftIcon={<ChevronLeft className="h-4 w-4" />}>
            Previous
          </Button>
          {index < attempt.questions.length - 1 ? (
            <Button onClick={() => setIndex((i) => i + 1)} rightIcon={<ChevronRight className="h-4 w-4" />}>
              Next
            </Button>
          ) : (
            <Button onClick={() => setConfirmOpen(true)}>Finish test</Button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {attempt.questions.map((item, position) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Go to question ${position + 1}`}
              onClick={() => setIndex(position)}
              className={`h-8 w-8 rounded-md text-xs font-semibold border ${
                position === index
                  ? 'bg-ink-900 text-white border-ink-900'
                  : answers[String(item.id)]
                    ? 'bg-teal-50 border-teal-300 text-teal-900'
                    : 'bg-white border-ink-200 text-ink-600'
              }`}
            >
              {position + 1}
            </button>
          ))}
        </div>
        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
            Submit now
          </Button>
        </div>

        <Dialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Submit your test?"
          description={
            answeredCount < attempt.questions.length
              ? `You have answered ${answeredCount} of ${attempt.questions.length} questions. Unanswered questions score zero.`
              : 'You have answered every question.'
          }
          footer={
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>Keep working</Button>
              <Button loading={busy} onClick={() => void finish(attempt.id)}>Submit</Button>
            </div>
          }
        >
          <p className="text-sm text-ink-600">You cannot change your answers after submitting.</p>
        </Dialog>
      </div>
    );
  }

  // ------------------------------------------------------------- intro
  return (
    <div className="container-page py-10 max-w-xl">
      <Link to="/practice" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-teal-700">
        <ArrowLeft className="h-3.5 w-3.5" /> All practice tests
      </Link>
      {error && !config ? (
        <Alert tone="error" className="mt-4">{error}</Alert>
      ) : config ? (
        <Card className="mt-4 p-6 sm:p-8">
          <Badge tone="teal">{config.course.code}</Badge>
          <h1 className="mt-3 font-display text-2xl font-bold text-ink-950">{config.title}</h1>
          <p className="text-sm text-ink-500">{config.course.title}</p>
          {config.description && <p className="mt-3 text-sm text-ink-700">{config.description}</p>}
          <ul className="mt-5 text-sm text-ink-700 space-y-1.5 list-disc pl-5">
            <li>{config.question_count} multiple-choice questions</li>
            <li>{config.duration_minutes} minutes. The timer keeps running if you leave, and your answers are saved as you go.</li>
            <li>Pass mark {config.pass_mark_percent}%{config.max_attempts ? ` · ${config.max_attempts} attempt(s) allowed` : ''}</li>
          </ul>
          {error && <Alert tone="error" className="mt-4">{error}</Alert>}
          <div className="mt-6">
            {config.locked ? (
              <div className="space-y-3">
                <Alert tone="warning">
                  <span className="inline-flex items-center gap-1.5"><Lock className="h-4 w-4" />{lockMessage(config.lock_reason)}</span>
                </Alert>
                {config.lock_reason === 'sign_in_required' ? (
                  <Link to={`/login?redirect=${encodeURIComponent(`/practice/${config.id}`)}`}><Button>Sign in</Button></Link>
                ) : config.lock_reason === 'verification_required' ? (
                  <Link to="/onboarding"><Button>Complete verification</Button></Link>
                ) : (
                  <Link to="/pricing"><Button>View subscription options</Button></Link>
                )}
              </div>
            ) : (
              <Button loading={busy} onClick={() => void begin()} leftIcon={<Play className="h-4 w-4" />}>
                {config.in_progress_attempt_id ? 'Resume test' : 'Start test'}
              </Button>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
