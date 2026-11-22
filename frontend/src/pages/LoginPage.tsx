import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { AuthShell } from '@/components/AuthShell';
import { Eye, EyeOff, Mail, Lock, ArrowLeft, KeyRound, Sparkles } from 'lucide-react';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.ok) {
      if (redirect) {
        navigate(decodeURIComponent(redirect), { replace: true });
      } else if (result.profile?.isAdmin) {
        navigate('/admin', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } else {
      setError(result.error ?? 'Unable to sign in. Please verify your credentials.');
    }
  };

  return (
    <AuthShell>
      <div className="w-full">
        <Link
          to={redirect ? decodeURIComponent(redirect) : '/'}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-ink-500 hover:text-teal-700 transition-colors mb-4 sm:mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back to platform
        </Link>

        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200/60 text-teal-800 text-xs font-semibold mb-3">
            <Sparkles className="h-3 w-3 text-teal-600" />
            <span>SAZU Student Portal</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink-950 tracking-tight">
            Welcome back
          </h1>
          <p className="mt-2 text-sm sm:text-base leading-relaxed text-ink-600">
            Sign in to access your course materials, past questions, and practice assessments.
          </p>
        </div>

        {error && (
          <Alert tone="error" className="mb-6">
            <p className="text-sm font-medium leading-normal">{error}</p>
          </Alert>
        )}

        <form onSubmit={submit} className="space-y-5" noValidate>
          <div>
            <label className="block text-sm font-semibold text-ink-800 mb-1.5">
              Email Address
            </label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. yourname@sazu.edu.ng"
              leftIcon={<Mail className="h-4 w-4 text-ink-400" />}
              className="text-base sm:text-sm"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-semibold text-ink-800">
                Password
              </label>
            </div>
            <Input
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              leftIcon={<Lock className="h-4 w-4 text-ink-400" />}
              className="text-base sm:text-sm"
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="h-10 w-10 inline-flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors focus:outline-none"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              required
            />
          </div>

          <div className="flex items-center justify-between text-xs text-ink-500 py-1">
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-ink-400" />
              <span>Need help? Contact support or department representative.</span>
            </span>
          </div>

          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={loading}
            className="h-12 text-base font-semibold shadow-md active:scale-[0.99] transition-transform"
          >
            Sign in to Study Hub
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-ink-100 text-center">
          <p className="text-sm text-ink-600">
            Don't have an account yet?{' '}
            <Link
              to={redirect ? `/register?redirect=${redirect}` : '/register'}
              className="font-bold text-teal-700 hover:text-teal-800 underline underline-offset-2 ml-1"
            >
              Create student account
            </Link>
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
