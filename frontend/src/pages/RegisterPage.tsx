import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { AuthShell } from '@/components/AuthShell';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  ArrowLeft,
  Check,
  X,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface PwRule {
  label: string;
  test: (pw: string) => boolean;
}

const pwRules: PwRule[] = [
  { label: 'At least 12 characters long', test: (p) => p.length >= 12 },
];

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect');

  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agree, setAgree] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pwScore = useMemo(() => pwRules.filter((r) => r.test(password)).length, [password]);
  const confirmError = confirm.length > 0 && confirm !== password ? 'Passwords do not match.' : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !surname.trim()) {
      return setError('Please enter your first name and surname.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setError('Please enter a valid email address.');
    }
    if (pwScore < pwRules.length) {
      return setError('Please choose a password with at least 12 characters.');
    }
    if (confirm !== password) {
      return setError('Passwords do not match.');
    }
    if (!agree) {
      return setError('Please review and accept the Terms of Service to continue.');
    }

    setLoading(true);
    const result = await register({
      firstName: firstName.trim(),
      surname: surname.trim(),
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (result.ok) {
      navigate(redirect ? `/onboarding?redirect=${encodeURIComponent(redirect)}` : '/onboarding', { replace: true });
    } else {
      setError(result.error ?? 'Unable to create account. Please check your information and try again.');
    }
  };

  return (
    <AuthShell>
      <div className="w-full">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-ink-500 hover:text-teal-700 transition-colors mb-4 sm:mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back to platform
        </Link>

        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200/60 text-teal-800 text-xs font-semibold mb-3">
            <Sparkles className="h-3 w-3 text-teal-600" />
            <span>Step 1: Student Account Creation</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink-950 tracking-tight">
            Create your account
          </h1>
          <p className="mt-2 text-sm sm:text-base leading-relaxed text-ink-600">
            Sign up to access course handouts, past exams, and interactive assessments tailored to your SAZU faculty.
          </p>
        </div>

        {error && (
          <Alert tone="error" className="mb-6">
            <p className="text-sm font-medium leading-normal">{error}</p>
          </Alert>
        )}

        <form onSubmit={submit} className="space-y-4 sm:space-y-5">
          {/* Section 1: Personal Details */}
          <div className="p-4 sm:p-5 rounded-2xl bg-ink-50/70 border border-ink-100">
            <h2 className="text-xs font-bold uppercase tracking-wider text-teal-800 mb-3.5 flex items-center gap-2">
              <User className="h-4 w-4 text-teal-600" />
              <span>Full Name</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1.5">
                  First Name <span className="text-red-500">*</span>
                </label>
                <Input
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Fatima"
                  className="text-base sm:text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1.5">
                  Surname <span className="text-red-500">*</span>
                </label>
                <Input
                  autoComplete="family-name"
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  placeholder="e.g. Ibrahim"
                  className="text-base sm:text-sm"
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 2: Account Credentials */}
          <div className="p-4 sm:p-5 rounded-2xl bg-ink-50/70 border border-ink-100">
            <h2 className="text-xs font-bold uppercase tracking-wider text-teal-800 mb-3.5 flex items-center gap-2">
              <Lock className="h-4 w-4 text-teal-600" />
              <span>Login Credentials</span>
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. yourname@gmail.com"
                  leftIcon={<Mail className="h-4 w-4 text-ink-400" />}
                  className="text-base sm:text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1.5">
                  Password <span className="text-red-500">*</span>
                </label>
                <Input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 12 characters"
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
                {password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {pwRules.map((r) => {
                      const ok = r.test(password);
                      return (
                        <p
                          key={r.label}
                          className={`flex items-center gap-1.5 text-xs ${ok ? 'text-teal-700 font-semibold' : 'text-ink-500'
                            }`}
                        >
                          {ok ? (
                            <Check className="h-3.5 w-3.5 text-teal-600" />
                          ) : (
                            <X className="h-3.5 w-3.5 text-ink-400" />
                          )}
                          <span>{r.label}</span>
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1.5">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <Input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter your password"
                  leftIcon={<Lock className="h-4 w-4 text-ink-400" />}
                  className="text-base sm:text-sm"
                  error={confirmError}
                  required
                />
              </div>
            </div>
          </div>

          <div className="p-1">
            <label className="flex items-start gap-3 text-xs sm:text-sm text-ink-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-ink-300 text-teal-600 focus:ring-teal-500 shrink-0"
              />
              <span className="leading-relaxed">
                I agree to the{' '}
                <Link to="/terms" className="font-semibold text-teal-700 hover:underline">
                  Terms of Service
                </Link>{' '}
                and accept the account creation conditions of SAZU Study Hub.
              </span>
            </label>
          </div>

          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={loading}
            className="h-12 text-base font-semibold shadow-md active:scale-[0.99] transition-transform"
          >
            Create Account & Continue
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-ink-100 text-center">
          <p className="text-sm text-ink-600">
            Already registered?{' '}
            <Link
              to={redirect ? `/login?redirect=${redirect}` : '/login'}
              className="font-bold text-teal-700 hover:text-teal-800 underline underline-offset-2 ml-1"
            >
              Sign in to your account
            </Link>
          </p>
        </div>

        <div className="mt-4 text-center">
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
            <span>Next steps: Email confirmation & student status verification.</span>
          </span>
        </div>
      </div>
    </AuthShell>
  );
}
