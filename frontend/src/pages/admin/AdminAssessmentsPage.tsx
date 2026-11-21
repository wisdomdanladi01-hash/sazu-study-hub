import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Eye, EyeOff, Plus, Trash2, Upload } from 'lucide-react';
import { adminService, type AdminCourse, type AdminResourceItem } from '@/services/admin';
import {
  adminAssessmentService,
  CSV_TEMPLATE,
  type AdminConfig,
  type AdminQuestion,
} from '@/services/adminAssessments';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

type Tab = 'tests' | 'questions';

const emptyQuestion = { text: '', options: ['', '', '', ''], correct: 'A', topic: '', source: '', explanation: '', difficulty: 'medium' as const };

export function AdminAssessmentsPage() {
  const [tab, setTab] = useState<Tab>('tests');
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [resources, setResources] = useState<AdminResourceItem[]>([]);
  const [configs, setConfigs] = useState<AdminConfig[]>([]);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [courseFilter, setCourseFilter] = useState<number | ''>('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // test form
  const [form, setForm] = useState({
    title: '', courseId: '' as number | '', description: '', count: 20, minutes: 30, passMark: 50,
    shuffleQ: true, shuffleO: false, reveal: true, requiresSub: true, maxAttempts: '' as number | '', topics: '', resourceIds: [] as number[], publish: false,
  });
  // question form
  const [q, setQ] = useState({ ...emptyQuestion });
  const [qCourse, setQCourse] = useState<number | ''>('');
  const [qResource, setQResource] = useState<number | ''>('');

  const flash = (tone: 'success' | 'error' | 'warning', text: string) => setMessage({ tone, text });
  const fail = (cause: unknown) => flash('error', cause instanceof Error ? cause.message : 'Something went wrong.');

  const loadConfigs = useCallback(() => adminAssessmentService.listConfigs().then(setConfigs).catch(fail), []);
  const loadQuestions = useCallback(
    () => adminAssessmentService.listQuestions(courseFilter === '' ? undefined : courseFilter).then(setQuestions).catch(fail),
    [courseFilter],
  );

  useEffect(() => {
    void Promise.all([adminService.listCourses().then(setCourses), adminService.listResources().then(setResources)]).catch(fail);
    void loadConfigs();
  }, [loadConfigs]);
  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const courseResources = useMemo(
    () => resources.filter((item) => form.courseId !== '' && item.course_id === form.courseId),
    [resources, form.courseId],
  );
  const qCourseResources = useMemo(
    () => resources.filter((item) => qCourse !== '' && item.course_id === qCourse),
    [resources, qCourse],
  );

  const createTest = async () => {
    if (form.courseId === '' || form.title.trim().length < 3) return flash('error', 'Choose a course and give the test a title.');
    setBusy(true);
    try {
      const created = await adminAssessmentService.createConfig({
        title: form.title.trim(),
        course_id: form.courseId,
        description: form.description.trim() || null,
        question_count: form.count,
        duration_minutes: form.minutes,
        pass_mark_percent: form.passMark,
        shuffle_questions: form.shuffleQ,
        shuffle_options: form.shuffleO,
        reveal_answers: form.reveal,
        max_attempts: form.maxAttempts === '' ? null : form.maxAttempts,
        requires_subscription: form.requiresSub,
        topics: form.topics.split(',').map((item) => item.trim()).filter(Boolean),
        resource_ids: form.resourceIds,
        is_published: form.publish,
      });
      flash(
        created.pool_size === 0 ? 'warning' : 'success',
        created.pool_size === 0
          ? 'Test saved, but no questions match yet, so students will not see it. Add questions in the Question bank.'
          : `Test saved. ${created.pool_size} questions are available to draw from.`,
      );
      setForm({ ...form, title: '', description: '', resourceIds: [], topics: '' });
      await loadConfigs();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const addQuestion = async () => {
    const options = q.options.map((item) => item.trim()).filter(Boolean);
    if (qCourse === '' || !q.text.trim() || options.length < 2) return flash('error', 'Choose a course, enter the question and at least two options.');
    setBusy(true);
    try {
      await adminAssessmentService.createQuestion({
        course_id: qCourse,
        resource_id: qResource === '' ? null : qResource,
        topic: q.topic.trim() || null,
        source_label: q.source.trim() || null,
        difficulty: q.difficulty,
        text: q.text.trim(),
        options,
        correct_answer: q.correct,
        explanation: q.explanation.trim() || null,
      });
      flash('success', 'Question added.');
      setQ({ ...emptyQuestion, topic: q.topic, source: q.source });
      await Promise.all([loadQuestions(), loadConfigs()]);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await adminAssessmentService.importQuestions(file);
      if (result.errors.length) flash('error', `Nothing was imported. ${result.errors.slice(0, 5).join(' ')}`);
      else flash('success', `Imported ${result.created} questions.`);
      await Promise.all([loadQuestions(), loadConfigs()]);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'question-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const courseLabel = (id: number) => courses.find((course) => course.id === id)?.code ?? `#${id}`;
  const num = (value: string): number | '' => (value === '' ? '' : Number(value));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-950">Practice tests</h1>
        <p className="text-sm text-ink-600 mt-1">
          Build a question bank from your past questions, then configure tests that draw from selected materials.
        </p>
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="flex gap-2">
        {(['tests', 'questions'] as Tab[]).map((value) => (
          <Button key={value} size="sm" variant={tab === value ? 'primary' : 'outline'} onClick={() => setTab(value)}>
            {value === 'tests' ? 'Test configurations' : 'Question bank'}
          </Button>
        ))}
      </div>

      {tab === 'tests' && (
        <>
          <Card className="p-5 space-y-4">
            <h2 className="font-semibold text-ink-900">New test</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="COS 102 mock exam" />
              <Select label="Course" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: num(e.target.value), resourceIds: [] })}>
                <option value="">Select a course…</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}
              </Select>
              <Input label="Questions per sitting" type="number" min={1} max={200} value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} />
              <Input label="Time limit (minutes)" type="number" min={1} max={360} value={form.minutes} onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })} />
              <Input label="Pass mark (%)" type="number" min={0} max={100} value={form.passMark} onChange={(e) => setForm({ ...form, passMark: Number(e.target.value) })} />
              <Input label="Max attempts" hint="Leave empty for unlimited" type="number" min={1} value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: num(e.target.value) })} />
            </div>
            <Input label="Topics (optional)" hint="Comma separated. Only questions with these topics are used." value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} />
            <div>
              <p className="text-sm font-semibold text-ink-800 mb-1.5">Draw questions from these materials</p>
              {form.courseId === '' ? (
                <p className="text-xs text-ink-500">Choose a course first.</p>
              ) : courseResources.length === 0 ? (
                <p className="text-xs text-ink-500">No materials are attached to this course, so questions from any source will be used.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {courseResources.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        checked={form.resourceIds.includes(item.id)}
                        onChange={(e) =>
                          setForm({ ...form, resourceIds: e.target.checked ? [...form.resourceIds, item.id] : form.resourceIds.filter((rid) => rid !== item.id) })
                        }
                      />
                      <span className="truncate">{item.title}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-ink-500 mt-1">Leave all unticked to use every question for the course.</p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-800">
              {([
                ['shuffleQ', 'Shuffle questions'],
                ['shuffleO', 'Shuffle options'],
                ['reveal', 'Show correct answers after submitting'],
                ['requiresSub', 'Requires a subscription'],
                ['publish', 'Publish now'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
            <Button loading={busy} onClick={() => void createTest()} leftIcon={<Plus className="h-4 w-4" />}>Save test</Button>
          </Card>

          <div className="space-y-3">
            {configs.length === 0 && <p className="text-sm text-ink-500">No tests yet.</p>}
            {configs.map((config) => (
              <Card key={config.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">{config.title}</p>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {config.course.code} · {config.question_count} questions · {config.duration_minutes} min · pass {config.pass_mark_percent}% ·{' '}
                    {config.pool_size} in pool · {config.attempt_count} attempts
                  </p>
                  {config.pool_size < config.question_count && (
                    <p className="text-xs text-amber-700 mt-0.5">
                      {config.pool_size === 0 ? 'No matching questions: hidden from students.' : `Only ${config.pool_size} questions available, so sittings will be shorter.`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={config.is_published ? 'teal' : 'neutral'}>{config.is_published ? 'Published' : 'Draft'}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={config.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    onClick={() => void adminAssessmentService.updateConfig(config.id, { is_published: !config.is_published }).then(loadConfigs).catch(fail)}
                  >
                    {config.is_published ? 'Unpublish' : 'Publish'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${config.title}`}
                    onClick={() => {
                      if (window.confirm('Delete this test?')) void adminAssessmentService.deleteConfig(config.id).then(loadConfigs).catch(fail);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === 'questions' && (
        <>
          <Card className="p-5 space-y-3">
            <h2 className="font-semibold text-ink-900">Import from CSV</h2>
            <p className="text-sm text-ink-600">
              Upload many questions at once. If any row has a problem, nothing is imported and you get the row numbers to fix.
            </p>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex">
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { void importCsv(e.target.files?.[0]); e.target.value = ''; }} />
                <span className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-teal-600 text-white text-sm font-semibold cursor-pointer hover:bg-teal-700">
                  <Upload className="h-4 w-4" /> Upload CSV
                </span>
              </label>
              <Button size="sm" variant="outline" onClick={downloadTemplate} leftIcon={<Download className="h-4 w-4" />}>Template</Button>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h2 className="font-semibold text-ink-900">Add a question</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Select label="Course" value={qCourse} onChange={(e) => { setQCourse(num(e.target.value)); setQResource(''); }}>
                <option value="">Select a course…</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}
              </Select>
              <Select label="Source material (optional)" value={qResource} onChange={(e) => setQResource(num(e.target.value))}>
                <option value="">None</option>
                {qCourseResources.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </Select>
              <Input label="Topic" value={q.topic} onChange={(e) => setQ({ ...q, topic: e.target.value })} />
              <Input label="Source label" placeholder="2023/2024 Exam" value={q.source} onChange={(e) => setQ({ ...q, source: e.target.value })} />
            </div>
            <div>
              <label className="block mb-1.5 text-sm font-semibold text-ink-800" htmlFor="q-text">Question</label>
              <textarea id="q-text" rows={3} className="w-full rounded-xl border border-ink-200 p-3 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 focus:outline-none" value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {q.options.map((option, position) => (
                <div key={position} className="flex items-end gap-2">
                  <label className="flex items-center pb-3 gap-1.5 text-sm font-semibold text-ink-800">
                    <input type="radio" name="correct" checked={q.correct === 'ABCDE'[position]} onChange={() => setQ({ ...q, correct: 'ABCDE'[position] })} aria-label={`Option ${'ABCDE'[position]} is correct`} />
                    {'ABCDE'[position]}
                  </label>
                  <Input value={option} placeholder={`Option ${'ABCDE'[position]}`} onChange={(e) => setQ({ ...q, options: q.options.map((item, i) => (i === position ? e.target.value : item)) })} />
                </div>
              ))}
            </div>
            <p className="text-xs text-ink-500">Select the radio button beside the correct option. Leave unused options empty.</p>
            <Input label="Explanation (shown after submitting)" value={q.explanation} onChange={(e) => setQ({ ...q, explanation: e.target.value })} />
            <Button loading={busy} onClick={() => void addQuestion()} leftIcon={<Plus className="h-4 w-4" />}>Add question</Button>
          </Card>

          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-ink-900">Questions</h2>
            <div className="w-60">
              <Select aria-label="Filter by course" value={courseFilter} onChange={(e) => setCourseFilter(num(e.target.value))}>
                <option value="">All courses</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.code}</option>)}
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            {questions.length === 0 && <p className="text-sm text-ink-500">No questions yet.</p>}
            {questions.map((item) => (
              <Card key={item.id} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900 whitespace-pre-wrap">{item.text}</p>
                  <p className="text-xs text-ink-500 mt-1">
                    {courseLabel(item.course_id)}{item.topic ? ` · ${item.topic}` : ''}{item.source_label ? ` · ${item.source_label}` : ''} · answer {item.correct_key}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Remove question"
                  onClick={() => void adminAssessmentService.removeQuestion(item.id).then(() => Promise.all([loadQuestions(), loadConfigs()])).catch(fail)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
