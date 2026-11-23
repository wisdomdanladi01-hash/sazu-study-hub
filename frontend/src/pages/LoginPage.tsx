import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Dialog } from '@/components/ui/Dialog';
import { AuthShell } from '@/components/AuthShell';
import { apiRequest } from '@/services/api';
import { Eye, EyeOff, Mail, Lock, ArrowLeft, KeyRound, Sparkles, CheckCircle2, Send } from 'lucide-react';

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

  // Forgot password state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);

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

  const handleSendResetCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setForgotError('Please enter your email address.');
      return;
    }
    setForgotLoading(true);
    setForgotError(null);
    try {
      const res = await apiRequest<{ message: string }>('/auth/password/forgot', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail.trim() }),
      }, null);
      setForgotSuccess(res.message);
      setForgotStep(2);
    } catch (cause) {
      setForgotError(cause instanceof Error ? cause.message : 'Unable to send password reset code.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    if (!forgotCode.trim()) {
      setForgotError('Please enter the 6-digit code received in your email.');
      return;
    }
    if (newPassword.length < 12) {
      setForgotError('New password must be at least 12 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setForgotError('Passwords do not match.');
      return;
    }
    setForgotLoading(true);
    try {
      const res = await apiRequest<{ message: string }>('/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({
          email: forgotEmail.trim(),
          code: forgotCode.trim(),
          new_password: newPassword,
        }),
      }, null);
      setForgotSuccess(res.message);
      setEmail(forgotEmail.trim());
      setPassword('');
      setTimeout(() => {
        setForgotOpen(false);
        setForgotStep(1);
        setForgotSuccess(null);
        setForgotCode('');
        setNewPassword('');
        setConfirmPassword('');
      }, 2500);
    } catch (cause) {
      setForgotError(cause instanceof Error ? cause.message : 'Unable to reset password.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="w-full max-w-md mx-auto">
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-teal-700 transition-colors mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Home</span>
          </Link>

          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink-950 tracking-tight">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-ink-600">
            Sign in to access your course materials, lecture handouts, and practice assessments.
          </p>
        </div>

        {error && (
          <Alert tone="error" className="mb-5">
            {error}
          </Alert>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block mb-1.5 text-sm font-semibold text-ink-800">
              Email address
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
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email.trim());
                  setForgotError(null);
                  setForgotSuccess(null);
                  setForgotStep(1);
                  setForgotOpen(true);
                }}
                className="text-xs font-semibold text-teal-700 hover:text-teal-800 hover:underline"
              >
                Forgot password?
              </button>
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

      {/* Forgot / Reset Password Dialog */}
      <Dialog
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title={forgotStep === 1 ? 'Reset your password' : 'Enter reset code'}
        description={
          forgotStep === 1
            ? 'Enter your registered email address and we will dispatch a 6-digit password reset code.'
            : `A 6-digit code has been sent to ${forgotEmail}. Enter the code and your new password below.`
        }
      >
        <div className="p-4 sm:p-5 space-y-4">
          {forgotError && <Alert tone="error">{forgotError}</Alert>}
          {forgotSuccess && <Alert tone="success">{forgotSuccess}</Alert>}

          {forgotStep === 1 ? (
            <form onSubmit={handleSendResetCode} className="space-y-4">
              <Input
                label="Registered email address"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="e.g. student@sazu.edu.ng"
                leftIcon={<Mail className="h-4 w-4" />}
                required
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setForgotOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={forgotLoading} leftIcon={<Send className="h-4 w-4" />}>
                  Send 6-digit Code
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <Input
                label="6-Digit Reset Code"
                value={forgotCode}
                onChange={(e) => setForgotCode(e.target.value)}
                placeholder="e.g. 123456"
                maxLength={10}
                className="font-mono text-center tracking-widest text-lg"
                required
              />
              <Input
                label="New Password (min 12 characters)"
                type={showNewPw ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter strong new password"
                leftIcon={<Lock className="h-4 w-4" />}
                required
                minLength={12}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowNewPw((v) => !v)}
                    className="h-10 w-10 inline-flex items-center justify-center text-ink-400 hover:text-ink-700"
                  >
                    {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
              <Input
                label="Confirm New Password"
                type={showNewPw ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                leftIcon={<Lock className="h-4 w-4" />}
                required
                minLength={12}
              />
              <div className="flex items-center justify-between gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setForgotStep(1)}
                  disabled={forgotLoading}
                >
                  Resend Code
                </Button>
                <Button
                  type="submit"
                  loading={forgotLoading}
                  leftIcon={<CheckCircle2 className="h-4 w-4" />}
                >
                  Set New Password
                </Button>
              </div>
            </form>
          )}
        </div>
      </Dialog>
    </AuthShell>
  );
}
