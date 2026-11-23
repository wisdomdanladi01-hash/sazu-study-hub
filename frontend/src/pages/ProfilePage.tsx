import { useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Dialog } from '@/components/ui/Dialog';
import {
  User,
  GraduationCap,
  Settings,
  CreditCard,
  LogOut,
  Check,
  Mail,
  ShieldCheck,
  ArrowRight,
  Camera,
  Clock,
  Sparkles,
} from 'lucide-react';
import { formatDate } from '@/utils/format';

export function ProfilePage() {
  const { profile, updateProfile, uploadAvatar, signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(profile?.fullName ?? '');
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatarUrl ?? null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);

  if (!profile) {
    return (
      <div className="container-page py-16 max-w-md">
        <Alert tone="info" title="Sign in to view your profile">
          <p className="text-sm">Profile and settings are available after you sign in.</p>
        </Alert>
        <div className="mt-4">
          <Link to="/login">
            <Button>Sign in</Button>
          </Link>
        </div>
      </div>
    );
  }

  const canEdit = profile.isSuperuser || (profile.canEditProfileNow ?? true);

  const handleAvatarFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPEG, PNG, or WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Profile image must not exceed 5 MB.');
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setError(null);
  };

  const saveAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit) {
      setError('Profiles can only be edited once every 7 days.');
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      if (avatarFile) {
        const uploadRes = await uploadAvatar(avatarFile);
        if (!uploadRes.ok) {
          throw new Error(uploadRes.error || 'Failed to upload profile picture.');
        }
      }

      await updateProfile({
        fullName: name.trim(),
        nickname: nickname.trim() || undefined,
        avatarUrl: avatarPreview || undefined,
      });

      setAvatarFile(null);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save account changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-page py-8 sm:py-10 max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-950">Profile &amp; settings</h1>
        <p className="mt-1.5 text-sm text-ink-600">
          Manage your personal details, student identity, and account preferences.
        </p>
      </div>

      {saved && (
        <Alert tone="success" className="mb-5">
          <p className="text-sm inline-flex items-center gap-1.5">
            <Check className="h-4 w-4" /> Account changes saved successfully.
          </p>
        </Alert>
      )}

      {error && <Alert tone="error" className="mb-5">{error}</Alert>}

      {/* 7-Day Cooldown Notification Banner */}
      {!canEdit && (
        <Alert tone="warning" className="mb-5">
          <div className="flex items-start gap-2.5">
            <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">Weekly Profile Cooldown Active</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Students are permitted to update their profile once every 7 days. Your next update will be available on{' '}
                <span className="font-semibold">{profile.nextProfileEditAt ? formatDate(profile.nextProfileEditAt) : 'next week'}</span>.
              </p>
            </div>
          </div>
        </Alert>
      )}

      {canEdit && !profile.isSuperuser && (
        <div className="mb-5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold">
          <Clock className="h-3.5 w-3.5 text-teal-600" />
          <span>Profile edits are limited to once per 7-day period. Saving changes now will set your cooldown.</span>
        </div>
      )}

      <Card className="p-5 sm:p-6 mb-5">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-ink-100">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-teal-600" />
            <h2 className="font-display font-bold text-ink-950">Account Information</h2>
          </div>
          <Badge tone={canEdit ? 'teal' : 'amber'}>
            {canEdit ? 'Editable' : 'Cooldown Active'}
          </Badge>
        </div>

        <form onSubmit={saveAccount} className="space-y-5">
          {/* Avatar and Nickname Section */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 p-4 rounded-2xl bg-ink-50/70 border border-ink-100">
            <div className="relative group shrink-0">
              <div className="h-20 w-20 rounded-2xl overflow-hidden bg-ink-200 border-2 border-white shadow-sm flex items-center justify-center text-ink-600 font-display font-bold text-2xl">
                {avatarPreview ? (
                  <img src={avatarPreview} alt={name || 'Avatar'} className="h-full w-full object-cover" />
                ) : (
                  <span>{(nickname || name || 'U').charAt(0).toUpperCase()}</span>
                )}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute -bottom-1.5 -right-1.5 p-1.5 rounded-full bg-teal-600 text-white shadow-md hover:bg-teal-700 transition"
                  title="Upload profile picture"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex-1 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-700">Profile Picture &amp; Nickname</span>
                {avatarPreview && canEdit && (
                  <button
                    type="button"
                    onClick={() => { setAvatarPreview(null); setAvatarFile(null); }}
                    className="text-[11px] text-red-600 hover:underline"
                  >
                    Remove picture
                  </button>
                )}
              </div>
              <p className="text-xs text-ink-500">
                Upload a clear avatar photograph or avatar graphic (PNG, JPG, WebP up to 5MB).
              </p>
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => avatarInputRef.current?.click()}
                  leftIcon={<Camera className="h-3.5 w-3.5" />}
                  className="mt-1"
                >
                  Choose Picture
                </Button>
              )}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Full name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              leftIcon={<User className="h-4 w-4" />}
              required
              minLength={2}
              disabled={!canEdit}
            />
            <Input
              label="Nickname / Handle"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="e.g. Emma, Dan, Zee"
              leftIcon={<Sparkles className="h-4 w-4" />}
              disabled={!canEdit}
            />
          </div>

          <div className="w-full">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-semibold text-ink-800">Email address</label>
              {profile.emailVerified ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Verified
                </span>
              ) : (
                <Link
                  to="/onboarding"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 hover:bg-amber-100 transition"
                >
                  <span>Unverified &bull; Click to verify</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
            <Input
              type="email"
              value={profile.email}
              disabled
              leftIcon={<Mail className="h-4 w-4" />}
              hint={
                profile.emailVerified
                  ? "Your email is verified. Official notifications and security alerts are sent here."
                  : "Please verify your email address to enable password resets and security notices."
              }
            />
          </div>

          <Button
            type="submit"
            loading={saving}
            disabled={!canEdit}
            leftIcon={<Check className="h-4 w-4" />}
          >
            {canEdit ? 'Save profile changes' : 'Edit locked (Cooldown)'}
          </Button>
        </form>
      </Card>

      <Card className="p-5 sm:p-6 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <GraduationCap className="h-5 w-5 text-teal-600" />
          <h2 className="font-display font-bold text-ink-950">Academic Profile &amp; Verification</h2>
        </div>
        <p className="text-sm text-ink-600">
          Academic details are submitted to the student verification process and reviewed by an administrator.
        </p>
        <Link to="/onboarding">
          <Button className="mt-4" variant="outline">
            Submit or update academic details
          </Button>
        </Link>
      </Card>

      <Card className="p-5 sm:p-6 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="h-5 w-5 text-teal-600" />
          <h2 className="font-display font-bold text-ink-950">Subscription</h2>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-ink-700">
              {profile.hasSubscription ? 'Your semester subscription is active.' : 'No active subscription.'}
            </p>
            {profile.subscriptionExpiresAt && (
              <p className="mt-1 text-xs text-ink-500">
                Active until {formatDate(profile.subscriptionExpiresAt)}
              </p>
            )}
          </div>
          <Badge tone={profile.hasSubscription ? 'green' : 'amber'}>
            {profile.hasSubscription ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {!profile.hasSubscription && (
            <Link to="/pricing">
              <Button size="sm" leftIcon={<CreditCard className="h-4 w-4" />}>
                View packages
              </Button>
            </Link>
          )}
          <Link to="/payments">
            <Button size="sm" variant="ghost">
              Payment history
            </Button>
          </Link>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-5 w-5 text-teal-600" />
          <h2 className="font-display font-bold text-ink-950">Account Settings</h2>
        </div>
        <div className="space-y-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50"
          >
            <span>Go to dashboard</span>
            <ArrowRight className="h-4 w-4 text-ink-400" />
          </button>
          <button
            onClick={() => setLogoutOpen(true)}
            className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            <span className="inline-flex items-center gap-2">
              <LogOut className="h-4 w-4" /> Sign out
            </span>
          </button>
        </div>
      </Card>

      <p className="mt-5 text-xs text-ink-400 inline-flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" /> Account access is protected by the Study Hub API.
      </p>

      <Dialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="Sign out?"
        description="Are you sure you want to sign out of your Study Hub account?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setLogoutOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={signOut}
            >
              Sign out
            </Button>
          </div>
        }
      />
    </div>
  );
}
