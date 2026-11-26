import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  GraduationCap,
  Sparkles,
  BookOpen,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Award,
  Layers,
  HeartPulse,
  Binary,
  Atom,
  FlaskConical,
} from 'lucide-react';

interface GatewayCourse {
  code: string;
  title: string;
  level: string;
  department: string;
  faculty: string;
  passRateMetric: string;
  pedagogicalRationale: string;
  recommendedMaterialTitle: string;
  searchQuery: string;
  tag: string;
}

const GATEWAY_COURSES: GatewayCourse[] = [
  {
    code: 'MTH 201',
    title: 'Mathematical Methods I (Calculus & Linear Differential Systems)',
    level: '200 Level',
    department: 'Mathematical Sciences & Computing',
    faculty: 'Faculty of Science & Computing',
    passRateMetric: 'High-Failure Barrier (Historical Pass Rate ~46%)',
    pedagogicalRationale:
      'MTH 201 is universally recognized as the most pivotal quantitative barrier in the undergraduate syllabus. Low pass rates stem from multidimensional integration and matrix diagonalization. Studying verified continuous assessment solutions and marking criteria significantly stabilizes comprehension and exam pass rates.',
    recommendedMaterialTitle: 'Certified MTH 201 Section A & B Past Exams + Worked Solutions',
    searchQuery: 'MTH 201',
    tag: 'Critical Prerequisite',
  },
  {
    code: 'BIO 101',
    title: 'General Biology: Cell Biology, Genetics & Human Parasitology',
    level: '100 Level',
    department: 'Nursing & Allied Medical Sciences',
    faculty: 'Faculty of Health Sciences',
    passRateMetric: 'Foundational GPA Gatekeeper (~92% Correlation to Degree Classification)',
    pedagogicalRationale:
      'For Nursing, Medical, and Life Science scholars, introductory biology and human parasitology establish clinical diagnostic intuition. Mastery of parasite life-cycles, protozoan vectors, and cellular genetics protects your first-year CGPA benchmark for clinical qualification.',
    recommendedMaterialTitle: 'Human Parasitology Handouts & 100L Past Exam Collections',
    searchQuery: 'BIO 101',
    tag: 'Clinical Gateway',
  },
  {
    code: 'CSC 3301',
    title: 'Operating Systems Principles & Computer Architecture',
    level: '300 Level',
    department: 'Computer Science & Software Engineering',
    faculty: 'Faculty of Science & Computing',
    passRateMetric: 'Core Systems Competency Gateway',
    pedagogicalRationale:
      'Connects low-level digital logic to high-level system software. Concurrency, thread synchronisation, deadlock avoidance, and memory paging questions require deep problem-solving. Reviewing past examination marking guides ensures complete mastery of operating system theory.',
    recommendedMaterialTitle: 'CSC 3301 Digital Exam Papers (Paper A & B) with Full Solutions',
    searchQuery: 'CSC 3301',
    tag: 'Core Systems',
  },
  {
    code: 'CHM 102',
    title: 'General Chemistry II (Physical, Analytical & Organic Foundations)',
    level: '100 Level',
    department: 'Chemical & Pure Sciences',
    faculty: 'Faculty of Science',
    passRateMetric: 'First-Year Distinction Accelerator',
    pedagogicalRationale:
      '100-level Chemistry tests calculation precision in thermodynamic kinetics and reaction mechanisms. Practicing with verified past papers and step-by-step mathematical solutions gives first-year students the exam confidence needed for an honors GPA trajectory.',
    recommendedMaterialTitle: 'CHM 102 Questions with Complete Worked Solutions & Handouts',
    searchQuery: 'CHM 102',
    tag: '100L Benchmark',
  },
  {
    code: 'BCH 202',
    title: 'Medical Biochemistry & Metabolism Bioenergetics',
    level: '200 Level',
    department: 'Biochemistry & Medical Laboratory Sciences',
    faculty: 'Faculty of Basic Medical Sciences',
    passRateMetric: 'Pre-Clinical Gateway Course',
    pedagogicalRationale:
      'Metabolic cycle regulation (glycolysis, Krebs cycle, electron transport) demands rigorous diagrammatic recall and biochemical enzyme mastery. Comprehensive revision of Section B essay past examinations directly prevents pre-clinical carryovers.',
    recommendedMaterialTitle: 'BCH 202 Section B Metabolism Exam Questions & Review Pack',
    searchQuery: 'BCH 202',
    tag: 'Biomedical Barrier',
  },
  {
    code: 'CSC 3313',
    title: 'Advanced Data Structures & Algorithmic Complexity',
    level: '300 Level',
    department: 'Software Engineering & IT',
    faculty: 'Faculty of Computing',
    passRateMetric: 'Technical Interview & Academic Prerequisite',
    pedagogicalRationale:
      'Tree traversal, asymptotic time bounds (Big-O), and graph algorithms are essential for third-year honors standing. Having certified previous semester examination tests trains students in recursive trace analysis.',
    recommendedMaterialTitle: 'CSC 3313 Examination Papers & Comprehensive Lecture Handout',
    searchQuery: 'CSC 3313',
    tag: 'Core Algorithmic',
  },
];

export function AcademicGatewayMatrix() {
  const [selectedFaculty, setSelectedFaculty] = useState<string>('all');

  const faculties = [
    { id: 'all', label: 'All Priority Disciplines', icon: Award },
    { id: 'computing', label: 'Computing & Mathematics', icon: Binary },
    { id: 'health', label: 'Health & Nursing Sciences', icon: HeartPulse },
    { id: 'science', label: 'Physical & Chemical Sciences', icon: Atom },
  ];

  const filtered = GATEWAY_COURSES.filter((c) => {
    if (selectedFaculty === 'computing') return c.faculty.includes('Computing') || c.code.includes('MTH') || c.code.includes('CSC');
    if (selectedFaculty === 'health') return c.faculty.includes('Health') || c.code.includes('BIO') || c.code.includes('BCH');
    if (selectedFaculty === 'science') return c.faculty.includes('Science') || c.code.includes('CHM') || c.code.includes('PHY');
    return true;
  });

  return (
    <section className="container-page pb-14 sm:pb-18 animate-fade-in">
      <div className="rounded-3xl bg-ink-950 bg-gradient-to-br from-ink-950 via-teal-950 to-slate-900 text-white p-6 sm:p-10 lg:p-12 shadow-2xl border border-teal-500/40 relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-96 h-96 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-500/25 text-teal-300 text-xs font-bold mb-3.5 border border-teal-400/40 shadow-xs">
            <GraduationCap className="h-4 w-4 text-teal-300" />
            <span className="tracking-wide uppercase text-[11px]">Faculty Academic Advisory &bull; High-Yield Gateways</span>
          </div>

          <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Curated Academic Gateways: <span className="text-teal-300 underline decoration-teal-500/50 decoration-wavy decoration-1">Strategic Prerequisite Hub</span>
          </h2>

          <p className="mt-3.5 text-sm sm:text-base text-slate-200 leading-relaxed max-w-3xl font-medium">
            In university degree programs, specific introductory and mid-level courses exert a disproportional influence on student CGPA trajectory and honor classifications. The Departmental Advisory below highlights proven prerequisite gateways with historical bottleneck analysis and verified past solutions.
          </p>

          {/* Discipline Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2 mt-6">
            {faculties.map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  onClick={() => setSelectedFaculty(f.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    selectedFaculty === f.id
                      ? 'bg-teal-500 text-ink-950 shadow-md font-extrabold'
                      : 'bg-white/10 text-teal-200 hover:bg-white/15 border border-white/10'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Matrix Grid */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 relative z-10">
          {filtered.map((item) => (
            <div
              key={item.code}
              className="rounded-2xl p-5 bg-ink-900/85 border border-teal-700/40 hover:border-teal-400/80 hover:bg-ink-900 transition-all duration-300 backdrop-blur-md flex flex-col justify-between group shadow-md hover:shadow-xl hover:-translate-y-1"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-mono text-xs font-black text-teal-300 bg-teal-950/90 px-2.5 py-1 rounded-lg border border-teal-400/50">
                    {item.code}
                  </span>
                  <span className="text-[11px] font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-400/30">
                    {item.tag}
                  </span>
                </div>

                <h3 className="font-display text-base font-bold text-white group-hover:text-teal-200 transition-colors">
                  {item.title}
                </h3>

                <p className="text-xs text-teal-300 font-semibold mt-1">
                  {item.department} &bull; {item.level}
                </p>

                <div className="my-3 p-2.5 rounded-xl bg-ink-950/90 border border-teal-800/40 text-[11px]">
                  <p className="font-bold text-amber-300 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-amber-400" /> {item.passRateMetric}
                  </p>
                </div>

                <p className="text-xs text-slate-200 leading-relaxed line-clamp-4 font-normal">
                  {item.pedagogicalRationale}
                </p>
              </div>

              <div className="mt-5 pt-3.5 border-t border-teal-800/40 flex items-center justify-between text-xs">
                <span className="text-teal-300 font-bold truncate max-w-[170px]" title={item.recommendedMaterialTitle}>
                  {item.recommendedMaterialTitle}
                </span>

                <Link
                  to={`/materials?q=${encodeURIComponent(item.searchQuery)}`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-teal-300 hover:text-white transition group-hover:translate-x-1"
                >
                  Solutions <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Guarantee */}
        <div className="mt-8 pt-6 border-t border-teal-800/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-teal-200/90 relative z-10">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>All gateway exam solutions are cross-verified against official departmental marking rubrics.</span>
          </div>

          <Link
            to="/materials"
            className="inline-flex items-center gap-1.5 font-bold text-teal-300 hover:text-white"
          >
            Explore Complete Course Catalogue <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
