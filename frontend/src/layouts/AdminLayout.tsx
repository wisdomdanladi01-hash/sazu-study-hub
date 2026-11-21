import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  LayoutDashboard,
  GraduationCap,
  BookOpen,
  FileSpreadsheet,
  FileText,
  ListChecks,
  UserCheck,
  CreditCard,
  LogOut,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

const ADMIN_LINKS = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/academic', label: 'Academic Directory', icon: GraduationCap },
  { to: '/admin/courses', label: 'Course Offerings', icon: BookOpen },
  { to: '/admin/import', label: 'CSV Import', icon: FileSpreadsheet },
  { to: '/admin/resources', label: 'Learning Resources', icon: FileText },
  { to: '/admin/assessments', label: 'Practice Tests', icon: ListChecks },
  { to: '/admin/verification', label: 'Student Verification', icon: UserCheck },
  { to: '/admin/packages', label: 'Packages & Access', icon: CreditCard },
];

export function AdminLayout() {
  const { profile, isAuthenticated, isAdmin, isLoading, signOut } = useAuth();
  const navigate = useNavigate();

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

  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-ink-950 text-white border-b border-ink-800">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark />
            <span className="rounded-md bg-teal-500/20 text-teal-300 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">
              Admin Portal
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-ink-300 hover:text-white transition-colors"
            >
              Student portal <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <div className="h-4 w-px bg-ink-800 hidden sm:block" />
            <span className="text-xs text-ink-300 hidden md:inline truncate max-w-xs">
              {profile?.fullName} ({profile?.role ?? 'Admin'})
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="bg-transparent border-ink-700 text-ink-200 hover:text-white hover:bg-ink-800"
              leftIcon={<LogOut className="h-3.5 w-3.5" />}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Admin Sub-nav */}
      <div className="bg-white border-b border-ink-100 overflow-x-auto">
        <div className="container-page flex items-center gap-1 py-2">
          {ADMIN_LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 border border-teal-200'
                    : 'text-ink-600 hover:text-ink-950 hover:bg-ink-50'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 py-6 sm:py-8">
        <div className="container-page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
