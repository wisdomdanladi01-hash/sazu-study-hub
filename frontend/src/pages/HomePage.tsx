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
import { AcademicGatewayMatrix } from '@/components/AcademicGatewayMatrix';
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
            <div className="lg:col-span-7 animate-slide-up">
              <Badge tone="teal" className="mb-4 shadow-2xs">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" /> Official Academic Resource Hub
              </Badge>
              <h1 className="font-display text-[2.2rem] leading-[1.12] sm:text-5xl lg:text-[3.25rem] font-extrabold text-ink-950 text-balance tracking-tight">
                Resources Made Available for a <span className="text-teal-600 bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 bg-clip-text text-transparent">Successful Academic Journey</span>
              </h1>
              <p className="mt-5 max-w-xl text-base sm:text-lg text-ink-700 leading-relaxed font-normal">
                Past examination papers, verified test solutions, and comprehensive lecture handouts for your exact university courses — organized by session, searchable instantly, and ready when you are.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <Link to="/materials">
                  <Button size="lg" fullWidth={false} leftIcon={<BookOpen className="h-5 w-5" />} rightIcon={<ArrowRight className="h-4 w-4" />} className="shadow-md hover:shadow-lg transition-all">
                    Explore Learning Materials
                  </Button>
                </Link>
                <Link to="/courses">
                  <Button size="lg" variant="outline" leftIcon={<GraduationCap className="h-5 w-5" />} className="border-ink-300 font-semibold text-ink-800 hover:bg-ink-50">
                    Browse Course Catalogue
                  </Button>
                </Link>
                <Link to="/practice">
                  <Button size="lg" variant="outline" leftIcon={<ListChecks className="h-5 w-5" />} className="border-ink-300 font-semibold text-ink-800 hover:bg-ink-50">
                    Explore Practice Tests
                  </Button>
                </Link>
              </div>
              <p className="mt-4 text-sm font-medium text-ink-700">
                Browse public course and resource listings without signing in.
              </p>
            </div>

            {/* Visual: stack of resource preview cards */}
            <div className="lg:col-span-5 animate-slide-up-delay-2">
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

      {/* Professional Academic Gateway & Departmental Prerequisite Advisory Matrix */}
      <AcademicGatewayMatrix />

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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [fadeKey, setFadeKey] = useState(0);

  useEffect(() => {
    let active = true;
    catalogService
      .featuredResources(15)
      .then((items) => {
        if (active) setFeatured(items);
      })
      .catch(() => {
        if (active) setFeatured([]);
      });
    return () => {
      active = false;
    };
  }, []);

  // Auto-rotate every 4.5 seconds when not paused by mouse hover
  useEffect(() => {
    if (featured.length <= 3 || isPaused) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % featured.length);
      setFadeKey((prev) => prev + 1);
    }, 4500);
    return () => clearInterval(timer);
  }, [featured.length, isPaused]);

  const handleNext = () => {
    if (featured.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % featured.length);
    setFadeKey((prev) => prev + 1);
  };

  const handlePrev = () => {
    if (featured.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + featured.length) % featured.length);
    setFadeKey((prev) => prev + 1);
  };

  // Get 3 visible rotating items
  const visibleItems = featured.length > 0
    ? [0, 1, 2].map((offset) => featured[(currentIndex + offset) % featured.length])
    : [];

  const icons = [FileText, FileQuestion, GraduationCap];

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="absolute -inset-4 bg-gradient-to-br from-teal-100 to-ink-100 rounded-3xl blur-2xl opacity-60" aria-hidden />
      <div className="relative space-y-3">
        {/* Visual photo banner: Academic study books and library collection */}
        <div className="relative overflow-hidden rounded-2xl shadow-card border border-ink-150 group">
          <img
            src="https://images.pexels.com/photos/159711/books-bookstore-book-reading-159711.jpeg?auto=compress&cs=tinysrgb&w=800"
            alt="Stack of academic study books and library course materials"
            className="w-full h-44 sm:h-48 object-cover transition-transform duration-500 group-hover:scale-105"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-ink-950/30 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white">
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-300 bg-teal-950/70 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-teal-500/30">
                <Sparkles className="h-3 w-3" /> SAZU Academic Library
              </span>
              <p className="font-display text-sm sm:text-base font-bold mt-1 text-white">
                Course Materials &amp; Past Questions
              </p>
            </div>
            <span className="text-xs font-semibold text-teal-200 bg-white/10 px-2.5 py-1 rounded-lg backdrop-blur-xs border border-white/15">
              Verified Syllabi
            </span>
          </div>
        </div>

        {/* Dynamic Rotating Header Indicator */}
        {featured.length > 3 && (
          <div className="flex items-center justify-between px-1 text-xs text-ink-600">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[11px] text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-600 animate-ping" />
              Live Catalogue Feed &bull; Rotating {isPaused ? '(Paused)' : ''}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous documents"
                className="h-6 w-6 rounded-md bg-white border border-ink-200 text-ink-700 hover:bg-teal-50 hover:text-teal-800 flex items-center justify-center transition shadow-2xs"
              >
                &lsaquo;
              </button>
              <span className="text-[11px] font-mono text-ink-500">
                {currentIndex + 1} / {featured.length}
              </span>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next documents"
                className="h-6 w-6 rounded-md bg-white border border-ink-200 text-ink-700 hover:bg-teal-50 hover:text-teal-800 flex items-center justify-center transition shadow-2xs"
              >
                &rsaquo;
              </button>
            </div>
          </div>
        )}

        {/* Rotating Course Document Cards with Smooth Fade Transition */}
        <div key={fadeKey} className="space-y-2.5 animate-fade-in transition-all">
          {visibleItems.map((r, i) => {
            const Icon = icons[i % icons.length];
            return (
              <Link key={`${r.id}-${i}`} to={`/materials/${r.id}`} className="block group">
                <Card className="p-3.5 flex items-center gap-3 shadow-card hover:border-teal-400 hover:shadow-md transition-all group-hover:-translate-y-0.5">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 shrink-0 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200/60">
                        {r.course.code}
                      </span>
                      <span className="truncate text-xs font-semibold text-ink-700">
                        {r.course.title}
                      </span>
                    </div>
                    <p className="truncate text-sm font-bold text-ink-950 mt-0.5 group-hover:text-teal-800 transition-colors">
                      {r.title}
                    </p>
                    <p className="text-[11px] text-ink-500 mt-0.5">
                      {r.type}{r.level ? ` · Level ${r.level}` : ''}{r.semester ? ` · ${r.semester} Sem` : ''}
                    </p>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1 text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full shrink-0 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                    <Eye className="h-3.5 w-3.5" /> Details
                  </span>
                </Card>
              </Link>
            );
          })}
        </div>

        {featured.length === 0 && (
          <p className="rounded-xl border border-dashed border-ink-200 bg-white p-5 text-sm text-ink-600">
            Published learning materials will appear here.
          </p>
        )}
      </div>
    </div>
  );
}

function PracticePreview() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm group">
      <div className="relative h-44 sm:h-52 overflow-hidden">
        <img
          src="https://images.pexels.com/photos/256455/pexels-photo-256455.jpeg?auto=compress&cs=tinysrgb&w=800"
          alt="Stack of library textbooks and exam revision books"
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
