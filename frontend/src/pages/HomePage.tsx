import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ResourceCard } from '@/components/ResourceCard';
import { catalogService } from '@/services/catalog';
import type { AcademicCatalogue } from '@/types';
import type { CatalogResource } from '@/services/catalog';
import { paymentService, type SubscriptionPackage } from '@/services/payments';
import { Search, ArrowRight, BookOpen, ListChecks, FileText, FileQuestion, GraduationCap, ClipboardList, ShieldCheck, CreditCard, Eye, ChevronRight, Sparkles, Star, CheckCircle2 } from 'lucide-react';
import { formatNaira } from '@/utils/format';

const howSteps = [
  { icon: Search, title: 'Find your course', text: 'Browse the academic catalogue and search published learning materials.' },
  { icon: BookOpen, title: 'Explore materials', text: 'Review resource descriptions and file details before requesting a download.' },
  { icon: ShieldCheck, title: 'Create an account', text: 'Register and submit your academic details when verification is required.' },
  { icon: CreditCard, title: 'View packages', text: 'Review available subscription packages and their prices before checkout.' },
  { icon: ListChecks, title: 'Study and practise', text: 'Download materials you are authorized to access. Practice tests will appear when published.' },
];

export function HomePage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [featured, setFeatured] = useState<CatalogResource[]>([]);
  const [catalogue, setCatalogue] = useState<AcademicCatalogue | null>(null);
  const [subscriptionPackage, setSubscriptionPackage] = useState<SubscriptionPackage | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      catalogService.featuredResources(6),
      catalogService.getAcademicCatalogue(),
      paymentService.listPackages(),
    ]).then(([resources, academic, packages]) => {
      if (!active) return;
      setFeatured(resources);
      setCatalogue(academic);
      setSubscriptionPackage(packages[0] ?? null);
    }).catch((error: unknown) => {
      if (active) setContentError(error instanceof Error ? error.message : 'Unable to load Study Hub content.');
    });
    return () => { active = false; };
  }, []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/materials${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white to-ink-50">
        <div className="absolute inset-0 -z-10 opacity-[0.4]" aria-hidden>
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-teal-100 blur-3xl" />
          <div className="absolute top-40 -left-24 h-72 w-72 rounded-full bg-ink-100 blur-3xl" />
        </div>
        <div className="container-page pt-10 pb-12 sm:pt-14 sm:pb-16">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-12 items-center">
            <div className="lg:col-span-7">
              <Badge tone="teal" className="mb-4">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-500" /> Built for SAZU students
              </Badge>
              <h1 className="font-display text-[2rem] leading-[1.1] sm:text-5xl font-extrabold text-ink-950 text-balance">
                Your Courses. Your Resources. <span className="text-teal-600">Your Next Exam.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base sm:text-lg text-ink-700 leading-relaxed">
                Discover learning materials organized around your academic journey at SAZU.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <Link to="/materials">
                  <Button size="lg" fullWidth={false} leftIcon={<BookOpen className="h-5 w-5" />} rightIcon={<ArrowRight className="h-4 w-4" />}>
                    Explore Learning Materials
                  </Button>
                </Link>
                <Link to="/courses">
                  <Button size="lg" variant="outline" leftIcon={<GraduationCap className="h-5 w-5" />}>
                    Browse Course Catalogue
                  </Button>
                </Link>
                <Link to="/practice">
                  <Button size="lg" variant="outline" leftIcon={<ListChecks className="h-5 w-5" />}>
                    Explore Practice Tests
                  </Button>
                </Link>
              </div>
              <p className="mt-4 text-sm text-ink-500">
                Browse public course and resource listings without signing in.
              </p>
            </div>

            {/* Visual: stack of resource preview cards */}
            <div className="lg:col-span-5">
              <HeroPreviewStack />
            </div>
          </div>

          {/* Search */}
          <form onSubmit={submitSearch} className="mt-10 sm:mt-12">
            <div className="relative max-w-2xl">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-400" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search course codes, subjects, or learning materials..."
                aria-label="Search learning materials"
                className="w-full h-14 pl-12 pr-32 rounded-2xl border border-ink-200 bg-white text-[0.95rem] shadow-soft focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 focus:outline-none"
              />
              <Button type="submit" size="md" className="absolute right-1.5 top-1.5 bottom-1.5 sm:right-2 sm:top-2 sm:bottom-2" leftIcon={<Search className="h-4 w-4" />}>
                Search
              </Button>
            </div>
          </form>
        </div>
      </section>

      {/* Browse by category */}
      <section className="container-page py-12 sm:py-14">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink-950">Browse by academic category</h2>
            <p className="mt-1 text-sm text-ink-600">Browse departments currently listed in the academic catalogue.</p>
          </div>
          <Link to="/materials" className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-800">
            All materials <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {(catalogue?.departments ?? []).slice(0, 6).map((department) => (
            <Link key={department.id} to={`/materials?department=${department.id}`}>
              <Card className="p-4 h-full hover:border-teal-200 hover:-translate-y-0.5 transition-all">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-teal-300 mb-3">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-ink-900 leading-snug">{department.name}</p>
                <p className="text-xs text-ink-500 mt-0.5">Department</p>
              </Card>
            </Link>
          ))}
          {catalogue?.departments.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-ink-200 p-5 text-sm text-ink-600">
              Academic departments will appear here when added to the catalogue.
            </p>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {(catalogue?.resource_types ?? []).slice(0, 5).map((type, index) => {
            const icons = [FileText, BookOpen, FileQuestion, GraduationCap, ClipboardList];
            const TypeIcon = icons[index % icons.length];
            return <Link key={type.id} to={`/materials?type=${encodeURIComponent(type.name)}`}>
              <Card className="p-3 flex items-center gap-3 hover:border-teal-200 transition-all">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700 shrink-0">
                  <TypeIcon className="h-4.5 w-4.5" />
                </div>
                <p className="text-sm font-semibold text-ink-800">{type.name}</p>
              </Card>
            </Link>
          })}
        </div>
      </section>

      {/* Featured materials */}
      <section className="container-page pb-12 sm:pb-14">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink-950">Featured learning materials</h2>
            <p className="mt-1 text-sm text-ink-600">Recently published resources from the Study Hub catalogue.</p>
          </div>
          <Link to="/materials" className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-800">
            View all <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((r) => (
            <ResourceCard key={r.id} resource={r} course={r.course} />
          ))}
          {featured.length === 0 && (
            <p className="sm:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-ink-200 p-6 text-sm text-ink-600">
              {contentError ?? 'Learning materials will appear here when they are published.'}
            </p>
          )}
        </div>
      </section>

      {/* 100-Level Foundation & MTH 201 Academic Hub */}
      <section className="container-page pb-12 sm:pb-16">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-950 via-teal-900 to-ink-950 text-white shadow-xl border border-teal-800/40">
          <div className="grid lg:grid-cols-12 gap-8 items-center p-6 sm:p-10 lg:p-12">
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-xs font-semibold">
                <Star className="h-3.5 w-3.5 text-amber-300" />
                <span>Academic Foundation Advisory</span>
              </div>
              <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-balance leading-tight">
                Build a Bulletproof Foundation: <span className="text-teal-300">100-Level &amp; MTH 201 Hub</span>
              </h2>
              <p className="text-ink-200 text-sm sm:text-base leading-relaxed max-w-xl">
                Excelling in your 100-level courses sets the GPA bedrock for your entire university career.
                For 200-level science and computing students, <strong>MTH 201 (Mathematical Methods)</strong> is notoriously challenging—thorough revision with certified past exam questions and step-by-step solutions dramatically increases your pass rate and academic distinction.
              </p>
              <div className="pt-2 flex flex-wrap gap-3">
                <Link to="/materials?level=100">
                  <Button size="md" className="bg-teal-500 hover:bg-teal-400 text-ink-950 font-bold border-none" rightIcon={<ArrowRight className="h-4 w-4" />}>
                    Explore 100L Study Pack
                  </Button>
                </Link>
                <Link to="/materials?q=MTH+201">
                  <Button size="md" variant="outline" className="border-teal-400/40 text-teal-100 hover:bg-teal-800/50">
                    Search MTH 201 Solutions
                  </Button>
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 border-t border-teal-800/60 text-xs text-teal-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Curated Syllabi</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Past Papers with Solutions</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Continuous Assessment Tests</span>
                </div>
              </div>
            </div>
            <div className="lg:col-span-5 relative">
              <div className="relative overflow-hidden rounded-2xl border border-teal-500/30 shadow-2xl group">
                <img
                  src="https://images.pexels.com/photos/3184328/pexels-photo-1438081.jpeg?auto=compress&cs=tinysrgb&w=800"
                  alt="Students studying university mathematics and sciences"
                  className="w-full h-64 sm:h-80 object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/30 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-teal-300">High-Yield Study Prep</p>
                  <p className="text-sm font-bold text-white mt-0.5">Faculty of Science &amp; Computing Exam Focus</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Practice section */}
      <section className="bg-ink-950 text-white">
        <div className="container-page py-12 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge tone="teal" className="mb-4 bg-teal-500/15 text-teal-300">Practice &amp; exam prep</Badge>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">Practice tests</h2>
              <p className="mt-3 text-ink-200 max-w-lg">
                Practice questions and scored assessments are not currently available. Published tests will appear here when the assessment service is ready.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link to="/practice">
                  <Button size="lg" leftIcon={<ListChecks className="h-5 w-5" />} rightIcon={<ArrowRight className="h-4 w-4" />}>
                    View Practice Tests
                  </Button>
                </Link>
                <Link to="/how-it-works">
                  <Button size="lg" variant="outline" className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:border-white/50">
                    How it works
                  </Button>
                </Link>
              </div>
            </div>
            <PracticePreview />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container-page py-12 sm:py-16">
        <div className="text-center max-w-2xl mx-auto">
          <Badge tone="teal" className="mb-3">How it works</Badge>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink-950">Your study journey in five steps</h2>
          <p className="mt-2 text-sm text-ink-600">From discovering materials to managing your account and access.</p>
        </div>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {howSteps.map((s, i) => (
            <li key={s.title}>
              <Card className="h-full p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white font-bold">
                    {i + 1}
                  </div>
                  <s.icon className="h-5 w-5 text-ink-400" />
                </div>
                <h3 className="font-display font-bold text-ink-950">{s.title}</h3>
                <p className="mt-1.5 text-sm text-ink-600">{s.text}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Subscription */}
      <section className="container-page pb-12 sm:pb-16">
        <Card className="overflow-hidden border-teal-100">
          <div className="grid lg:grid-cols-2">
            <div className="p-7 sm:p-10">
              <Badge tone="teal" className="mb-4">Semester subscription</Badge>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink-950">Access full materials for one semester</h2>
              <p className="mt-3 text-ink-700">
                Semester access packages and their prices are provided by the Study Hub service.
              </p>
              <ul className="mt-5 space-y-2">
                {['View available materials and their details', 'Download materials your account is authorized to access', 'Review the packages currently configured on the platform'].map((t) => (
                  <li key={t} className="flex items-start gap-2 text-sm text-ink-800">
                    <ShieldCheck className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" /> {t}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link to="/pricing">
                  <Button size="lg" leftIcon={<CreditCard className="h-5 w-5" />}>View pricing</Button>
                </Link>
                <Link to="/how-it-works">
                  <Button size="lg" variant="outline">Learn how it works</Button>
                </Link>
              </div>
            </div>
            <div className="bg-ink-950 p-7 sm:p-10 text-white flex flex-col justify-center">
              <p className="text-sm text-ink-300">Current semester package</p>
              <p className="mt-2 font-display text-4xl font-extrabold">
                {subscriptionPackage
                  ? <>{formatNaira(subscriptionPackage.price_minor / 100)} <span className="text-base font-semibold text-ink-300">· {subscriptionPackage.name}</span></>
                  : 'Packages not available'}
              </p>
              <p className="mt-3 text-sm text-ink-300">
                {subscriptionPackage?.description ?? 'Package details will be shown here when configured.'}
              </p>
              <div className="mt-5 rounded-xl bg-white/10 p-4">
                <p className="text-xs font-semibold text-teal-300 uppercase tracking-wider">Access</p>
                <p className="mt-1.5 text-sm text-ink-200">
                  Availability and access are determined by each configured package and your account entitlements.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

function HeroPreviewStack() {
  const [featured, setFeatured] = useState<CatalogResource[]>([]);
  useEffect(() => {
    let active = true;
    catalogService.featuredResources(3).then((items) => { if (active) setFeatured(items); }).catch(() => {
      if (active) setFeatured([]);
    });
    return () => { active = false; };
  }, []);
  const icons = [FileText, FileQuestion, GraduationCap];
  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-gradient-to-br from-teal-100 to-ink-100 rounded-3xl blur-2xl opacity-60" aria-hidden />
      <div className="relative space-y-3">
        {/* Visual photo banner */}
        <div className="relative overflow-hidden rounded-2xl shadow-card border border-ink-150 group">
          <img
            src="https://images.pexels.com/photos/1438081/pexels-photo-1438081.jpeg?auto=compress&cs=tinysrgb&w=800"
            alt="University students studying together"
            className="w-full h-44 sm:h-48 object-cover transition-transform duration-500 group-hover:scale-105"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-ink-950/30 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white">
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-300 bg-teal-950/70 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-teal-500/30">
                <Sparkles className="h-3 w-3" /> SAZU Study Network
              </span>
              <p className="font-display text-sm sm:text-base font-bold mt-1 text-white">
                Collaborative Campus Learning
              </p>
            </div>
            <span className="text-xs font-semibold text-teal-200 bg-white/10 px-2.5 py-1 rounded-lg backdrop-blur-xs border border-white/15">
              Verified Syllabi
            </span>
          </div>
        </div>

        {featured.map((r, i) => {
          const Icon = icons[i % icons.length];
          return (
            <Card key={r.id} className="p-3.5 flex items-center gap-3 shadow-card hover:border-teal-200 transition-all">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 shrink-0">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-teal-700">{r.course.code} · {r.course.title}</p>
                <p className="truncate text-sm font-bold text-ink-950">{r.title}</p>
                <p className="text-xs text-ink-500 mt-0.5">{r.type}{r.level ? ` · Level ${r.level}` : ''}</p>
              </div>
              <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-1 rounded-full shrink-0">
                <Eye className="h-3.5 w-3.5" /> Details
              </span>
            </Card>
          );
        })}
        {featured.length === 0 && <p className="rounded-xl border border-dashed border-ink-200 bg-white p-5 text-sm text-ink-600">Published learning materials will appear here.</p>}
      </div>
    </div>
  );
}

function PracticePreview() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm group">
      <div className="relative h-44 sm:h-52 overflow-hidden">
        <img
          src="https://images.pexels.com/photos/1438072/pexels-photo-1438072.jpeg?auto=compress&cs=tinysrgb&w=800"
          alt="Student preparing for exams"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-85"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/50 to-transparent" />
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 bg-ink-950/80 px-2.5 py-1 rounded-full border border-amber-400/30">
            <Sparkles className="h-3 w-3" /> Timed Mock Engine
          </span>
        </div>
      </div>
      <div className="p-5">
        <p className="text-sm font-semibold text-white">Interactive Assessment Service</p>
        <p className="mt-2 text-xs sm:text-sm text-ink-300 leading-relaxed">
          Standardized past question simulations and instant scoring are being prepared by university departments.
        </p>
      </div>
    </div>
  );
}
