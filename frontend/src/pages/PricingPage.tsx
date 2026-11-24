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

  // Group packages dynamically
  const semesterPackages = packages.filter(
    (p) => p.package_type === 'semester' || p.package_type === 'subscription'
  );
  const sessionPackages = packages.filter((p) => p.package_type === 'session');
  const levelPackages = packages.filter((p) => p.package_type === 'level');
  const coursePackages = packages.filter((p) => p.package_type === 'course');
  const resourcePackages = packages.filter(
    (p) => p.package_type === 'resource' || p.package_type === 'resource_package'
  );

  const primarySemesterPkg = semesterPackages[0] ?? null;
  const primarySessionPkg = sessionPackages[0] ?? null;
  const primaryCoursePkg = coursePackages[0] ?? null;
  const primaryResourcePkg = resourcePackages[0] ?? null;

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
          Choose a full academic pass, unlock semester course materials, or pay per single handout or past question.
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
                Access test practice, exam questions, and lecture handouts tailored to your academic curriculum.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              {/* Semester Pass */}
              <Card className="flex flex-col justify-between overflow-hidden border-ink-200/80 hover:border-teal-300 transition-all shadow-card hover:shadow-pop">
                <div className="p-6 sm:p-8">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <Badge tone="neutral" className="mb-2">Semester Term</Badge>
                      <h3 className="font-display text-2xl font-bold text-ink-950">
                        {primarySemesterPkg ? primarySemesterPkg.name : 'Semester Subscription'}
                      </h3>
                      {primarySemesterPkg?.target_name && (
                        <p className="text-xs text-ink-500 font-medium mt-1">
                          {primarySemesterPkg.target_name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1 my-4">
                    <span className="font-display text-4xl sm:text-5xl font-extrabold text-ink-950">
                      {primarySemesterPkg ? `₦${(primarySemesterPkg.price_minor / 100).toLocaleString()}` : '—'}
                    </span>
                    <span className="text-sm font-semibold text-ink-500">/ semester</span>
                  </div>

                  <p className="text-xs sm:text-sm text-ink-700 leading-relaxed mb-6">
                    Full access for the current semester to test practice, exam practice questions, and all lecture handouts.
                  </p>

                  <ul className="space-y-3 text-xs sm:text-sm text-ink-800">
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                      <span><strong>Interactive Test Practice</strong> & timed exam questions</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                      <span>Past & current lecture handouts for registered semester courses</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                      <span>Course unit summaries & semester assessment preparation</span>
                    </li>
                  </ul>
                </div>

                <div className="p-6 bg-ink-50/70 border-t border-ink-100">
                  {primarySemesterPkg ? (
                    <Button
                      size="lg"
                      fullWidth
                      onClick={() => void startCheckout(primarySemesterPkg)}
                      loading={processingId === primarySemesterPkg.id}
                      leftIcon={<CreditCard className="h-5 w-5" />}
                    >
                      Subscribe for Semester (₦{(primarySemesterPkg.price_minor / 100).toLocaleString()})
                    </Button>
                  ) : (
                    <Button size="lg" fullWidth disabled>No semester plan published yet</Button>
                  )}
                </div>
              </Card>

              {/* Full Session Pass - BEST VALUE */}
              <Card className="relative flex flex-col justify-between overflow-hidden border-2 border-teal-600 shadow-pop">
                <div className="absolute top-0 right-0 bg-teal-600 text-white text-xs font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Best Value Pass
                </div>

                <div className="p-6 sm:p-8">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <Badge tone="teal" className="mb-2">Entire Academic Year</Badge>
                      <h3 className="font-display text-2xl font-bold text-ink-950">
                        {primarySessionPkg ? primarySessionPkg.name : 'Full Academic Session Pass'}
                      </h3>
                      {primarySessionPkg?.target_name && (
                        <p className="text-xs text-ink-500 font-medium mt-1">
                          {primarySessionPkg.target_name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1 my-4">
                    <span className="font-display text-4xl sm:text-5xl font-extrabold text-ink-950">
                      {primarySessionPkg ? `₦${(primarySessionPkg.price_minor / 100).toLocaleString()}` : '—'}
                    </span>
                    <span className="text-sm font-semibold text-ink-500">/ full session</span>
                  </div>

                  <p className="text-xs sm:text-sm text-ink-700 leading-relaxed mb-6">
                    Covers both First and Second Semesters of the academic session, including handouts, past questions, and practice exams.
                  </p>

                  <ul className="space-y-3 text-xs sm:text-sm text-ink-800">
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                      <span><strong>Both Semesters Included</strong> (First & Second Semesters)</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                      <span>Past questions for tests & exams across registered level courses</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                      <span>All lecture notes, handouts, and supplementary materials</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                      <span>Continuous access throughout the academic session</span>
                    </li>
                  </ul>
                </div>

                <div className="p-6 bg-teal-50/50 border-t border-teal-100">
                  {primarySessionPkg ? (
                    <Button
                      size="lg"
                      fullWidth
                      onClick={() => void startCheckout(primarySessionPkg)}
                      loading={processingId === primarySessionPkg.id}
                      leftIcon={<CreditCard className="h-5 w-5" />}
                    >
                      Get Session Pass (₦{(primarySessionPkg.price_minor / 100).toLocaleString()})
                    </Button>
                  ) : (
                    <Button size="lg" fullWidth disabled>No session plan published yet</Button>
                  )}
                </div>
              </Card>
            </div>
          </div>

          {/* LEVEL / STUDY-AHEAD PASSES */}
          <div>
            <div className="text-center sm:text-left mb-6">
              <h2 className="text-lg font-bold text-ink-900 flex items-center justify-center sm:justify-start gap-2">
                <Layers className="h-5 w-5 text-teal-600" />
                <span>Level & Study-Ahead Access Passes</span>
              </h2>
              <p className="text-xs sm:text-sm text-ink-600 mt-1">
                Access all resources, handouts, past questions, and assessments for any academic level outside your primary semester. Ideal for studying ahead during breaks or revising previous coursework. Active subscribers receive discounted add-on rates.
              </p>
            </div>

            {levelPackages.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {levelPackages.map((pkg) => {
                  const isDiscounted =
                    pkg.effective_price_minor != null &&
                    pkg.effective_price_minor < pkg.price_minor;
                  const currentPrice = pkg.effective_price_minor ?? pkg.price_minor;

                  return (
                    <Card
                      key={pkg.id}
                      className="flex flex-col justify-between p-6 border-ink-200 bg-white hover:border-teal-400 transition-all shadow-xs"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <Badge tone="teal">Cross-Level</Badge>
                          {pkg.target_name && (
                            <span className="text-xs font-mono font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                              {pkg.target_name.replace(/Level\s+Level/gi, 'Level')}
                            </span>
                          )}
                        </div>
                        <h3 className="font-display text-lg font-bold text-ink-950">
                          {pkg.name.replace(/Level\s+Level/gi, 'Level')}
                        </h3>

                        <div className="my-3">
                          <div className="flex items-baseline gap-2">
                            <span className="font-display text-3xl font-extrabold text-ink-950">
                              ₦{(currentPrice / 100).toLocaleString()}
                            </span>
                            {isDiscounted && (
                              <span className="text-sm line-through text-ink-400 font-medium">
                                ₦{(pkg.price_minor / 100).toLocaleString()}
                              </span>
                            )}
                            <span className="text-xs font-semibold text-ink-500">/ level</span>
                          </div>
                          {isDiscounted ? (
                            <Badge tone="green" className="mt-1 text-xs">
                              Subscriber Discount Applied (Save ₦{((pkg.price_minor - currentPrice) / 100).toLocaleString()})
                            </Badge>
                          ) : pkg.subscriber_price_minor ? (
                            <p className="mt-1 text-xs text-teal-700 font-medium">
                              ₦{(pkg.subscriber_price_minor / 100).toLocaleString()} for active subscribers
                            </p>
                          ) : null}
                        </div>

                        <p className="text-xs text-ink-600 leading-relaxed mb-4">
                          {pkg.description ||
                            'Full access to all course handouts, past test papers, exam questions, and quizzes for this academic level.'}
                        </p>
                        <ul className="space-y-1.5 text-xs text-ink-700">
                          <li className="flex items-start gap-2">
                            <Check className="h-3.5 w-3.5 text-teal-600 mt-0.5 shrink-0" />
                            <span>All level course materials & past questions</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="h-3.5 w-3.5 text-teal-600 mt-0.5 shrink-0" />
                            <span>Study ahead or revise previous courses</span>
                          </li>
                        </ul>
                      </div>

                      <div className="mt-5 pt-4 border-t border-ink-100">
                        <Button
                          size="md"
                          fullWidth
                          onClick={() => void startCheckout(pkg)}
                          loading={processingId === pkg.id}
                        >
                          Get Level Pass (₦{(currentPrice / 100).toLocaleString()})
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="p-6 bg-teal-50/40 border-teal-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-ink-950 text-sm">Need Access to Another Level?</h3>
                    <p className="text-xs text-ink-600 mt-1">
                      Cross-level and study-ahead passes allow you to access complete materials for 100L, 200L, 300L, 400L, or 500L. Standard rate: ₦2,000 / level; active subscribers pay only ₦1,000.
                    </p>
                  </div>
                  <Link to="/courses">
                    <Button size="sm" variant="outline">
                      Explore Level Courses
                    </Button>
                  </Link>
                </div>
              </Card>
            )}
          </div>

          {/* COURSE PASS & PER-RESOURCE MICRO-ACCESS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Single Course Pass */}
            <Card className="p-6 sm:p-8 border-ink-200 bg-white shadow-xs flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-100 text-teal-900 text-xs font-bold uppercase tracking-wider mb-2">
                  <BookOpen className="h-3.5 w-3.5" /> Course Pass
                </div>
                <h3 className="font-display text-xl font-bold text-ink-950">
                  {primaryCoursePkg ? primaryCoursePkg.name : 'Single Course Pass'}
                </h3>

                {primaryCoursePkg ? (
                  <div className="my-3">
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-3xl font-extrabold text-ink-950">
                        ₦{(((primaryCoursePkg.effective_price_minor ?? primaryCoursePkg.price_minor)) / 100).toLocaleString()}
                      </span>
                      {primaryCoursePkg.effective_price_minor != null &&
                        primaryCoursePkg.effective_price_minor < primaryCoursePkg.price_minor && (
                          <span className="text-sm line-through text-ink-400 font-medium">
                            ₦{(primaryCoursePkg.price_minor / 100).toLocaleString()}
                          </span>
                        )}
                      <span className="text-xs font-normal text-ink-500">/ course</span>
                    </div>
                    {primaryCoursePkg.effective_price_minor != null &&
                      primaryCoursePkg.effective_price_minor < primaryCoursePkg.price_minor ? (
                      <Badge tone="green" className="mt-1 text-xs">
                        Subscriber Discount Applied
                      </Badge>
                    ) : primaryCoursePkg.subscriber_price_minor ? (
                      <p className="mt-1 text-xs text-teal-700 font-medium">
                        ₦{(primaryCoursePkg.subscriber_price_minor / 100).toLocaleString()} for active subscribers
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="font-display text-3xl font-extrabold text-ink-950 my-3">
                    ₦300 <span className="text-xs font-normal text-ink-500">/ course (₦200 for subscribers)</span>
                  </div>
                )}

                <p className="text-xs sm:text-sm text-ink-600 leading-relaxed">
                  Focus on a single course. Unlocks all handouts, lecture materials, and practice assessment questions for that course.
                </p>
              </div>

              <div className="mt-6">
                {primaryCoursePkg ? (
                  <Button
                    size="md"
                    fullWidth
                    onClick={() => void startCheckout(primaryCoursePkg)}
                    loading={processingId === primaryCoursePkg.id}
                  >
                    Unlock Course (₦{(((primaryCoursePkg.effective_price_minor ?? primaryCoursePkg.price_minor)) / 100).toLocaleString()})
                  </Button>
                ) : (
                  <Link to="/courses">
                    <Button size="md" fullWidth variant="outline" rightIcon={<ArrowRight className="h-4 w-4" />}>
                      Browse Courses
                    </Button>
                  </Link>
                )}
              </div>
            </Card>

            {/* Single Resource Pass */}
            <Card className="p-6 sm:p-8 border-teal-200 bg-gradient-to-br from-teal-50/60 via-white to-blue-50/40 shadow-xs flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-100 text-teal-900 text-xs font-bold uppercase tracking-wider mb-2">
                  <FileText className="h-3.5 w-3.5" /> Pay-Per-Material
                </div>
                <h3 className="font-display text-xl font-bold text-ink-950">
                  {primaryResourcePkg ? primaryResourcePkg.name : 'Single Resource Pass'}
                </h3>
                <div className="font-display text-3xl font-extrabold text-ink-950 my-3">
                  {primaryResourcePkg ? `₦${(primaryResourcePkg.price_minor / 100).toLocaleString()}` : '₦300'}{' '}
                  <span className="text-xs font-normal text-ink-500">/ resource</span>
                </div>
                <p className="text-xs sm:text-sm text-ink-700 leading-relaxed">
                  Need only one handout, a single test paper, or exam past question? Pay per material to unlock the document and related practice questions immediately.
                </p>
              </div>

              <div className="mt-6">
                {primaryResourcePkg ? (
                  <Button
                    size="md"
                    fullWidth
                    onClick={() => void startCheckout(primaryResourcePkg)}
                    loading={processingId === primaryResourcePkg.id}
                  >
                    Unlock Material (₦{(primaryResourcePkg.price_minor / 100).toLocaleString()})
                  </Button>
                ) : (
                  <Link to="/materials">
                    <Button size="md" fullWidth rightIcon={<ArrowRight className="h-4 w-4" />}>
                      Browse Materials
                    </Button>
                  </Link>
                )}
              </div>
            </Card>
          </div>

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
