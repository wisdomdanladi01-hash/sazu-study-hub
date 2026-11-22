import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AcademicProfile, StudentProfile } from '@/types';
import { apiRequest, getAccessToken, setAccessToken } from '@/services/api';
import { offlineStore } from '@/services/offline';

interface ApiUser {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  email_verified?: boolean;
  is_admin?: boolean;
  role?: string;
  permissions?: string[];
  is_superuser?: boolean;
}

interface ApiDashboard {
  academic_profile: {
    programme_id: number | null;
    department_id: number | null;
    verified_level_id: number | null;
    verified_session_id: number | null;
  } | null;
  subscription: {
    status: string;
    is_active: boolean;
    ends_at: string;
  } | null;
}

interface AuthState {
  profile: StudentProfile | null;
  token: string | null;
  isLoading: boolean;
  authError: string | null;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (input: {
    firstName: string;
    middleName?: string;
    surname: string;
    email: string;
    password: string;
    matriculationNumber?: string;
    jambRegistrationNumber?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<StudentProfile, 'fullName' | 'email'>>) => Promise<void>;
  sendEmailVerificationCode: () => Promise<{ ok: boolean; error?: string; devCode?: string }>;
  verifyEmailCode: (code: string) => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapProfile(user: ApiUser, dashboard: ApiDashboard): StudentProfile {
  const academic = dashboard.academic_profile;
  const subscription = dashboard.subscription;
  return {
    id: String(user.id),
    fullName: user.full_name,
    email: user.email,
    createdAt: '',
    academic: {
      institutionId: 'sazu',
      facultyId: null,
      departmentId: academic?.department_id ? String(academic.department_id) : null,
      programmeId: academic?.programme_id ? String(academic.programme_id) : null,
      level: academic?.verified_level_id ? String(academic.verified_level_id) as AcademicProfile['level'] : null,
      semester: null,
    },
    hasSubscription: Boolean(subscription?.is_active),
    subscriptionExpiresAt: subscription?.is_active ? subscription.ends_at : null,
    isAdmin: Boolean(user.is_admin || user.is_superuser),
    role: user.role,
    permissions: user.permissions || [],
    isSuperuser: Boolean(user.is_superuser),
    emailVerified: Boolean(user.email_verified),
  };
}

async function fetchProfile(token: string): Promise<StudentProfile> {
  const [user, dashboard] = await Promise.all([
    apiRequest<ApiUser>('/auth/me', {}, token),
    apiRequest<ApiDashboard>('/dashboard', {}, token),
  ]);
  return mapProfile(user, dashboard);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    profile: null,
    token: null,
    isLoading: true,
    authError: null,
  });

  const refreshProfile = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setState({ profile: null, token: null, isLoading: false, authError: null });
      return;
    }

    setState((current) => ({ ...current, token, isLoading: true, authError: null }));
    try {
      const profile = await fetchProfile(token);
      setState({ profile, token, isLoading: false, authError: null });
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 401) {
        setAccessToken(null);
        setState({ profile: null, token: null, isLoading: false, authError: null });
        return;
      }
      setState((current) => ({
        ...current,
        token,
        isLoading: false,
        authError: error instanceof Error ? error.message : 'Unable to load your account.',
      }));
    }
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const result = await apiRequest<{ access_token: string }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password }) },
        null,
      );
      setAccessToken(result.access_token);
      const profile = await fetchProfile(result.access_token);
      setState({ profile, token: result.access_token, isLoading: false, authError: null });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unable to sign in.' };
    }
  }, []);

  const register = useCallback(async (input: {
    firstName: string;
    middleName?: string;
    surname: string;
    email: string;
    password: string;
    matriculationNumber?: string;
    jambRegistrationNumber?: string;
  }) => {
    try {
      const result = await apiRequest<{ access_token: string }>(
        '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            first_name: input.firstName,
            middle_name: input.middleName || undefined,
            surname: input.surname,
            email: input.email,
            password: input.password,
            matriculation_number: input.matriculationNumber || undefined,
            jamb_registration_number: input.jambRegistrationNumber || undefined,
          }),
        },
        null,
      );
      setAccessToken(result.access_token);
      const profile = await fetchProfile(result.access_token);
      setState({ profile, token: result.access_token, isLoading: false, authError: null });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unable to create your account.' };
    }
  }, []);

  const signOut = useCallback(() => {
    setAccessToken(null);
    // Shared devices must not keep the previous student's offline copies.
    void offlineStore.purgeAll().catch(() => undefined);
    setState({ profile: null, token: null, isLoading: false, authError: null });
  }, []);

  const updateProfile = useCallback(async (patch: Partial<Pick<StudentProfile, 'fullName' | 'email'>>) => {
    if (!state.token || !state.profile) throw new Error('Sign in before updating your profile.');
    const updated = await apiRequest<ApiUser>(
      '/auth/me',
      {
        method: 'PATCH',
        body: JSON.stringify({
          email: patch.email ?? state.profile.email,
          full_name: patch.fullName ?? state.profile.fullName,
        }),
      },
      state.token,
    );
    setState((current) => ({
      ...current,
      profile: current.profile
        ? {
            ...current.profile,
            email: updated.email,
            fullName: updated.full_name,
            isAdmin: Boolean(updated.is_admin),
            role: updated.role,
            emailVerified: Boolean(updated.email_verified),
          }
        : current.profile,
    }));
  }, [state.profile, state.token]);

  const sendEmailVerificationCode = useCallback(async () => {
    try {
      const res = await apiRequest<{ message: string; dev_code?: string }>('/auth/email/send-code', {
        method: 'POST',
      });
      return { ok: true, devCode: res.dev_code };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unable to send verification code.' };
    }
  }, []);

  const verifyEmailCode = useCallback(async (code: string) => {
    try {
      await apiRequest<ApiUser>('/auth/email/verify', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
      });
      await refreshProfile();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Invalid verification code.' };
    }
  }, [refreshProfile]);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    isAuthenticated: Boolean(state.token && state.profile),
    isAdmin: Boolean(state.profile?.isAdmin),
    signIn,
    register,
    signOut,
    refreshProfile,
    updateProfile,
    sendEmailVerificationCode,
    verifyEmailCode,
  }), [state, signIn, register, signOut, refreshProfile, updateProfile, sendEmailVerificationCode, verifyEmailCode]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}

export function describeAcademic(profile: StudentProfile | null): string {
  if (!profile) return 'Not signed in';
  const academic = profile.academic;
  return academic.departmentId
    ? `Department ID ${academic.departmentId}`
    : 'Academic profile not yet submitted';
}
