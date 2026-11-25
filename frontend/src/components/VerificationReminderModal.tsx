import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { ShieldAlert, CheckCircle2, AlertCircle, Clock, ArrowRight } from 'lucide-react';

const REMINDER_KEY = 'sazu_verification_reminder_dismissed_until';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function VerificationReminderModal() {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Only target logged-in students who aren't administrators
    if (!profile || profile.isAdmin || profile.isSuperuser) {
      setOpen(false);
      return;
    }

    // Do not pop up if the student is already on the onboarding page
    if (location.pathname.startsWith('/onboarding')) {
      setOpen(false);
      return;
    }

    // Check if verification is needed (either email unverified or student status not approved/verified)
    const emailNeedsVerification = !profile.emailVerified;
    const isAcademicVerified = profile.verificationStatus === 'verified' || profile.verificationStatus === 'approved';
    const academicNeedsVerification = !isAcademicVerified;

    if (!emailNeedsVerification && !academicNeedsVerification) {
      setOpen(false);
      return;
    }

    // Check 24-hour dismissal cooldown in localStorage
    try {
      const dismissedUntil = localStorage.getItem(REMINDER_KEY);
      if (dismissedUntil && Date.now() < Number(dismissedUntil)) {
        return;
      }
    } catch {
      // Ignore localStorage read errors
    }

    // Pop up gently 2.5 seconds after page loads
    const timer = setTimeout(() => {
      setOpen(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, [profile, location.pathname]);

  const handleDismiss = () => {
    try {
      localStorage.setItem(REMINDER_KEY, String(Date.now() + DISMISS_DURATION_MS));
    } catch {
      // Ignore localStorage write errors
    }
    setOpen(false);
  };

  const handleProceed = () => {
    handleDismiss();
    navigate('/onboarding');
  };

  if (!open || !profile) return null;

  const emailOk = Boolean(profile.emailVerified);
  const academicVerified = profile.verificationStatus === 'verified' || profile.verificationStatus === 'approved';
  const academicStatus = profile.verificationStatus || 'not_submitted';

  return (
    <Dialog
      open={open}
      onClose={handleDismiss}
      size="md"
      title="Complete Your Student Verification"
      description="Verify your email and student status to unlock university study materials, take practice tests, and qualify for student rates."
      footer={
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
          <Button variant="ghost" size="sm" onClick={handleDismiss} className="w-full sm:w-auto">
            Remind me later
          </Button>
          <Button
            size="sm"
            onClick={handleProceed}
            rightIcon={<ArrowRight className="h-4 w-4" />}
            className="w-full sm:w-auto"
          >
            Complete verification
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-bold">Access is currently restricted:</span> Unverified accounts cannot view protected
            lecture materials or official course offerings. Complete both steps below to activate full student privileges.
          </div>
        </div>

        <div className="space-y-2.5">
          {/* Step 1: Email */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-ink-100 bg-ink-50/50">
            <div className="flex items-center gap-2.5">
              {emailOk ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
              )}
              <div>
                <p className="text-xs font-bold text-ink-900">1. Email Address Confirmation</p>
                <p className="text-[11px] text-ink-500">{profile.email}</p>
              </div>
            </div>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${emailOk
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
            >
              {emailOk ? 'Confirmed ✓' : 'Code Needed'}
            </span>
          </div>

          {/* Step 2: Student Academic Identity */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-ink-100 bg-ink-50/50">
            <div className="flex items-center gap-2.5">
              {academicVerified ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : academicStatus === 'pending' ? (
                <Clock className="h-4 w-4 text-sky-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
              )}
              <div>
                <p className="text-xs font-bold text-ink-900">2. Student Matriculation &amp; Programme</p>
                <p className="text-[11px] text-ink-500">Department, Faculty &amp; Academic Level</p>
              </div>
            </div>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${academicVerified
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : academicStatus === 'pending'
                  ? 'bg-sky-50 text-sky-700 border border-sky-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
            >
              {academicVerified
                ? 'Verified ✓'
                : academicStatus === 'pending'
                  ? 'In Review ⏳'
                  : 'Not Submitted'}
            </span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
