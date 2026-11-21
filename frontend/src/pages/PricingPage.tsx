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
  Lock,
  Sparkles,
  Layers,
  FileText,
  BookOpen,
  Calendar,
  GraduationCap,
  HelpCircle,
} from 'lucide-react';

export function PricingPage() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const startCheckout = async (pkg: SubscriptionPackage) => {
    if (!profile) {
      navigate(`/login?redirect=${encodeURIComponent('/pricing')}`);
      return;
    }
    setProcessingId(pkg.id);
    setError(null);
    try {
      const checkout = await paymentService.initializePayment(pkg.id);
      window.location.assign(checkout.checkout_url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to initialize secure checkout.'
      );
      setProcessingId(null);
      await refreshProfile();
    }
  };

  // Identify specific packages from backend
  const semesterPkg = packages.find((p) => p.name.toLowerCase().includes('semester') && !p.name.toLowerCase().includes('lower'));
  const sessionPkg = packages.find((p) => p.name.toLowerCase().includes('session'));
  const lowerSubscribedPkg = packages.find(
    (p) => p.name.toLowerCase().includes('lower') && p.name.toLowerCase().includes('sub')
  );
  const lowerStandalonePkg = packages.find(
    (p) => p.name.toLowerCase().includes('lower') && p.name.toLowerCase().includes('standalone')
  );
  const singleMaterialPkg = packages.find((p) => p.name.toLowerCase().includes('single'));

  return (
    <div className="container-page py-8 sm:py-14">
      {/* Header section */}
      <div className="text-center max-w-3xl mx-auto px-4">
        <Badge tone="teal" className="mb-3 px-3 py-1">
          <Tag className="h-3.5 w-3.5 mr-1" /> Student Academic Pricing
        </Badge>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-ink-950 tracking-tight text-balance">
          Transparent, Affordable Access for Every SAZU Student
        </h1>
        <p className="mt-3.5 text-base sm:text-lg text-ink-600 leading-relaxed text-balance">
          Choose a full academic pass, unlock lower-level carryover materials, or pay as little as ₦300 per single handout or past question.
        </p>

        {profile && (
          <div className="mt-5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-900 text-xs sm:text-sm font-semibold">
            <GraduationCap className="h-4 w-4 text-teal-700" />
            <span>
              Your Profile: {profile.academic?.level ?? 'Undergraduate'} •{' '}
              {profile.hasSubscription ? (
                <span className="text-emerald-700 font-bold">Active Subscriber ✓</span>
              ) : (
                <span className="text-ink-600 font-normal">Standard Account</span>
              )}
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="max-w-4xl mx-auto mt-6 px-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {loading ? (
        <div className="max-w-4xl mx-auto mt-10 px-4">
          <Card className="p-8 text-center text-ink-600 text-sm">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-r-transparent mr-2 align-middle" />
            Loading real-time packages from Study Hub service…
          </Card>
        </div>
      ) : (
        <div className="mt-10 max-w-5xl mx-auto space-y-10 px-4">
          {/* PRIMARY TIERS: Semester vs Session */}
          <div>
            <div className="text-center sm:text-left mb-6">
              <h2 className="text-lg font-bold text-ink-900 flex items-center justify-center sm:justify-start gap-2">
                <Calendar className="h-5 w-5 text-teal-600" />
                <span>Standard Level Access Packages</span>
              </h2>
              <p className="text-xs sm:text-sm text-ink-600 mt-1">
                Access test practice, exam questions, and lecture handouts tailored to your registered level.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              {/* Semester Pass: 1,500 */}
              <Card className="flex flex-col justify-between overflow-hidden border-ink-200/80 hover:border-teal-300 transition-all shadow-card hover:shadow-pop">
                <div className="p-6 sm:p-8">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <Badge tone="neutral" className="mb-2">Semester Term</Badge>
                      <h3 className="font-display text-2xl font-bold text-ink-950">
                        {semesterPkg ? semesterPkg.name : 'Per Semester Package'}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1 my-4">
                    <span className="font-display text-4xl sm:text-5xl font-extrabold text-ink-950">₦1,500</span>
                    <span className="text-sm font-semibold text-ink-500">/ semester</span>
                  </div>

                  <p className="text-xs sm:text-sm text-ink-700 leading-relaxed mb-6">
                    Full access for the current semester to test practice, exam practice questions, and all handouts for your level courses.
                  </p>

                  <ul className="space-y-3 text-xs sm:text-sm text-ink-800">
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                      <span><strong>Interactive Test Practice</strong> & timed exam questions</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                      <span>Past & current lecture handouts for all courses at your level</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                      <span>Course unit summaries & semester assessment preparation</span>
                    </li>
                  </ul>
                </div>

                <div className="p-6 bg-ink-50/70 border-t border-ink-100">
                  {semesterPkg ? (
                    <Button
                      size="lg"
                      fullWidth
                      onClick={() => void startCheckout(semesterPkg)}
                      loading={processingId === semesterPkg.id}
                      leftIcon={<CreditCard className="h-5 w-5" />}
                    >
                      Subscribe for Semester (₦1,500)
                    </Button>
                  ) : (
                    <Button size="lg" fullWidth disabled>Temporarily unavailable</Button>
                  )}
                </div>
              </Card>

              {/* Full Session Pass: 2,000 - BEST VALUE */}
              <Card className="relative flex flex-col justify-between overflow-hidden border-2 border-teal-600 shadow-pop">
                <div className="absolute top-0 right-0 bg-teal-600 text-white text-xs font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Best Value • Save ₦1,000
                </div>

                <div className="p-6 sm:p-8">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <Badge tone="teal" className="mb-2">Entire Academic Year</Badge>
                      <h3 className="font-display text-2xl font-bold text-ink-950">
                        {sessionPkg ? sessionPkg.name : 'Per Session Package'}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1 my-4">
                    <span className="font-display text-4xl sm:text-5xl font-extrabold text-ink-950">₦2,000</span>
                    <span className="text-sm font-semibold text-ink-500">/ full session</span>
                  </div>

                  <p className="text-xs sm:text-sm text-ink-700 leading-relaxed mb-6">
                    Covers your whole academic session (First & Second Semesters) including all available handouts, past questions for tests and exams.
                  </p>

                  <ul className="space-y-3 text-xs sm:text-sm text-ink-800">
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                      <span><strong>Both Semesters Included</strong> for your academic year</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                      <span>Past questions for tests & exams across all registered level courses</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                      <span>All lecture notes and supplementary study materials</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                      <span>Priority access to new practice tests uploaded during the session</span>
                    </li>
                  </ul>
                </div>

                <div className="p-6 bg-teal-50/50 border-t border-teal-100">
                  {sessionPkg ? (
                    <Button
                      size="lg"
                      fullWidth
                      onClick={() => void startCheckout(sessionPkg)}
                      loading={processingId === sessionPkg.id}
                      leftIcon={<CreditCard className="h-5 w-5" />}
                    >
                      Get Full Session Pass (₦2,000)
                    </Button>
                  ) : (
                    <Button size="lg" fullWidth disabled>Temporarily unavailable</Button>
                  )}
                </div>
              </Card>
            </div>
          </div>

          {/* CROSS-LEVEL (LOWER LEVEL) ACCESS */}
          <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-ink-900 to-ink-950 text-white relative overflow-hidden">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-teal-500/15 blur-3xl pointer-events-none" />

            <div className="max-w-2xl mb-6">
              <Badge tone="teal" className="mb-2.5 bg-teal-400/20 text-teal-200 border-teal-400/30">
                Carryover & Prerequisite Study
              </Badge>
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
                Access Resources for Lower Levels
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-ink-200 leading-relaxed">
                Need to prepare for carryover exams or revise foundational prerequisites from earlier years? You can unlock all resources for all levels lower than yours.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-6">
              {/* Option A: 1,000 for active subscribers */}
              <div className="rounded-2xl bg-white/10 border border-white/15 p-5 sm:p-6 flex flex-col justify-between backdrop-blur">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-300">Subscriber Add-On</span>
                    <span className="text-xl font-bold font-display text-white">₦1,000</span>
                  </div>
                  <h3 className="font-display text-base font-bold text-white mb-2">
                    For Current Level Subscribers
                  </h3>
                  <p className="text-xs text-ink-200 leading-relaxed mb-4">
                    If you have already paid for your current level semester package, unlock all lower level materials for just ₦1,000.
                  </p>
                </div>
                {lowerSubscribedPkg && (
                  <Button
                    size="sm"
                    fullWidth
                    onClick={() => void startCheckout(lowerSubscribedPkg)}
                    loading={processingId === lowerSubscribedPkg.id}
                    className="bg-teal-400 text-ink-950 hover:bg-teal-300 font-semibold text-xs"
                  >
                    Unlock Lower Levels (₦1,000)
                  </Button>
                )}
              </div>

              {/* Option B: 2,000 standalone */}
              <div className="rounded-2xl bg-white/10 border border-white/15 p-5 sm:p-6 flex flex-col justify-between backdrop-blur">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-ink-300">Standalone Pass</span>
                    <span className="text-xl font-bold font-display text-white">₦2,000</span>
                  </div>
                  <h3 className="font-display text-base font-bold text-white mb-2">
                    Without Level Subscription
                  </h3>
                  <p className="text-xs text-ink-200 leading-relaxed mb-4">
                    Direct access to all lower-level past questions, handouts, and practice assessments if you have not subscribed to your main semester.
                  </p>
                </div>
                {lowerStandalonePkg && (
                  <Button
                    size="sm"
                    fullWidth
                    variant="secondary"
                    onClick={() => void startCheckout(lowerStandalonePkg)}
                    loading={processingId === lowerStandalonePkg.id}
                    className="bg-white/15 border-white/20 text-white hover:bg-white/25 font-semibold text-xs"
                  >
                    Get Standalone Access (₦2,000)
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* PER-COURSE / PER-RESOURCE MICRO-ACCESS: 300 NAIRA */}
          <Card className="p-6 sm:p-8 border-teal-200 bg-gradient-to-r from-teal-50/60 via-white to-blue-50/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="max-w-xl">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-100 text-teal-900 text-xs font-bold uppercase tracking-wider mb-2">
                  <FileText className="h-3.5 w-3.5" /> Pay-Per-Material
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-ink-950">
                  Single Resource & Practice Pass — ₦300
                </h2>
                <p className="mt-2 text-xs sm:text-sm text-ink-700 leading-relaxed">
                  Only need one handout, a single test paper, or exam past question? Instead of paying for a whole level, pay <strong>₦300 per material</strong>. Paying unlocks the full document plus related test practice questions immediately!
                </p>
              </div>

              <div className="shrink-0 text-center sm:text-right">
                <div className="font-display text-3xl font-extrabold text-ink-950 mb-2">
                  ₦300 <span className="text-xs font-normal text-ink-500">/ resource</span>
                </div>
                <Link to="/courses">
                  <Button size="md" rightIcon={<ArrowRight className="h-4 w-4" />}>
                    Browse Catalogue & Unlock
                  </Button>
                </Link>
              </div>
            </div>
          </Card>

          {/* Safety and Guarantee notice */}
          <div className="p-5 rounded-2xl bg-ink-50 border border-ink-100 flex items-start gap-3.5">
            <ShieldCheck className="h-5 w-5 text-teal-700 mt-0.5 shrink-0" />
            <div className="text-xs sm:text-sm text-ink-700 leading-relaxed">
              <strong>Secure Academic Processing:</strong> Payments are processed securely via Paystack. Access is verified directly against your student academic record on the Study Hub backend.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
