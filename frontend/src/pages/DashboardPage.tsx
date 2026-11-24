import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, describeAcademic } from '@/auth/AuthContext';
import { catalogService, type CatalogResource } from '@/services/catalog';
import { paymentService, type PaymentRecord } from '@/services/payments';
import { apiRequest } from '@/services/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ResourceCard } from '@/components/ResourceCard';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  BookOpen,
  CreditCard,
  Clock,
  ArrowRight,
  History,
  User,
  GraduationCap,
  Tag,
  ListChecks,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Camera,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { formatDate } from '@/utils/format';

interface DashboardResponse {
  user?: {
    nickname?: string | null;
    avatar_url?: string | null;
    email_verified?: boolean;
  };
  academic_profile?: {
    matriculation_number?: string | null;
  } | null;
  verification: {
    status: string;
    submitted_at?: string | null;
    decision_reason?: string | null;
  };
  subscription: {
    status: string;
    is_active: boolean;
    ends_at: string;
    plan?: { name: string } | null;
  } | null;
}

export function DashboardPage() {
  const { profile, isLoading, token } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [materials, setMaterials] = useState<CatalogResource[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || !token) {
      setLoading(false);
      return;
    }
    let active = true;
    Promise.all([
      apiRequest<DashboardResponse>('/dashboard', {}, token),
      catalogService.featuredResources(3),
      paymentService.getPaymentHistory(),
    ])
      .then(([data, resourceItems, paymentItems]) => {
        if (!active) return;
        setDashboard(data);
        setMaterials(resourceItems);
        setPayments(paymentItems);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load your dashboard.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [profile, token]);

  if (isLoading || loading) {
    return (
      <div className="container-page py-16 text-center">
        <div className="inline-flex items-center gap-2 text-sm text-ink-600">
          <Clock className="h-4 w-4 animate-spin text-teal-600" />
          <span>Loading your Study Hub dashboard…</span>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container-page py-16 max-w-md">
        <Alert tone="info" title="Sign in to see your dashboard">
          <p className="text-sm">Your student study dashboard is available after you sign in.</p>
        </Alert>
        <div className="mt-4 flex gap-3">
          <Link to="/login">
            <Button>Sign in</Button>
          </Link>
          <Link to="/register">
            <Button variant="outline">Create account</Button>
          </Link>
        </div>
      </div>
    );
  }

  const hasSubscription = dashboard?.subscription?.is_active ?? profile.hasSubscription;
  const expiry = dashboard?.subscription?.ends_at ?? profile.subscriptionExpiresAt;
  const emailVerified = Boolean(dashboard?.user?.email_verified || profile.emailVerified);
  const verificationStatus = dashboard?.verification.status ?? profile.verificationStatus ?? 'not_submitted';
  const isFullyVerified = emailVerified && verificationStatus === 'approved';
  const avatarUrl = profile.avatarUrl ?? dashboard?.user?.avatar_url ?? null;
  const nickname = profile.nickname ?? dashboard?.user?.nickname ?? null;
  const matric = dashboard?.academic_profile?.matriculation_number ?? profile.matriculationNumber ?? null;

  return (
    <div className="container-page py-8 sm:py-10 space-y-7">
      {/* 1. Student Hero Profile Card */}
      <Card className="p-6 sm:p-7 border-teal-100 bg-linear-to-r from-teal-50/40 via-white to-emerald-50/20 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {/* Avatar with Camera badge */}
            <div className="relative shrink-0 group">
              <div className="h-20 w-20 sm:h-22 sm:w-22 rounded-2xl overflow-hidden bg-linear-to-br from-teal-600 to-emerald-800 text-white shadow-md border-3 border-white flex items-center justify-center font-display font-bold text-2xl sm:text-3xl">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={profile.fullName} className="h-full w-full object-cover" />
                ) : (
                  <span>{(nickname || profile.fullName || 'S').charAt(0).toUpperCase()}</span>
                )}
              </div>
              <Link
                to="/profile"
                className="absolute -bottom-1.5 -right-1.5 p-1.5 rounded-full bg-teal-600 text-white shadow hover:bg-teal-700 transition"
                title="Update profile picture"
              >
                <Camera className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Student Name & Academic Badges */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-950">
                  {profile.fullName}
                </h1>
                {nickname && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold">
                    <Sparkles className="h-3 w-3 text-teal-600" />
                    {nickname}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-600">
                <span className="inline-flex items-center gap-1 text-ink-700 font-medium">
                  <GraduationCap className="h-3.5 w-3.5 text-teal-600" />
                  {describeAcademic(profile)}
                </span>
                {matric && (
                  <span className="font-mono bg-ink-100 text-ink-800 px-2 py-0.5 rounded font-semibold text-[11px]">
                    Matric: {matric}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {emailVerified ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <ShieldCheck className="h-3 w-3 text-emerald-600" />
                    Email Verified
                  </span>
                ) : (
                  <Link
                    to="/onboarding"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 hover:bg-amber-100 transition"
                  >
                    <AlertCircle className="h-3 w-3 text-amber-600" />
                    Verify Email Now
                  </Link>
                )}

                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    verificationStatus === 'approved'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : verificationStatus === 'pending'
                      ? 'bg-sky-50 text-sky-800 border-sky-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  {verificationStatus === 'approved' ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      Student Identity Approved
                    </>
                  ) : verificationStatus === 'pending' ? (
                    <>
                      <Clock className="h-3 w-3 text-sky-600" />
                      Verification Under Review
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-3 w-3 text-amber-600" />
                      Verification Incomplete
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Edit Profile Action */}
          <div className="shrink-0">
            <Link to="/profile">
              <Button variant="outline" size="sm" leftIcon={<User className="h-3.5 w-3.5" />}>
                Edit Profile &amp; Nickname
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {/* 2. Clear Student Verification Section */}
      {!isFullyVerified ? (
        <Card className="p-6 border-amber-300 bg-linear-to-br from-amber-50/70 via-white to-amber-50/30 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-amber-100 text-amber-800">
                  <ShieldAlert className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-display text-lg font-bold text-ink-950">
                    Complete Student Verification
                  </h2>
                  <p className="text-xs text-amber-900 font-semibold">
                    Full lecture notes, test materials, and verified student discounts require an active verification.
                  </p>
                </div>
              </div>

              {/* Two-step status indicator */}
              <div className="grid sm:grid-cols-2 gap-3 pt-2">
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-amber-200/80 shadow-2xs">
                  {emailVerified ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  )}
                  <div>
                    <p className="text-xs font-bold text-ink-900">Step 1: Email Confirmation</p>
                    <p className="text-[11px] text-ink-500">
                      {emailVerified ? 'Confirmed via 6-digit code' : 'Confirmation code required'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-amber-200/80 shadow-2xs">
                  {verificationStatus === 'approved' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : verificationStatus === 'pending' ? (
                    <Clock className="h-4 w-4 text-sky-600 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  )}
                  <div>
                    <p className="text-xs font-bold text-ink-900">Step 2: Matric &amp; Academic Status</p>
                    <p className="text-[11px] text-ink-500">
                      {verificationStatus === 'approved'
                        ? 'Approved by administrator'
                        : verificationStatus === 'pending'
                        ? 'Awaiting administrator review'
                        : 'Submit matric no. and programme'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 flex flex-col gap-2">
              <Link to="/onboarding">
                <Button size="md" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  {verificationStatus === 'pending' ? 'View Submission Status' : 'Verify Student Status'}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-4 sm:p-5 border-emerald-200 bg-emerald-50/40">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-950">Verified Student Account</p>
                <p className="text-xs text-emerald-800">
                  Your academic identity has been officially approved. You have full access to study materials and student pricing.
                </p>
              </div>
            </div>
            <Link to="/onboarding" className="text-xs font-semibold text-emerald-800 hover:underline shrink-0">
              Academic details
            </Link>
          </div>
        </Card>
      )}

      {/* 3. Main Dashboard Layout (Subscription, Materials, Quick Actions) */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Subscription Card */}
          <Card className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="h-5 w-5 text-teal-600" />
                  <h2 className="font-display font-bold text-ink-950">Subscription Status</h2>
                </div>
                {hasSubscription ? (
                  <>
                    <p className="mt-1 text-sm text-ink-700">
                      Your semester access subscription is active and in good standing.
                    </p>
                    {expiry && (
                      <p className="mt-1.5 text-xs text-ink-500 inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-teal-600" />
                        Valid until <span className="font-semibold text-ink-800">{formatDate(expiry)}</span>
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-sm text-ink-700">
                    No active semester subscription. Subscribe to unlock all semester resources and test questions.
                  </p>
                )}
              </div>
              <Badge tone={hasSubscription ? 'green' : 'amber'}>
                {hasSubscription ? 'Active' : 'Inactive'}
              </Badge>
            </div>

            <div className="mt-5 pt-4 border-t border-ink-100 flex flex-wrap items-center gap-3">
              {!hasSubscription && (
                <Link to="/pricing">
                  <Button leftIcon={<Tag className="h-4 w-4" />}>
                    View Subscription Plans
                  </Button>
                </Link>
              )}
              {payments.length > 0 && (
                <Link to="/payments">
                  <Button variant="outline" leftIcon={<History className="h-4 w-4" />}>
                    Payment History
                  </Button>
                </Link>
              )}
            </div>
          </Card>

          {/* Learning Materials Section */}
          <section>
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-teal-600" />
                <h2 className="font-display text-lg font-bold text-ink-950">
                  Learning Materials &amp; Handouts
                </h2>
              </div>
              <Link
                to="/materials"
                className="text-sm font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1"
              >
                Browse all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {materials.length === 0 ? (
              <Card className="p-8">
                <EmptyState
                  icon={<BookOpen className="h-8 w-8 text-ink-400" />}
                  title="No materials published yet"
                  description="When administrators publish new lecture notes, past questions, and handouts for your courses, they will appear here."
                  action={
                    <Link to="/materials">
                      <Button variant="outline" leftIcon={<BookOpen className="h-4 w-4" />}>
                        Explore Catalogue
                      </Button>
                    </Link>
                  }
                />
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {materials.map((resource) => (
                  <ResourceCard key={resource.id} resource={resource} course={resource.course} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Quick Actions */}
          <Card className="p-5">
            <h3 className="font-display font-bold text-ink-950 mb-3">Quick Navigation</h3>
            <div className="space-y-1.5">
              <QuickLink
                to="/materials"
                icon={<BookOpen className="h-4 w-4 text-teal-600" />}
                label="Learning materials"
                description="Search lecture notes & past papers"
              />
              <QuickLink
                to="/practice"
                icon={<ListChecks className="h-4 w-4 text-teal-600" />}
                label="Practice tests"
                description="Timed mock exam assessments"
              />
              <QuickLink
                to="/pricing"
                icon={<CreditCard className="h-4 w-4 text-teal-600" />}
                label="Packages & Passes"
                description="Semester & cross-level plans"
              />
              <QuickLink
                to="/profile"
                icon={<User className="h-4 w-4 text-teal-600" />}
                label="Profile & settings"
                description="Nickname, photo & account"
              />
            </div>
          </Card>

          {/* Academic Portal Card */}
          <Card className="p-5">
            <h3 className="font-display font-bold text-ink-950">Student Verification</h3>
            <p className="mt-2 text-xs text-ink-600 leading-relaxed">
              Review your matriculation number, faculty, department, and academic programme documents.
            </p>
            <div className="mt-4 pt-3 border-t border-ink-100 flex items-center justify-between">
              <span className="text-xs text-ink-500 capitalize">
                Status: <strong className="text-ink-900 font-semibold">{verificationStatus}</strong>
              </span>
              <Link to="/onboarding">
                <Button variant="outline" size="sm">
                  View details
                </Button>
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function QuickLink({
  to,
  icon,
  label,
  description,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-xl p-3 text-sm font-semibold text-ink-800 hover:bg-ink-50 transition border border-transparent hover:border-ink-100"
    >
      <div className="flex items-start gap-3">
        <span className="p-2 rounded-lg bg-teal-50 border border-teal-100 shrink-0 mt-0.5">{icon}</span>
        <div>
          <span className="block text-ink-900 font-bold text-xs">{label}</span>
          <span className="block text-ink-500 font-normal text-[11px]">{description}</span>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-ink-400 shrink-0" />
    </Link>
  );
}
