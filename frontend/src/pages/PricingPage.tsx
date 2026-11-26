import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { paymentService, type SubscriptionPackage } from '@/services/payments';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import {
  Check,
  ShieldCheck,
  CreditCard,
  Tag,
  ArrowRight,
  Sparkles,
  FileText,
  Calendar,
  GraduationCap,
  BookOpen,
  Layers,
  Info,
  X,
  Zap,
  HelpCircle,
  Clock,
  CheckCircle2,
} from 'lucide-react';

export function PricingPage() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'primary' | 'cross_level' | 'single'>('all');
  const [modalPkg, setModalPkg] = useState<SubscriptionPackage | null>(null);

  useEffect(() => {
    let active = true;
    paymentService
      .listPackages()
      .then((items) => {
        if (active) setPackages(items);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load subscription packages.'
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const startCheckout = async (pkg: SubscriptionPackage, key?: string) => {
    if (!profile) {
      navigate(`/login?redirect=${encodeURIComponent('/pricing')}`);
      return;
    }
    const actionKey = key ?? String(pkg.id);
    setProcessingKey(actionKey);
    setError(null);
    try {
      const checkout = await paymentService.initializePayment(pkg.id);
      if (checkout.checkout_url) {
        window.location.assign(checkout.checkout_url);
      } else {
        throw new Error('Payment provider did not return a valid checkout link.');
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to initialize secure checkout. Please try again.'
      );
      setProcessingKey(null);
      await refreshProfile();
    }
  };

  // Group packages dynamically
  const sessionPackages = packages.filter((p) => p.package_type === 'session');
  const semesterPackages = packages.filter(
    (p) => p.package_type === 'semester' || p.package_type === 'subscription'
  );
  const levelPackages = packages.filter((p) => p.package_type === 'level');
  const resourcePackages = packages.filter(
    (p) => p.package_type === 'resource' || p.package_type === 'resource_package'
  );

  const primarySessionPkg = sessionPackages[0] ?? null;
  const primarySemesterPkg = semesterPackages[0] ?? null;
  const primaryLevelPkg = levelPackages[0] ?? null;
  const primaryResourcePkg = resourcePackages[0] ?? null;

  return (
    <div className="container-page py-8 sm:py-14 animate-fade-in">
      {/* Header section */}
      <div className="text-center max-w-3xl mx-auto px-4">
        <Badge tone="teal" className="mb-3 px-3 py-1 shadow-xs hover:scale-105 transition-transform">
          <Tag className="h-3.5 w-3.5 mr-1" /> Student Academic Subscription
        </Badge>
        <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-ink-950 tracking-tight text-balance">
          Transparent, Flexible Plans for Every <span className="text-teal-600">SAZU Scholar</span>
        </h1>
        <p className="mt-3.5 text-base sm:text-lg text-ink-600 leading-relaxed text-balance">
          Subscribe for your full session, unlock single semester course materials, register for carryover levels, or pay per individual handout.
        </p>

        {profile && (
          <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-50/80 border border-teal-200 text-teal-900 text-xs sm:text-sm font-semibold shadow-xs">
            <GraduationCap className="h-4 w-4 text-teal-700" />
            <span>
              Your Status:{' '}
              {profile.hasSubscription ? (
                <span className="text-emerald-700 font-bold inline-flex items-center gap-1">
                  Active Subscriber <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                </span>
              ) : (
                <span className="text-ink-600 font-normal">Standard Account (Subscribed rates unlock on first plan)</span>
              )}
            </span>
          </div>
        )}

        {/* Tab Filters */}
        <div className="flex justify-center items-center gap-2 mt-8 flex-wrap">
          {[
            { id: 'all', label: 'All 6 Subscription Tiers' },
            { id: 'primary', label: 'Semester & Session' },
            { id: 'cross_level', label: 'Cross-Level & Carryover' },
            { id: 'single', label: 'Single Handout Unlock' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${activeTab === tab.id
                ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20 scale-105'
                : 'bg-white border border-ink-200 text-ink-700 hover:border-teal-300 hover:bg-teal-50/50'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="max-w-4xl mx-auto mt-6 px-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {loading ? (
        <div className="max-w-4xl mx-auto mt-10 px-4">
          <Card className="p-10 text-center text-ink-600 text-sm shadow-xs">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-r-transparent mr-2 align-middle" />
            Loading real-time plans from SAZU Study Hub service…
          </Card>
        </div>
      ) : (
        <div className="mt-10 max-w-6xl mx-auto space-y-12 px-4">
          {/* PRIMARY TIERS: Session vs Semester */}
          {(activeTab === 'all' || activeTab === 'primary') && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-ink-950 flex items-center gap-2 font-display">
                    <Calendar className="h-5 w-5 text-teal-600" />
                    <span>Primary Level Access Packages</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-ink-600 mt-1">
                    The core subscriptions for enrolled undergraduate students covering all departmental courses.
                  </p>
                </div>
                <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-200/60 self-start sm:self-auto">
                  Instant Paystack Activation
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                {/* 1. Full Session Pass (₦2,000) - HIGHEST VALUE */}
                <div className="relative group rounded-3xl p-1 bg-gradient-to-b from-teal-500 via-teal-600 to-ink-900 shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 flex flex-col">
                  <div className="absolute -top-3.5 right-6 bg-gradient-to-r from-amber-400 to-amber-500 text-ink-950 font-black text-xs px-3.5 py-1 rounded-full shadow-md uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                    <Sparkles className="h-3.5 w-3.5" /> Best Value &bull; 365 Days
                  </div>

                  <div className="bg-white rounded-[22px] p-6 sm:p-8 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="px-3 py-1 rounded-full bg-teal-100/70 text-teal-900 text-xs font-bold uppercase tracking-wider">
                          Full Academic Year
                        </span>
                        <span className="text-xs font-semibold text-ink-500">Tier 1</span>
                      </div>

                      <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-ink-950">
                        {primarySessionPkg ? primarySessionPkg.name : 'Full Session Academic Pass'}
                      </h3>
                      <p className="text-xs text-ink-500 mt-1">
                        Covers both 1st & 2nd Semesters for your enrolled level
                      </p>

                      <div className="flex items-baseline gap-2 my-5">
                        <span className="font-display text-4xl sm:text-5xl font-black text-teal-700">
                          ₦2,000
                        </span>
                        <span className="text-sm font-semibold text-ink-500">/ full session</span>
                      </div>

                      <p className="text-xs sm:text-sm text-ink-700 leading-relaxed mb-6 font-medium">
                        Unrestricted access to all lecture notes, handouts, test past questions, and certified examination worked solutions throughout the entire academic year.
                      </p>

                      <div className="border-t border-ink-100 pt-5 space-y-3 text-xs sm:text-sm text-ink-800">
                        <div className="flex items-start gap-2.5">
                          <div className="p-0.5 rounded-full bg-teal-100 text-teal-700 mt-0.5 shrink-0">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                          <span><strong>Both 1st & 2nd Semesters</strong> fully unlocked</span>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <div className="p-0.5 rounded-full bg-teal-100 text-teal-700 mt-0.5 shrink-0">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                          <span>Complete past exam papers with step-by-step marking solutions</span>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <div className="p-0.5 rounded-full bg-teal-100 text-teal-700 mt-0.5 shrink-0">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                          <span>Continuous assessment (C.A.) tests and departmental lecture slides</span>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <div className="p-0.5 rounded-full bg-teal-100 text-teal-700 mt-0.5 shrink-0">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                          <span>Qualifies student for <strong>50% discounts</strong> on cross-level carryover passes & single handouts</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 pt-5 border-t border-ink-100 space-y-3">
                      {primarySessionPkg ? (
                        <Button
                          size="lg"
                          fullWidth
                          className="bg-teal-600 hover:bg-teal-500 text-white font-bold shadow-md hover:shadow-lg transition-all"
                          onClick={() => void startCheckout(primarySessionPkg, 'session')}
                          loading={processingKey === 'session'}
                          leftIcon={<CreditCard className="h-5 w-5" />}
                        >
                          Subscribe for Full Session (₦2,000)
                        </Button>
                      ) : (
                        <Button size="lg" fullWidth disabled>Session Package Loading…</Button>
                      )}

                      <button
                        type="button"
                        onClick={() => setModalPkg(primarySessionPkg)}
                        className="w-full text-center text-xs font-semibold text-teal-700 hover:text-teal-900 hover:underline flex items-center justify-center gap-1 cursor-pointer py-1"
                      >
                        <Info className="h-3.5 w-3.5" /> View detailed session plan syllabus & benefits
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Per Semester Pass (₦1,500) */}
                <div className="group rounded-3xl p-1 bg-gradient-to-b from-ink-200 to-ink-300 shadow-md hover:shadow-xl hover:-translate-y-2 transition-all duration-300 flex flex-col">
                  <div className="bg-white rounded-[22px] p-6 sm:p-8 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="px-3 py-1 rounded-full bg-ink-100 text-ink-800 text-xs font-bold uppercase tracking-wider">
                          Active Semester Term
                        </span>
                        <span className="text-xs font-semibold text-ink-500">Tier 2</span>
                      </div>

                      <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-ink-950">
                        {primarySemesterPkg ? primarySemesterPkg.name : 'Single Semester Study Pass'}
                      </h3>
                      <p className="text-xs text-ink-500 mt-1">
                        Covers current active semester courses and test reviews
                      </p>

                      <div className="flex items-baseline gap-2 my-5">
                        <span className="font-display text-4xl sm:text-5xl font-black text-ink-900">
                          ₦1,500
                        </span>
                        <span className="text-sm font-semibold text-ink-500">/ semester</span>
                      </div>

                      <p className="text-xs sm:text-sm text-ink-700 leading-relaxed mb-6 font-medium">
                        Targeted revision pass for students focusing on their immediate semester examinations, continuous tests, and syllabi handouts.
                      </p>

                      <div className="border-t border-ink-100 pt-5 space-y-3 text-xs sm:text-sm text-ink-800">
                        <div className="flex items-start gap-2.5">
                          <div className="p-0.5 rounded-full bg-ink-100 text-teal-700 mt-0.5 shrink-0">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                          <span>All courses registered for the current active semester</span>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <div className="p-0.5 rounded-full bg-ink-100 text-teal-700 mt-0.5 shrink-0">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                          <span>Verified mid-semester continuous assessment (C.A.) tests</span>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <div className="p-0.5 rounded-full bg-ink-100 text-teal-700 mt-0.5 shrink-0">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                          <span>Certified past questions with comprehensive answers</span>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <div className="p-0.5 rounded-full bg-ink-100 text-teal-700 mt-0.5 shrink-0">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                          <span>Unlocks subscriber rates for cross-level & single handouts</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 pt-5 border-t border-ink-100 space-y-3">
                      {primarySemesterPkg ? (
                        <Button
                          size="lg"
                          fullWidth
                          variant="outline"
                          className="border-teal-600 text-teal-800 hover:bg-teal-50 font-bold transition-all"
                          onClick={() => void startCheckout(primarySemesterPkg, 'semester')}
                          loading={processingKey === 'semester'}
                          leftIcon={<CreditCard className="h-5 w-5" />}
                        >
                          Subscribe for Semester (₦1,500)
                        </Button>
                      ) : (
                        <Button size="lg" fullWidth disabled>Semester Package Loading…</Button>
                      )}

                      <button
                        type="button"
                        onClick={() => setModalPkg(primarySemesterPkg)}
                        className="w-full text-center text-xs font-semibold text-ink-600 hover:text-ink-900 hover:underline flex items-center justify-center gap-1 cursor-pointer py-1"
                      >
                        <Info className="h-3.5 w-3.5" /> View semester terms & covered course details
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CROSS-LEVEL & CARRYOVER TIERS (Tier 3 & 4) */}
          {(activeTab === 'all' || activeTab === 'cross_level') && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-ink-950 flex items-center gap-2 font-display">
                    <Layers className="h-5 w-5 text-teal-600" />
                    <span>Cross-Level Carryover & Study-Ahead Passes</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-ink-600 mt-1">
                    Specifically designed for carryover courses (e.g. 300L taking 200L MTH 201) or studying ahead for the next academic level.
                  </p>
                </div>
                <Badge tone="teal">Tiers 3 &amp; 4</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Tier 3: Subscribed Student Rate (₦1,000) */}
                <Card className="p-6 sm:p-7 border-teal-300 bg-linear-to-br from-teal-50/70 via-white to-emerald-50/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Subscribed Student Rate (Tier 3)
                      </span>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                        50% OFF
                      </span>
                    </div>

                    <h3 className="font-display text-xl font-bold text-ink-950">
                      Cross-Level Carryover Pass &bull; Active Subscriber
                    </h3>
                    <p className="text-xs text-ink-600 mt-1">
                      For students already holding an active current level pass
                    </p>

                    <div className="my-4 flex items-baseline gap-2">
                      <span className="font-display text-3xl sm:text-4xl font-black text-emerald-700">
                        ₦1,000
                      </span>
                      <span className="text-sm line-through text-ink-400 font-semibold">₦2,000</span>
                      <span className="text-xs font-semibold text-ink-500">/ level</span>
                    </div>

                    <p className="text-xs sm:text-sm text-ink-700 leading-relaxed mb-4">
                      If you have already paid for your primary level (or semester pass), unlock complete materials for any one lower level (e.g. 200L carryover) or higher level for just ₦1,000.
                    </p>

                    <ul className="space-y-2 text-xs text-ink-800">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>All lecture notes & test questions for the chosen lower/higher level</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Crucial for clearing carryovers like <strong>MTH 201</strong></span>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-6 pt-4 border-t border-ink-100 space-y-2">
                    <Button
                      fullWidth
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                      onClick={() => primaryLevelPkg && void startCheckout(primaryLevelPkg, 'tier3')}
                      loading={processingKey === 'tier3'}
                    >
                      Get Discounted Cross-Level Pass (₦1,000)
                    </Button>
                    <button
                      type="button"
                      onClick={() => setModalPkg(primaryLevelPkg)}
                      className="w-full text-center text-xs font-semibold text-teal-700 hover:underline pt-1 cursor-pointer"
                    >
                      How carryover validation works &rarr;
                    </button>
                  </div>
                </Card>

                {/* Tier 4: Standalone Cross-Level Rate (₦2,000) */}
                <Card className="p-6 sm:p-7 border-ink-200 bg-white hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="px-2.5 py-1 rounded-full bg-ink-100 text-ink-800 text-xs font-bold uppercase tracking-wider">
                        Standard Standalone Rate (Tier 4)
                      </span>
                      <span className="text-xs text-ink-500 font-semibold">Single Level</span>
                    </div>

                    <h3 className="font-display text-xl font-bold text-ink-950">
                      Cross-Level Access Pass &bull; Standalone
                    </h3>
                    <p className="text-xs text-ink-500 mt-1">
                      For students who have not subscribed to their current level
                    </p>

                    <div className="my-4 flex items-baseline gap-2">
                      <span className="font-display text-3xl sm:text-4xl font-black text-ink-950">
                        ₦2,000
                      </span>
                      <span className="text-xs font-semibold text-ink-500">/ level</span>
                    </div>

                    <p className="text-xs sm:text-sm text-ink-700 leading-relaxed mb-4">
                      Directly access all study materials, test papers, and exam solutions for a single academic level higher or lower without purchasing your own level pass first.
                    </p>

                    <ul className="space-y-2 text-xs text-ink-800">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-teal-600 shrink-0" />
                        <span>Full access across all courses of the specified level</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-teal-600 shrink-0" />
                        <span>Ideal for external revision or specialized carryover focus</span>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-6 pt-4 border-t border-ink-100 space-y-2">
                    <Button
                      fullWidth
                      variant="outline"
                      className="border-ink-300 font-bold"
                      onClick={() => primaryLevelPkg && void startCheckout(primaryLevelPkg, 'tier4')}
                      loading={processingKey === 'tier4'}
                    >
                      Get Standalone Level Pass (₦2,000)
                    </Button>
                    <button
                      type="button"
                      onClick={() => setModalPkg(primaryLevelPkg)}
                      className="w-full text-center text-xs font-semibold text-ink-600 hover:underline pt-1 cursor-pointer"
                    >
                      View level pass terms &rarr;
                    </button>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* SINGLE MATERIAL MICRO-ACCESS (Tier 5 & 6) */}
          {(activeTab === 'all' || activeTab === 'single') && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-ink-950 flex items-center gap-2 font-display">
                    <FileText className="h-5 w-5 text-teal-600" />
                    <span>Single Handout &amp; Exam Past Question Unlock</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-ink-600 mt-1">
                    Pay-per-resource micro-purchases when you need one specific document without purchasing a whole semester subscription.
                  </p>
                </div>
                <Badge tone="teal">Tiers 5 &amp; 6</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Tier 5: Standard Single Material (₦300) */}
                <Card className="p-6 sm:p-7 border-ink-200 bg-white hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="px-2.5 py-1 rounded-full bg-ink-100 text-ink-800 text-xs font-bold uppercase tracking-wider">
                        Standard Micro-Pass (Tier 5)
                      </span>
                      <span className="text-xs text-ink-500 font-semibold">No Subscription Needed</span>
                    </div>

                    <h3 className="font-display text-xl font-bold text-ink-950">
                      Single Material Quick Unlock
                    </h3>
                    <p className="text-xs text-ink-500 mt-1">
                      In your enrolled level or below without a semester subscription
                    </p>

                    <div className="my-4 flex items-baseline gap-2">
                      <span className="font-display text-3xl sm:text-4xl font-black text-ink-950">
                        ₦300
                      </span>
                      <span className="text-xs font-semibold text-ink-500">/ single document</span>
                    </div>

                    <p className="text-xs sm:text-sm text-ink-700 leading-relaxed mb-4">
                      Need immediate access to only one specific exam paper, marking guide, or lecture handout? Unlock that single file instantly with Paystack without committing to any subscription plan.
                    </p>

                    <ul className="space-y-2 text-xs text-ink-800">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-teal-600 shrink-0" />
                        <span>Instant unlock in secure reader with offline study support</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-teal-600 shrink-0" />
                        <span>Includes all worked solutions and practice questions for that document</span>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-6 pt-4 border-t border-ink-100 space-y-2">
                    {primaryResourcePkg ? (
                      <Button
                        fullWidth
                        onClick={() => void startCheckout(primaryResourcePkg, 'tier5')}
                        loading={processingKey === 'tier5'}
                      >
                        Unlock Single Document (₦300)
                      </Button>
                    ) : (
                      <Link to="/materials">
                        <Button fullWidth rightIcon={<ArrowRight className="h-4 w-4" />}>
                          Browse Materials &amp; Unlock
                        </Button>
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => setModalPkg(primaryResourcePkg)}
                      className="w-full text-center text-xs font-semibold text-ink-600 hover:underline pt-1 cursor-pointer"
                    >
                      Read single unlock rules &rarr;
                    </button>
                  </div>
                </Card>

                {/* Tier 6: Subscribed Student Micro-Discount (₦150) */}
                <Card className="p-6 sm:p-7 border-teal-200 bg-gradient-to-br from-teal-50/70 via-white to-blue-50/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="px-2.5 py-1 rounded-full bg-teal-100 text-teal-900 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Subscribed Student Rate (Tier 6)
                      </span>
                      <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
                        50% OFF
                      </span>
                    </div>

                    <h3 className="font-display text-xl font-bold text-ink-950">
                      Single Document &bull; Cross-Level Add-On
                    </h3>
                    <p className="text-xs text-ink-500 mt-1">
                      For active subscribers needing an individual file outside their primary level
                    </p>

                    <div className="my-4 flex items-baseline gap-2">
                      <span className="font-display text-3xl sm:text-4xl font-black text-teal-700">
                        ₦150
                      </span>
                      <span className="text-sm line-through text-ink-400 font-semibold">₦300</span>
                      <span className="text-xs font-semibold text-ink-500">/ single document</span>
                    </div>

                    <p className="text-xs sm:text-sm text-ink-700 leading-relaxed mb-4">
                      Already have an active semester or session subscription? You get a 50% discount on single files from other levels (carryover papers or advanced readings) for just ₦150.
                    </p>

                    <ul className="space-y-2 text-xs text-ink-800">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-teal-600 shrink-0" />
                        <span>Exclusive loyalty rate for active subscribers</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-teal-600 shrink-0" />
                        <span>Zero commitment to buying full secondary level passes</span>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-6 pt-4 border-t border-ink-100 space-y-2">
                    {primaryResourcePkg ? (
                      <Button
                        fullWidth
                        className="bg-teal-700 hover:bg-teal-600 text-white font-bold"
                        onClick={() => void startCheckout(primaryResourcePkg, 'tier6')}
                        loading={processingKey === 'tier6'}
                      >
                        Unlock as Subscriber (₦150)
                      </Button>
                    ) : (
                      <Link to="/materials">
                        <Button fullWidth rightIcon={<ArrowRight className="h-4 w-4" />}>
                          Explore Material Catalogue
                        </Button>
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => setModalPkg(primaryResourcePkg)}
                      className="w-full text-center text-xs font-semibold text-teal-700 hover:underline pt-1 cursor-pointer"
                    >
                      Read subscriber add-on terms &rarr;
                    </button>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Security & Instant Processing banner */}
          <div className="p-6 rounded-3xl bg-linear-to-r from-teal-900 to-ink-950 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-teal-500/20 text-teal-300 border border-teal-500/30 shrink-0">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-display text-base sm:text-lg font-bold text-white">
                  Guaranteed Instant Activation with Paystack
                </h4>
                <p className="text-xs sm:text-sm text-teal-200/90 mt-1 max-w-2xl leading-relaxed">
                  Every subscription is processed through Paystack's encrypted gateway. Your access is instantly verified and tied to your SAZU student account, allowing immediate offline reading and test practice.
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2 text-xs font-bold text-teal-300 bg-white/10 px-4 py-2 rounded-xl backdrop-blur-xs border border-white/10">
              <Zap className="h-4 w-4 text-amber-300" /> Real-time Entitlement
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Full Plan Details & Explanations */}
      {modalPkg && (
        <PlanDetailsModal
          pkg={modalPkg}
          onClose={() => setModalPkg(null)}
          onSubscribe={(p) => {
            setModalPkg(null);
            void startCheckout(p);
          }}
        />
      )}
    </div>
  );
}

interface PlanDetailsModalProps {
  pkg: SubscriptionPackage;
  onClose: () => void;
  onSubscribe: (pkg: SubscriptionPackage) => void;
}

function PlanDetailsModal({ pkg, onClose, onSubscribe }: PlanDetailsModalProps) {
  const isSession = pkg.package_type === 'session';
  const isSemester = pkg.package_type === 'semester' || pkg.package_type === 'subscription';
  const isLevel = pkg.package_type === 'level';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/70 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-ink-150 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-r from-teal-900 to-ink-950 text-white flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-400/20 text-teal-300 text-xs font-semibold mb-2 border border-teal-400/30">
              <Info className="h-3 w-3" /> Official Plan Breakdown
            </div>
            <h3 className="font-display text-2xl font-extrabold text-white">{pkg.name}</h3>
            <p className="text-xs text-teal-200 mt-1">
              SAZU Academic Pass &bull; Pricing, Carryover Rules &amp; Instant Entitlements
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-ink-300 hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs sm:text-sm text-ink-800 leading-relaxed">
          {/* Pricing Summary */}
          <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200/80 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-teal-900 uppercase tracking-wider">Plan Cost</p>
              <p className="font-display text-2xl font-extrabold text-teal-950 mt-0.5">
                ₦{(pkg.price_minor / 100).toLocaleString()}{' '}
                {pkg.subscriber_price_minor && (
                  <span className="text-xs font-normal text-emerald-700">
                    (₦{(pkg.subscriber_price_minor / 100).toLocaleString()} for active subscribers)
                  </span>
                )}
              </p>
            </div>
            <Badge tone="teal" className="text-xs font-bold">
              {isSession ? '365 Days Duration' : isSemester ? 'Current Semester' : 'Full Access Pass'}
            </Badge>
          </div>

          {/* Description */}
          <div>
            <h4 className="font-bold text-ink-950 text-sm mb-1.5">Overview &amp; Purpose</h4>
            <p className="text-ink-700">{pkg.description}</p>
          </div>

          {/* Detailed Inclusions */}
          <div>
            <h4 className="font-bold text-ink-950 text-sm mb-2.5">What is Included in this Pass?</h4>
            <div className="grid sm:grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-ink-50/70 border border-ink-150 flex items-start gap-2">
                <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                <span>Verified departmental lecture notes and syllabus outlines</span>
              </div>
              <div className="p-3 rounded-xl bg-ink-50/70 border border-ink-150 flex items-start gap-2">
                <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                <span>Certified past examination papers with step-by-step marking solutions</span>
              </div>
              <div className="p-3 rounded-xl bg-ink-50/70 border border-ink-150 flex items-start gap-2">
                <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                <span>Continuous Assessment (C.A.) test question archives</span>
              </div>
              <div className="p-3 rounded-xl bg-ink-50/70 border border-ink-150 flex items-start gap-2">
                <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                <span>Offline reading capability on your mobile device or laptop</span>
              </div>
            </div>
          </div>

          {/* Carryover and Level Regulations */}
          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
            <h4 className="font-bold text-amber-950 text-xs sm:text-sm flex items-center gap-1.5 mb-1">
              <HelpCircle className="h-4 w-4 text-amber-700" />
              Academic Regulations &amp; Carryover Rules
            </h4>
            <p className="text-xs text-amber-900 leading-relaxed">
              {isSession &&
                'The Session Pass covers both First and Second Semesters of your current academic level. If you have carryover courses from previous years (such as MTH 201), you can add a Cross-Level Pass at the 50% discounted student rate of ₦1,000.'}
              {isSemester &&
                'The Semester Pass covers all registered courses within the active semester for your level. It grants immediate qualification for subscriber discounts on cross-level carryovers.'}
              {isLevel &&
                'Cross-Level Passes allow students to study courses from another level (e.g. 100L, 200L, 300L). Active subscribers pay ₦1,000; non-subscribers pay ₦2,000.'}
              {!isSession && !isSemester && !isLevel &&
                'Single material micro-purchases unlock that specific document permanently in your offline reader. Active subscribers unlock files for ₦150; standard rate is ₦300.'}
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-5 bg-ink-50 border-t border-ink-150 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            className="bg-teal-600 hover:bg-teal-500 text-white font-bold px-6"
            onClick={() => onSubscribe(pkg)}
            leftIcon={<CreditCard className="h-4 w-4" />}
          >
            Proceed to Checkout (₦{(pkg.price_minor / 100).toLocaleString()})
          </Button>
        </div>
      </div>
    </div>
  );
}
