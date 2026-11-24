import { useEffect, useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { adminService } from '@/services/admin';
import type { AdminOverview } from '@/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Dialog } from '@/components/ui/Dialog';
import {
  FileText,
  UserCheck,
  BookOpen,
  GraduationCap,
  CreditCard,
  FileSpreadsheet,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  Users,
  Camera,
  Edit2,
  Mail,
  CheckCircle2,
  Sparkles,
  Plus,
  AlertTriangle,
  ListChecks,
  Shield,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { formatDate } from '@/utils/format';

export function AdminOverviewPage() {
  const { profile, updateProfile, uploadAvatar, refreshProfile } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Profile Modal state
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState(profile?.fullName ?? '');
  const [editNickname, setEditNickname] = useState(profile?.nickname ?? '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatarUrl ?? null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminService
      .getOverview()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load overview.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openEditModal = () => {
    setEditName(profile?.fullName ?? '');
    setEditNickname(profile?.nickname ?? '');
    setAvatarPreview(profile?.avatarUrl ?? null);
    setAvatarFile(null);
    setProfileError(null);
    setProfileSuccess(null);
    setEditProfileOpen(true);
  };

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileError('Please select a valid image file (JPEG, PNG, or WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileError('Avatar image must not exceed 5 MB.');
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setProfileError(null);
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(null);

    try {
      if (avatarFile) {
        const uploadRes = await uploadAvatar(avatarFile);
        if (!uploadRes.ok) {
          throw new Error(uploadRes.error || 'Failed to upload profile picture.');
        }
      }

      await updateProfile({
        fullName: editName.trim(),
        nickname: editNickname.trim() || undefined,
      });

      await refreshProfile();
      setProfileSuccess('Profile updated successfully!');
      setTimeout(() => {
        setEditProfileOpen(false);
      }, 900);
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : 'Unable to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const metrics = data?.metrics;
  const totalRevenueNaira = ((metrics?.total_revenue_minor ?? 0) / 100).toLocaleString();

  return (
    <div className="space-y-7">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-950">Administrator Dashboard</h1>
          <p className="mt-1 text-sm text-ink-600">
            Real-time management overview of curriculum completeness, students, revenue, and learning resources.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} loading={loading} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Refresh data
          </Button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {/* Admin Profile Hero Card */}
      <Card className="overflow-hidden border border-ink-200/80 shadow-card bg-white">
        <div className="bg-gradient-to-r from-ink-900 via-ink-950 to-teal-950 p-6 text-white sm:flex sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 sm:gap-5">
            {/* Avatar with click-to-edit */}
            <div className="relative group shrink-0">
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl overflow-hidden ring-4 ring-white/20 bg-teal-800 flex items-center justify-center text-white font-display text-xl sm:text-2xl font-bold shadow-lg">
                {profile?.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={profile.fullName} className="h-full w-full object-cover" />
                ) : (
                  <span>{profile?.fullName?.charAt(0).toUpperCase() || 'A'}</span>
                )}
              </div>
              <button
                type="button"
                onClick={openEditModal}
                className="absolute -bottom-1.5 -right-1.5 h-7 w-7 rounded-full bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center shadow-md border-2 border-white transition-transform hover:scale-110"
                title="Change Avatar / Edit Profile"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Profile Info */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate">
                  {profile?.fullName || 'Administrator'}
                </h2>
                {profile?.nickname && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-400/30">
                    <Sparkles className="h-3 w-3" />
                    @{profile.nickname}
                  </span>
                )}
                <Badge tone={profile?.isSuperuser ? 'green' : 'teal'}>
                  {profile?.isSuperuser ? 'Super Administrator' : (profile?.role || 'Staff Admin')}
                </Badge>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-300">
                <span className="flex items-center gap-1 truncate">
                  <Mail className="h-3.5 w-3.5 text-ink-400" />
                  {profile?.email}
                </span>
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Verified Admin Account
                </span>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-4 sm:mt-0 flex shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={openEditModal}
              leftIcon={<Edit2 className="h-3.5 w-3.5" />}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-sm"
            >
              Edit Profile &amp; Photo
            </Button>
          </div>
        </div>

        {/* Quick Operational Status Sub-bar */}
        <div className="px-6 py-3 bg-ink-50/70 border-t border-ink-100 flex flex-wrap items-center justify-between gap-4 text-xs text-ink-600">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium text-ink-700">Brevo Transactional Email Live</span>
            <span className="text-ink-400">&bull;</span>
            <span>Paystack Gateway Connected</span>
            <span className="text-ink-400">&bull;</span>
            <span>Neon Database Active</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-ink-500">
              Role: <strong className="text-ink-800">{profile?.isSuperuser ? 'Full Superuser Privileges' : 'Role-Based Admin'}</strong>
            </span>
          </div>
        </div>
      </Card>

      {/* Primary KPI Metrics (6 Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <MetricCard
          title="Platform Revenue"
          value={`₦${totalRevenueNaira}`}
          subtitle={`${metrics?.succeeded_payments ?? 0} successful sales`}
          icon={CreditCard}
          tone="green"
          link="/admin/packages"
        />
        <MetricCard
          title="Registered Students"
          value={metrics ? String(metrics.total_students ?? 0) : '—'}
          subtitle={metrics ? `${metrics.verified_students ?? 0} email verified` : ''}
          icon={Users}
          tone="blue"
          link="/admin/verification"
        />
        <MetricCard
          title="Published Resources"
          value={metrics ? `${metrics.published_resources} / ${metrics.total_resources}` : '—'}
          subtitle="Library learning files"
          icon={FileText}
          tone="teal"
          link="/admin/resources"
        />
        <MetricCard
          title="Pending Verifications"
          value={metrics ? String(metrics.pending_verifications) : '—'}
          subtitle="Students awaiting review"
          icon={UserCheck}
          tone={metrics && metrics.pending_verifications > 0 ? 'amber' : 'green'}
          link="/admin/verification"
        />
        <MetricCard
          title="Course Offerings"
          value={metrics ? String(metrics.total_course_offerings) : '—'}
          subtitle={metrics ? `${metrics.verified_offerings} verified units` : ''}
          icon={BookOpen}
          tone="neutral"
          link="/admin/courses"
        />
        <MetricCard
          title="Curriculum Catalog"
          value={metrics ? String(metrics.total_programmes) : '—'}
          subtitle={metrics ? `${metrics.total_faculties} fac, ${metrics.total_departments} dept` : ''}
          icon={GraduationCap}
          tone="neutral"
          link="/admin/academic"
        />
      </div>

      {/* Course Materials Completeness & Gap Analysis Card */}
      <Card className="p-5 sm:p-6 border border-ink-200/90 shadow-card bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-ink-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-teal-600" />
              <h2 className="font-display text-base sm:text-lg font-bold text-ink-950">
                Course Materials Completeness &amp; Gap Analysis
              </h2>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-ink-600">
              Track whether every curriculum course has all 3 essential study materials: <strong>Lecture Handouts</strong>, <strong>Test Past Questions (C.A.)</strong>, and <strong>Exam Past Questions</strong>.
            </p>
          </div>
          <Link to="/admin/courses">
            <Button size="sm" leftIcon={<BookOpen className="h-4 w-4" />}>
              Inspect Course Gaps
            </Button>
          </Link>
        </div>

        {/* Coverage Highlights Grid */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Complete Courses</span>
            <p className="mt-1 font-display text-2xl font-bold text-emerald-950">
              {metrics?.complete_courses ?? 0}
            </p>
            <p className="text-[11px] text-emerald-700 mt-0.5">Has all 3 materials</p>
          </div>

          <div className="p-3.5 rounded-xl bg-teal-50/70 border border-teal-200">
            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-800">Partial Materials</span>
            <p className="mt-1 font-display text-2xl font-bold text-teal-950">
              {metrics?.partial_courses ?? 0}
            </p>
            <p className="text-[11px] text-teal-700 mt-0.5">Has 1 or 2 materials</p>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Lacking Handouts</span>
            <p className="mt-1 font-display text-2xl font-bold text-amber-950">
              {metrics?.courses_lacking_handouts ?? 0}
            </p>
            <p className="text-[11px] text-amber-700 mt-0.5">Missing lecture notes</p>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Lacking Test PQ</span>
            <p className="mt-1 font-display text-2xl font-bold text-amber-950">
              {metrics?.courses_lacking_test_pqs ?? 0}
            </p>
            <p className="text-[11px] text-amber-700 mt-0.5">Missing C.A. test papers</p>
          </div>

          <div className="p-3.5 rounded-xl bg-red-50/70 border border-red-200">
            <span className="text-[11px] font-bold uppercase tracking-wider text-red-800">Lacking Exam PQ</span>
            <p className="mt-1 font-display text-2xl font-bold text-red-950">
              {metrics?.courses_lacking_exam_pqs ?? 0}
            </p>
            <p className="text-[11px] text-red-700 mt-0.5">Missing exam papers</p>
          </div>
        </div>
      </Card>

      {/* Management Workspaces & Operations Hub (8 Encapsulated Cards) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-ink-950">Management Workspaces</h2>
            <p className="text-xs text-ink-600">Direct access to administrative operational tools and services.</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <WorkspaceCard
            title="Learning Resources"
            description="Upload past questions, lecture handouts, and multi-page documents with secure watermarking."
            icon={FileText}
            badge={`${metrics?.published_resources ?? 0} files in repository`}
            link="/admin/resources"
            actionLabel="Manage Resources"
            tone="teal"
          />

          <WorkspaceCard
            title="Course Units & Coverage"
            description="View all curriculum units, verify course listings, and inspect material completeness."
            icon={BookOpen}
            badge={`${metrics?.total_course_offerings ?? 0} course offerings`}
            link="/admin/courses"
            actionLabel="View Courses"
            tone="blue"
          />

          <WorkspaceCard
            title="Bulk CSV Import"
            description="Upload and import course offerings in bulk using verified UTF-8 spreadsheet templates."
            icon={FileSpreadsheet}
            badge="Atomic DB Import"
            link="/admin/import"
            actionLabel="Import Offerings"
            tone="green"
          />

          <WorkspaceCard
            title="Academic Directory"
            description="Manage faculties, departments, programmes, academic sessions, and semester schedules."
            icon={GraduationCap}
            badge={`${metrics?.total_faculties ?? 0} faculties, ${metrics?.total_departments ?? 0} depts`}
            link="/admin/academic"
            actionLabel="Open Directory"
            tone="neutral"
          />

          <WorkspaceCard
            title="Student Verification"
            description="Review student matriculation numbers, JAMB credentials, and uploaded student ID cards."
            icon={UserCheck}
            badge={`${metrics?.pending_verifications ?? 0} awaiting review`}
            link="/admin/verification"
            actionLabel="Review Queue"
            tone={metrics && metrics.pending_verifications > 0 ? 'amber' : 'green'}
          />

          <WorkspaceCard
            title="Packages & Pricing"
            description="Configure semester passes, cross-level study access, micro-entitlements, and Paystack prices."
            icon={CreditCard}
            badge={`₦${totalRevenueNaira} revenue`}
            link="/admin/packages"
            actionLabel="Configure Pricing"
            tone="green"
          />

          <WorkspaceCard
            title="Practice Assessments"
            description="Create computer-based practice tests (CBT), configure question banks, timers, and solutions."
            icon={ListChecks}
            badge="CBT Exam Prep"
            link="/admin/assessments"
            actionLabel="Manage Tests"
            tone="teal"
          />

          <WorkspaceCard
            title="Admin Authorities"
            description="Manage administrative staff accounts, grant superuser privileges, and assign roles."
            icon={Shield}
            badge="RBAC Authorities"
            link="/admin/users"
            actionLabel="Manage Staff"
            tone="neutral"
          />
        </div>
      </div>

      {/* Activity Sections: 2x2 Encapsulated Cards Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Section 1: Registered Students */}
        <Card className="p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-ink-100">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-display font-bold text-ink-950">Recent Registered Students</h2>
                <p className="text-xs text-ink-500">{metrics?.total_students ?? 0} total registered students</p>
              </div>
            </div>
            <Link to="/admin/verification" className="text-xs font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1">
              Verify queue <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {!data?.recent_students || data.recent_students.length === 0 ? (
            <p className="text-sm text-ink-500 py-6 text-center">No student registrations recorded yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {data.recent_students.map((student) => (
                <li key={student.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-ink-100 text-ink-700 font-semibold flex items-center justify-center shrink-0 overflow-hidden text-xs">
                      {student.avatar_url ? (
                        <img src={student.avatar_url} alt={student.full_name} className="h-full w-full object-cover" />
                      ) : (
                        student.full_name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-xs sm:text-sm text-ink-900 truncate">{student.full_name}</p>
                        {student.nickname && (
                          <span className="text-[10px] font-medium text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded">
                            @{student.nickname}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-500 truncate">{student.email}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge tone={student.email_verified ? 'green' : 'amber'}>
                      {student.email_verified ? 'Verified' : 'Pending verification'}
                    </Badge>
                    {student.created_at && (
                      <p className="text-[10px] text-ink-400 mt-1">{formatDate(student.created_at)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Section 2: Platform Revenue & Transactions */}
        <Card className="p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-ink-100">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <CreditCard className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-display font-bold text-ink-950">Recent Succeeded Payments</h2>
                <p className="text-xs text-ink-500">₦{totalRevenueNaira} total revenue verified</p>
              </div>
            </div>
            <Link to="/admin/packages" className="text-xs font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1">
              Pricing <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {!data?.recent_payments || data.recent_payments.length === 0 ? (
            <p className="text-sm text-ink-500 py-6 text-center">No successful payment transactions recorded yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {data.recent_payments.map((payment) => (
                <li key={payment.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-xs sm:text-sm text-ink-900 truncate">
                        ₦{(payment.amount_minor / 100).toLocaleString()}
                      </p>
                      <Badge tone="green">Success</Badge>
                    </div>
                    <p className="text-xs text-ink-500 truncate mt-0.5">
                      {payment.customer_email || 'Student purchase'} &middot; {payment.reference}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[11px] font-mono font-medium text-ink-600 uppercase">
                      {payment.channel || 'Paystack'}
                    </span>
                    {payment.created_at && (
                      <p className="text-[10px] text-ink-400 mt-1">{formatDate(payment.created_at)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Section 3: Recent Learning Resources */}
        <Card className="p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-ink-100">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-display font-bold text-ink-950">Recent Learning Resources</h2>
                <p className="text-xs text-ink-500">{metrics?.published_resources ?? 0} published files</p>
              </div>
            </div>
            <Link to="/admin/resources" className="text-xs font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1">
              View repository <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {!data?.recent_resources || data.recent_resources.length === 0 ? (
            <p className="text-sm text-ink-500 py-6 text-center">No learning materials have been uploaded yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {data.recent_resources.map((r) => (
                <li key={r.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-xs sm:text-sm text-ink-900 truncate">{r.title}</p>
                    <p className="text-xs text-ink-500 mt-0.5 truncate">{r.file_name} &middot; Added {formatDate(r.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge tone={r.is_published ? 'green' : 'neutral'}>
                      {r.is_published ? 'Published' : 'Draft'}
                    </Badge>
                    <Badge tone={r.preview_policy === 'public_sample' ? 'teal' : r.preview_policy === 'authenticated_only' ? 'amber' : 'neutral'}>
                      {r.preview_policy === 'public_sample' ? 'Sample' : r.preview_policy === 'authenticated_only' ? 'Auth' : 'Locked'}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Section 4: Recent Verification Submissions */}
        <Card className="p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-ink-100">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                <UserCheck className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-display font-bold text-ink-950">Student Verifications</h2>
                <p className="text-xs text-ink-500">{metrics?.pending_verifications ?? 0} awaiting review</p>
              </div>
            </div>
            <Link to="/admin/verification" className="text-xs font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1">
              Review queue <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {!data?.recent_submissions || data.recent_submissions.length === 0 ? (
            <p className="text-sm text-ink-500 py-6 text-center">No student verification submissions recorded.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {data.recent_submissions.map((s) => (
                <li key={s.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-xs sm:text-sm text-ink-900">
                      {s.matriculation_number || s.jamb_registration_number || `Student #${s.user_id}`}
                    </p>
                    <p className="text-xs text-ink-500 mt-0.5">Submitted {formatDate(s.created_at)}</p>
                  </div>
                  <Badge tone={s.status === 'approved' ? 'green' : s.status === 'pending' ? 'amber' : 'red'}>
                    {s.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Edit Admin Profile Modal */}
      {editProfileOpen && (
        <Dialog open onClose={() => setEditProfileOpen(false)} title="Edit Administrator Profile" size="md">
          <form onSubmit={handleSaveProfile} className="space-y-4">
            {profileError && <Alert tone="error">{profileError}</Alert>}
            {profileSuccess && <Alert tone="success">{profileSuccess}</Alert>}

            {/* Avatar Pick / Preview */}
            <div className="flex items-center gap-4 p-4 bg-ink-50 rounded-2xl border border-ink-100">
              <div className="relative group shrink-0">
                <div className="h-16 w-16 rounded-2xl overflow-hidden bg-teal-800 flex items-center justify-center text-white font-display text-xl font-bold ring-2 ring-teal-600/30">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <span>{editName.charAt(0).toUpperCase() || 'A'}</span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-bold text-ink-900">Administrator Avatar Photo</p>
                <p className="text-[11px] text-ink-500">Upload JPG, PNG, or WebP up to 5 MB.</p>
                <input
                  type="file"
                  ref={avatarInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => avatarInputRef.current?.click()}
                  leftIcon={<Camera className="h-3.5 w-3.5" />}
                >
                  Choose new image
                </Button>
              </div>
            </div>

            <Input
              label="Full Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
              placeholder="e.g. Wisdom David"
            />

            <Input
              label="Display Nickname (Optional)"
              value={editNickname}
              onChange={(e) => setEditNickname(e.target.value)}
              placeholder="e.g. wisdom_lead"
            />

            <div className="p-3 bg-ink-50 rounded-xl text-xs text-ink-500 space-y-1">
              <p>
                Signed in as: <strong className="text-ink-800">{profile?.email}</strong>
              </p>
              <p>
                Permissions: <strong className="text-teal-800">{profile?.isSuperuser ? 'Full Superuser Access' : 'Administrative Roles'}</strong>
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-ink-100">
              <Button type="button" variant="outline" onClick={() => setEditProfileOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={savingProfile}>
                Save Changes
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

function WorkspaceCard({
  title,
  description,
  icon: Icon,
  badge,
  link,
  actionLabel,
  tone,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge: string;
  link: string;
  actionLabel: string;
  tone: 'teal' | 'blue' | 'green' | 'amber' | 'neutral';
}) {
  const iconTones = {
    teal: 'bg-teal-50 text-teal-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    neutral: 'bg-ink-100 text-ink-700',
  }[tone];

  return (
    <Card className="p-5 flex flex-col justify-between hover:border-teal-300 hover:shadow-card transition-all group border border-ink-200/90">
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className={`h-10 w-10 rounded-xl inline-flex items-center justify-center shrink-0 ${iconTones}`}>
            <Icon className="h-5 w-5" />
          </div>
          <span className="text-[11px] font-semibold text-ink-500 bg-ink-50 px-2 py-0.5 rounded-full border border-ink-100">
            {badge}
          </span>
        </div>
        <h3 className="font-display font-bold text-sm text-ink-950 group-hover:text-teal-800 transition-colors">
          {title}
        </h3>
        <p className="mt-1.5 text-xs text-ink-600 leading-relaxed line-clamp-2">
          {description}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-ink-100 flex items-center justify-between">
        <Link
          to={link}
          className="text-xs font-bold text-teal-700 group-hover:text-teal-900 inline-flex items-center gap-1 transition-colors"
        >
          {actionLabel} <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </Card>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone,
  link,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'teal' | 'amber' | 'green' | 'blue' | 'neutral';
  link: string;
}) {
  const toneClasses = {
    teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    neutral: 'bg-ink-100 text-ink-700',
  }[tone];

  return (
    <Link to={link}>
      <Card className="p-4 h-full hover:border-teal-300 hover:shadow-pop transition-all group border border-ink-200/80">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-ink-500 truncate group-hover:text-ink-800 transition-colors">{title}</span>
          <div className={`h-8 w-8 rounded-lg inline-flex items-center justify-center shrink-0 ${toneClasses}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-3 font-display text-2xl font-bold text-ink-950 tracking-tight">{value}</p>
        {subtitle && <p className="mt-1 text-xs text-ink-500 truncate">{subtitle}</p>}
      </Card>
    </Link>
  );
}
