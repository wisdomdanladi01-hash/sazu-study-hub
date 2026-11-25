import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: string | number;
            },
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

interface GoogleLoginButtonProps {
  mode?: 'signin' | 'signup';
  redirectUrl?: string | null;
  onSuccess?: () => void;
  onError?: (msg: string) => void;
}

export function GoogleLoginButton({
  mode = 'signin',
  redirectUrl,
  onSuccess,
  onError,
}: GoogleLoginButtonProps) {
  const { signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  const handleCredentialResponse = async (credential: string) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await signInWithGoogle(credential);
      if (res.ok) {
        if (onSuccess) onSuccess();
        if (redirectUrl) {
          navigate(decodeURIComponent(redirectUrl), { replace: true });
        } else if (res.profile?.isAdmin) {
          navigate('/admin', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      } else {
        const err = res.error || 'Google authentication failed.';
        setErrorMsg(err);
        if (onError) onError(err);
      }
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'Google authentication failed.';
      setErrorMsg(errText);
      if (onError) onError(errText);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!clientId) return;

    // Load Google Identity Services script if not already loaded
    if (!window.google?.accounts?.id) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        initGoogle();
      };
      document.body.appendChild(script);
    } else {
      initGoogle();
    }

    function initGoogle() {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => {
          if (resp?.credential) {
            handleCredentialResponse(resp.credential);
          }
        },
      });

      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        text: mode === 'signup' ? 'signup_with' : 'continue_with',
        shape: 'pill',
        width: 320,
      });
    }
  }, [clientId, mode]);

  // Demo fallback when VITE_GOOGLE_CLIENT_ID is not configured in local environment
  const handleDemoSignIn = async () => {
    const demoEmail = prompt(
      'Google OAuth Sandbox:\nEnter your Google Gmail address to simulate Google sign-in/up:',
      'student@gmail.com',
    );
    if (!demoEmail) return;
    const cleanUser = demoEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    const mockToken = `mock_google_${cleanUser}`;
    await handleCredentialResponse(mockToken);
  };

  return (
    <div className="w-full space-y-2">
      {errorMsg && <Alert tone="error" className="text-xs">{errorMsg}</Alert>}

      {clientId ? (
        <div className="flex justify-center w-full min-h-[44px]">
          <div ref={googleBtnRef} />
        </div>
      ) : (
        <button
          type="button"
          onClick={handleDemoSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 text-ink-800 text-sm font-semibold shadow-2xs hover:border-ink-300 transition-all active:scale-[0.99]"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{loading ? 'Connecting Google…' : mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}</span>
        </button>
      )}
    </div>
  );
}
