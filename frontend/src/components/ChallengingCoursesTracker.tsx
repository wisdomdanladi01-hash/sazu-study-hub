import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  Target,
  Sparkles,
  BookOpen,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  BrainCircuit,
  FileText,
} from 'lucide-react';

export interface ChallengingCourse {
  id: string;
  code: string;
  title: string;
  department: string;
  challengeArea: string;
  targetGoal: string;
  status: 'active' | 'improving' | 'mastered';
}

const DEFAULT_COURSES: ChallengingCourse[] = [
  {
    id: '1',
    code: 'MTH 201',
    title: 'Mathematical Methods I',
    department: 'Mathematical & Computing Sciences',
    challengeArea: 'Differential equations & matrix proofs',
    targetGoal: 'Grade A / Clear Carryover',
    status: 'active',
  },
  {
    id: '2',
    code: 'CSC 3301',
    title: 'Operating Systems & System Programming',
    department: 'Computer Science',
    challengeArea: 'Process scheduling & memory concurrency algorithms',
    targetGoal: 'Pass with Distinction',
    status: 'improving',
  },
];

const POPULAR_CHALLENGING_COURSES = [
  { code: 'MTH 201', title: 'Mathematical Methods I', department: 'Faculty of Science' },
  { code: 'CSC 3301', title: 'Operating Systems & System Programming', department: 'Computer Science' },
  { code: 'CSC 3313', title: 'Data Structures & Algorithms', department: 'Computer Science' },
  { code: 'CHM 102', title: 'General Chemistry II (Physical & Organic)', department: 'Pure & Applied Sciences' },
  { code: 'BCH 202', title: 'Medical Biochemistry & Metabolism', department: 'Health Sciences' },
  { code: 'PHY 206', title: 'Modern Physics & Wave Phenomena', department: 'Physical Sciences' },
  { code: 'STA 3307', title: 'Statistical Inference & Probability', department: 'Mathematical Sciences' },
  { code: 'BIO 101', title: 'General Biology & Human Parasitology', department: 'Biological & Nursing Sciences' },
];

const STORAGE_KEY = 'sazu_student_challenging_courses_v1';

export function ChallengingCoursesTracker() {
  const [courses, setCourses] = useState<ChallengingCourse[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_COURSES;
    } catch {
      return DEFAULT_COURSES;
    }
  });

  const [showAdd, setShowAdd] = useState(false);
  const [selectedCode, setSelectedCode] = useState('MTH 201');
  const [customCode, setCustomCode] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [challengeArea, setChallengeArea] = useState('Mid-semester test formulas & calculations');
  const [targetGoal, setTargetGoal] = useState('Target: Grade A / Honours');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
    } catch {
      // storage error ignored
    }
  }, [courses]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    let code = selectedCode;
    let title = '';
    let dept = 'Academic Department';

    if (selectedCode === 'CUSTOM') {
      if (!customCode.trim()) return;
      code = customCode.trim().toUpperCase();
      title = customTitle.trim() || 'Core Academic Course';
    } else {
      const match = POPULAR_CHALLENGING_COURSES.find((c) => c.code === selectedCode);
      if (match) {
        title = match.title;
        dept = match.department;
      }
    }

    const newCourse: ChallengingCourse = {
      id: Date.now().toString(),
      code,
      title,
      department: dept,
      challengeArea: challengeArea.trim() || 'Exam question solutions & lecture notes',
      targetGoal: targetGoal.trim() || 'High Academic Pass',
      status: 'active',
    };

    setCourses((prev) => [newCourse, ...prev]);
    setShowAdd(false);
    setCustomCode('');
    setCustomTitle('');
  };

  const handleRemove = (id: string) => {
    setCourses((prev) => prev.filter((c) => c.id !== id));
  };

  const handleToggleStatus = (id: string) => {
    setCourses((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const nextStatus: ChallengingCourse['status'] =
          c.status === 'active' ? 'improving' : c.status === 'improving' ? 'mastered' : 'active';
        return { ...c, status: nextStatus };
      })
    );
  };

  return (
    <Card className="p-5 sm:p-7 border-teal-200/80 bg-gradient-to-br from-teal-50/50 via-white to-white shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-ink-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-teal-100 text-teal-800">
              <Target className="h-5 w-5 text-teal-700" />
            </span>
            <div>
              <h3 className="font-display text-lg font-bold text-ink-950 flex items-center gap-2">
                <span>Challenging Courses &amp; GPA Focus Tracker</span>
                <span className="text-[11px] font-bold text-teal-800 bg-teal-100/70 px-2 py-0.5 rounded-full border border-teal-300/40">
                  Adaptive Recommendations
                </span>
              </h3>
              <p className="text-xs text-ink-600 mt-0.5">
                Register courses you find difficult or carryover prerequisites to receive tailored past questions and study material alerts.
              </p>
            </div>
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => setShowAdd(!showAdd)}
          leftIcon={showAdd ? undefined : <Plus className="h-4 w-4" />}
          className="self-start sm:self-auto"
        >
          {showAdd ? 'Cancel' : 'Track Course'}
        </Button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6 p-4 rounded-2xl bg-teal-50/70 border border-teal-200 animate-fade-in">
          <p className="text-xs font-bold text-teal-950 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <BrainCircuit className="h-4 w-4 text-teal-700" /> Add Academic Challenge Target
          </p>

          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-ink-800 mb-1">Select Course</label>
              <Select
                value={selectedCode}
                onChange={(e) => setSelectedCode(e.target.value)}
                className="text-xs"
              >
                {POPULAR_CHALLENGING_COURSES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} &bull; {c.title}
                  </option>
                ))}
                <option value="CUSTOM">+ Other / Custom Course Code</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-800 mb-1">Target Academic Goal</label>
              <Select
                value={targetGoal}
                onChange={(e) => setTargetGoal(e.target.value)}
                className="text-xs"
              >
                <option value="Target: Grade A / Honours">Grade A / Distinction Target</option>
                <option value="Target: Clear Carryover">Clear Carryover / High Pass</option>
                <option value="Target: Grade B (Solid Foundation)">Grade B (Solid Foundation)</option>
                <option value="Target: Pass Continuous Assessment">Ace Continuous Assessment Tests</option>
              </Select>
            </div>
          </div>

          {selectedCode === 'CUSTOM' && (
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">Course Code</label>
                <Input
                  placeholder="e.g. NUR 101 or CHM 201"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">Course Title</label>
                <Input
                  placeholder="e.g. Foundations of Clinical Nursing"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-xs font-semibold text-ink-800 mb-1">Specific Challenge Area</label>
            <Input
              placeholder="e.g. Proofs and differential step-by-step methods, or past examination MCQ speed"
              value={challengeArea}
              onChange={(e) => setChallengeArea(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="bg-teal-600 hover:bg-teal-500 font-bold">
              Save Course Focus
            </Button>
          </div>
        </form>
      )}

      {/* Tracked Courses List */}
      {courses.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border border-dashed border-ink-200">
          <BookOpen className="h-8 w-8 text-ink-300 mx-auto mb-2" />
          <p className="text-sm font-bold text-ink-900">No challenging courses tracked yet</p>
          <p className="text-xs text-ink-500 mt-1 max-w-md mx-auto">
            Click "+ Track Course" to add courses like MTH 201 or carryover subjects to get verified recommendations.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {courses.map((course) => {
            const isMth201 = course.code.replace(/\s+/g, '') === 'MTH201';

            return (
              <div
                key={course.id}
                className="p-4 sm:p-5 rounded-2xl bg-white border border-ink-150 hover:border-teal-300 transition-all shadow-2xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-sm font-black text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200">
                      {course.code}
                    </span>
                    <div>
                      <h4 className="font-bold text-sm text-ink-950 leading-snug">{course.title}</h4>
                      <p className="text-[11px] text-ink-500">{course.department}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(course.id)}
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border transition cursor-pointer ${
                        course.status === 'mastered'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : course.status === 'improving'
                            ? 'bg-sky-50 text-sky-800 border-sky-300'
                            : 'bg-amber-50 text-amber-800 border-amber-300'
                      }`}
                    >
                      {course.status === 'mastered'
                        ? '✓ Mastered'
                        : course.status === 'improving'
                          ? '↗ Improving'
                          : '⚡ Active Focus'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemove(course.id)}
                      className="p-1 rounded text-ink-400 hover:text-red-600 transition cursor-pointer"
                      title="Remove course tracker"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-2 text-xs pt-1">
                  <div className="text-ink-600">
                    <span className="font-semibold text-ink-800">Target:</span> {course.targetGoal}
                  </div>
                  <div className="text-ink-600">
                    <span className="font-semibold text-ink-800">Challenge:</span> {course.challengeArea}
                  </div>
                </div>

                {/* Smart Recommendation Banner */}
                <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-teal-900">
                    <Sparkles className="h-4 w-4 text-teal-700 shrink-0" />
                    <span>
                      {isMth201 ? (
                        <>
                          <strong>Recommended Pass-Booster:</strong> Verified MTH 201 Section A &amp; B Past Exams + Marking Guides
                        </>
                      ) : (
                        <>
                          <strong>Recommended Materials:</strong> Certified continuous assessment test solutions and lecture slides
                        </>
                      )}
                    </span>
                  </div>

                  <Link
                    to={`/materials?q=${encodeURIComponent(course.code)}`}
                    className="inline-flex items-center gap-1 font-bold text-teal-800 hover:text-teal-950 shrink-0"
                  >
                    Open Solutions &amp; Handouts <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
