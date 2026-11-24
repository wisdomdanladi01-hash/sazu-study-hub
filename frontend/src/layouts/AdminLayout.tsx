import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  LayoutDashboard,
  LogOut,
  ExternalLink,
  ShieldAlert,
  ArrowLeft,
  ChevronRight,
  Shield,
} from 'lucide-react';

const SUBPAGE_NAMES: Record<string, string> = {
  '/admin/academic': 'Academic Directory',
  '/admin/courses': 'Course Offerings & Coverage',
  '/admin/import': 'Bulk CSV Import',
  '/admin/resources': 'Learning Resources',
  '/admin/assessments': 'Practice Tests',
  '/admin/verification': 'Student Verification Queue',
  '/admin/packages': 'Packages & Pricing',
  '/admin/users': 'Administrator Authorities',
};

export function AdminLayout() {
  const { profile, isAuthenticated, isAdmin, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <p className="text-sm font-semibold text-ink-600">Verifying administrator authorization…</p>
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50 p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-700">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="font-display text-2xl font-bold text-ink-950">Administrator Access Required</h1>
          <p className="mt-2 text-sm text-ink-600">
            This area is restricted to authorized platform administrators. Ordinary student accounts cannot access administrative functions.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <Link to="/login?redirect=%2Fadmin">
              <Button fullWidth size="lg">Sign in as Administrator</Button>
            </Link>
            <Link to="/dashboard">
              <Button fullWidth variant="outline">Return to Student Dashboard</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const handleSignOut = () => {
    signOut();
    navigate('/');
  };

  const isRootDashboard = location.pathname === '/admin' || location.pathname === '/admin/';
  const currentSubPageName = SUBPAGE_NAMES[location.pathname] || 'Workspace';

  return (
    <div className="min-h-screen bg-ink-50/70 flex flex-col">
      {/* Simple, Professional, Clean Header */}
      <header className="sticky top-0 z-40 bg-ink-950 text-white border-b border-ink-800 shadow-sm">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          {/* Left: Brand + Breadcrumb */}
          <div className="flex items-center gap-3">
            <BrandMark />
            <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-teal-500/20 text-teal-300 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">
              <Shield className="h-3 w-3" />
              Admin
            </span>

            {!isRootDashboard && (
              <div className="flex items-center gap-2 pl-2 border-l border-ink-800 text-xs">
                <Link
                  to="/admin"
                  className="text-ink-400 hover:text-white transition-colors flex items-center gap-1 font-medium"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Dashboard</span>
                </Link>
                <ChevronRight className="h-3.5 w-3.5 text-ink-600" />
                <span className="text-teal-300 font-semibold truncate max-w-[180px] sm:max-w-xs">
                  {currentSubPageName}
                </span>
              </div>
            )}
          </div>

          {/* Right: User Profile + Quick Actions */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              to="/admin"
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${isRootDashboard
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                  : 'text-ink-300 hover:text-white hover:bg-ink-800'
                }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Overview Dashboard</span>
            </Link>

            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 text-xs font-medium text-ink-300 hover:text-white transition-colors"
              title="Switch to Student View"
            >
              <span className="hidden md:inline">Student View</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>

            <div className="h-4 w-px bg-ink-800" />

            {/* Profile Pill */}
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-teal-800 text-white font-bold flex items-center justify-center text-xs overflow-hidden shrink-0">
                {profile?.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={profile.fullName} className="h-full w-full object-cover" />
                ) : (
                  profile?.fullName?.charAt(0).toUpperCase() || 'A'
                )}
              </div>
              <span className="text-xs text-ink-200 hidden lg:inline font-medium truncate max-w-[140px]">
                {profile?.fullName}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="bg-transparent border-ink-800 text-ink-300 hover:text-white hover:bg-ink-800 text-xs px-2.5"
              leftIcon={<LogOut className="h-3.5 w-3.5" />}
            >
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-6 sm:py-8">
        <div className="container-page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
