import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { catalogService } from '@/services/catalog';
import { apiRequest } from '@/services/api';
import type { AcademicCatalogue } from '@/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import {
  Mail,
  GraduationCap,
  ArrowRight,
  CheckCircle2,
  SkipForward,
  ShieldCheck,
  Send,
  Upload,
  Clock,
  IdCard,
} from 'lucide-react';

interface StudentAcademicData {
  academic_profile: {
    jamb_registration_number: string | null;
    matriculation_number: string | null;
    programme_id: number | null;
    department_id: number | null;
    admission_session_id: number | null;
    verified_level_id: number | null;
    verified_session_id: number | null;
  } | null;
}

export function OnboardingPage() {
  const { profile, refreshProfile, sendEmailVerificationCode, verifyEmailCode } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect');

  // Step state: 1 = Email, 2 = Student Status
  const [step, setStep] = useState<1 | 2>(1);

  // Email verification state
  const [emailCode, setEmailCode] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Student status verification state
  const [catalogue, setCatalogue] = useState<AcademicCatalogue | null>(null);
  const [matricNumber, setMatricNumber] = useState('');
  const [jambNumber, setJambNumber] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programmeId, setProgrammeId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [submittingStatus, setSubmittingStatus] = useState(false);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Check email verified on mount
  useEffect(() => {
    if (profile?.emailVerified) {
      setStep(2);
    }
  }, [profile?.emailVerified]);

  // Load catalogue data
  useEffect(() => {
    let active = true;
    Promise.all([
      catalogService.getAcademicCatalogue(),
      apiRequest<StudentAcademicData>('/dashboard'),
    ])
      .then(([data, student]) => {
        if (!active) return;
        setCatalogue(data);
        if (student.academic_profile) {
          const ap = student.academic_profile;
          if (ap.matriculation_number) setMatricNumber(ap.matriculation_number);
          if (ap.jamb_registration_number) setJambNumber(ap.jamb_registration_number);
          if (ap.programme_id) setProgrammeId(String(ap.programme_id));
          if (ap.department_id) setDepartmentId(String(ap.department_id));
          if (ap.admission_session_id) setSessionId(String(ap.admission_session_id));
          if (ap.verified_level_id) setLevelId(String(ap.verified_level_id));
        }
      })
      .catch((cause: unknown) => {
        if (active) setStatusError(cause instanceof Error ? cause.message : 'Unable to load academic catalogue.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Filter departments by selected faculty
  const availableDepartments = useMemo(() => {
    if (!catalogue) return [];
    if (!facultyId) return catalogue.departments;
    return catalogue.departments.filter((d) => String(d.faculty_id) === facultyId);
  }, [catalogue, facultyId]);

  // Filter programmes by selected faculty or department
  const availableProgrammes = useMemo(() => {
    if (!catalogue) return [];
    if (!facultyId) return catalogue.programmes;
    return catalogue.programmes.filter((p) => String(p.faculty_id) === facultyId);
  }, [catalogue, facultyId]);

  const handleSendEmailCode = async () => {
    setEmailSending(true);
    setEmailError(null);
    setEmailSuccess(null);
    const res = await sendEmailVerificationCode();
    setEmailSending(false);
    if (res.ok) {
      setCodeSent(true);
      if (res.devCode) setDevCode(res.devCode);
      setEmailSuccess('A 6-digit verification code has been sent to your email.');
    } else {
      setEmailError(res.error || 'Unable to send verification code. Please try again.');
    }
  };

  const handleVerifyEmailCode = async () => {
    if (!emailCode.trim()) {
      setEmailError('Please enter the 6-digit code received in your email.');
      return;
    }
    setEmailVerifying(true);
    setEmailError(null);
    const res = await verifyEmailCode(emailCode.trim());
    setEmailVerifying(false);
    if (res.ok) {
      setEmailSuccess('Email verified successfully!');
      setTimeout(() => setStep(2), 1000);
    } else {
      setEmailError(res.error || 'Invalid code. Please check and try again.');
    }
  };

  const handleSubmitStudentStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusError(null);

    if (!matricNumber.trim() && !jambNumber.trim()) {
      setStatusError('Provide your Matriculation Number or JAMB Registration Number.');
      return;
    }
    if (!programmeId) {
      setStatusError('Please select your Programme / Course of Study.');
      return;
    }
    if (!sessionId) {
      setStatusError('Please select your Admission Session.');
      return;
    }

    setSubmittingStatus(true);
    try {
      const submission = await apiRequest<{ id: number; status: string }>('/verification/submissions', {
        method: 'POST',
        body: JSON.stringify({
          matriculation_number: matricNumber.trim() || undefined,
          jamb_registration_number: jambNumber.trim() || undefined,
          programme_id: Number(programmeId),
          department_id: departmentId ? Number(departmentId) : undefined,
          admission_session_id: Number(sessionId),
          claimed_level_id: levelId ? Number(levelId) : undefined,
        }),
      });

      // Upload document if attached
      if (documentFile && submission.id) {
        const formData = new FormData();
        formData.append('upload', documentFile);
        await apiRequest(`/verification/submissions/${submission.id}/documents`, {
          method: 'POST',
          body: formData,
        });
      }

      await refreshProfile();
      setSubmissionComplete(true);
    } catch (cause) {
      setStatusError(cause instanceof Error ? cause.message : 'Unable to submit student verification.');
    } finally {
      setSubmittingStatus(false);
    }
  };

  const skipToDashboard = () => {
    navigate(redirect ? decodeURIComponent(redirect) : '/dashboard', { replace: true });
  };

  if (!profile) {
    return (
      <div className="container-page py-16 max-w-md mx-auto">
        <Alert tone="error" title="Sign In Required">
          <p className="text-sm">Please sign in or create an account to verify your student credentials.</p>
        </Alert>
        <div className="mt-4 flex gap-3">
          <Link to="/register"><Button>Create account</Button></Link>
          <Link to="/login"><Button variant="outline">Sign in</Button></Link>
        </div>
      </div>
    );
  }

  if (submissionComplete) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-10 bg-ink-50">
        <Card className="w-full max-w-lg p-8 text-center space-y-4">
          <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="font-display text-2xl font-bold text-ink-950">Student Verification Submitted</h1>
          <p className="text-sm text-ink-600 leading-relaxed">
            Your matriculation and academic details have been safely recorded and are now in the verification queue.
            An administrator or verification officer will review your records.
          </p>
          <div className="p-4 bg-teal-50 rounded-xl border border-teal-200 text-left text-xs space-y-1.5 text-teal-900">
            <p><strong>Name:</strong> {profile.fullName}</p>
            <p><strong>Email:</strong> {profile.email} {profile.emailVerified ? '✓ Verified' : ''}</p>
            {matricNumber && <p><strong>Matric No:</strong> {matricNumber}</p>}
            <p className="text-teal-700 pt-1">
              You can already browse catalogues, access public handouts, and view sample test questions.
            </p>
          </div>
          <Button fullWidth size="lg" onClick={skipToDashboard} rightIcon={<ArrowRight className="h-4 w-4" />}>
            Go to Student Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-ink-50 py-10 px-4">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              step === 1
                ? 'bg-teal-700 text-white shadow-sm'
                : profile.emailVerified
                ? 'bg-teal-100 text-teal-800'
                : 'bg-ink-100 text-ink-600'
            }`}
          >
            <Mail className="h-4 w-4" />
            <span>1. Email Verification</span>
            {profile.emailVerified && <CheckCircle2 className="h-3.5 w-3.5 text-teal-700" />}
          </button>

          <span className="text-ink-300">→</span>

          <button
            type="button"
            onClick={() => setStep(2)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              step === 2
                ? 'bg-teal-700 text-white shadow-sm'
                : 'bg-ink-100 text-ink-600'
            }`}
          >
            <GraduationCap className="h-4 w-4" />
            <span>2. Student Status Verification</span>
          </button>
        </div>

        {/* SECTION 1: EMAIL VERIFICATION */}
        {step === 1 && (
          <Card className="p-6 sm:p-8 space-y-5">
            <div className="border-b border-ink-100 pb-4">
              <Badge tone="teal" className="mb-2"><Mail className="h-3 w-3" /> Step 1</Badge>
              <h1 className="font-display text-2xl font-bold text-ink-950">Verify your email address</h1>
              <p className="mt-1 text-sm text-ink-600 leading-relaxed">
                Confirming your email ({profile.email}) ensures secure access to course subscriptions and official announcements.
              </p>
            </div>

            {profile.emailVerified ? (
              <div className="p-5 rounded-2xl bg-teal-50 border border-teal-200 text-teal-900 space-y-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-teal-700" />
                  <span className="font-bold text-sm">Your email is verified!</span>
                </div>
                <p className="text-xs text-teal-800">
                  You have confirmed ownership of <strong>{profile.email}</strong>. Next, verify your student status.
                </p>
                <Button size="sm" onClick={() => setStep(2)} rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                  Continue to Student Status
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {emailError && <Alert tone="error">{emailError}</Alert>}
                {emailSuccess && <Alert tone="success">{emailSuccess}</Alert>}

                {devCode && (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
                    <span>Dev mode active (code logged): <strong>{devCode}</strong></span>
                    <Button size="sm" variant="ghost" onClick={() => setEmailCode(devCode)}>
                      Auto-fill
                    </Button>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                  <div className="flex-1">
                    <Input
                      label="6-Digit Verification Code"
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value)}
                      placeholder="e.g. 123456"
                      maxLength={10}
                      className="font-mono text-center tracking-widest text-lg"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSendEmailCode}
                    loading={emailSending}
                    leftIcon={<Send className="h-4 w-4" />}
                  >
                    {codeSent ? 'Resend Code' : 'Send Code'}
                  </Button>
                </div>

                <div className="pt-3 flex flex-col sm:flex-row justify-between gap-3 border-t border-ink-100">
                  <Button
                    type="button"
                    onClick={handleVerifyEmailCode}
                    loading={emailVerifying}
                    disabled={!emailCode.trim()}
                    leftIcon={<CheckCircle2 className="h-4 w-4" />}
                  >
                    Confirm & Verify Code
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep(2)}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                  >
                    Skip to Student Status
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* SECTION 2: STUDENT STATUS VERIFICATION */}
        {step === 2 && (
          <Card className="p-6 sm:p-8 space-y-6">
            <div className="border-b border-ink-100 pb-4">
              <Badge tone="teal" className="mb-2"><GraduationCap className="h-3 w-3" /> Step 2</Badge>
              <h1 className="font-display text-2xl font-bold text-ink-950">Verify your SAZU student status</h1>
              <p className="mt-1 text-sm text-ink-600 leading-relaxed">
                Provide your matriculation number, faculty, department, and course of study so that administrators can approve your official student standing.
              </p>
            </div>

            {statusError && <Alert tone="error">{statusError}</Alert>}

            <form onSubmit={handleSubmitStudentStatus} className="space-y-4">
              {/* Identifiers */}
              <div className="p-4 rounded-xl bg-ink-50/70 border border-ink-100 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                  <IdCard className="h-4 w-4 text-teal-600" />
                  <span>Student Identifier</span>
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Input
                    label="Matriculation Number (Preferred)"
                    value={matricNumber}
                    onChange={(e) => setMatricNumber(e.target.value)}
                    placeholder="e.g. CSCU/23/7877"
                  />
                  <Input
                    label="JAMB Registration Number (Freshers)"
                    value={jambNumber}
                    onChange={(e) => setJambNumber(e.target.value)}
                    placeholder="e.g. 202410294821AB"
                  />
                </div>
              </div>

              {/* Faculty & Department */}
              <div className="grid sm:grid-cols-2 gap-3">
                <Select
                  label="Faculty / School"
                  value={facultyId}
                  onChange={(e) => {
                    setFacultyId(e.target.value);
                    setDepartmentId('');
                    setProgrammeId('');
                  }}
                >
                  <option value="">-- Select Faculty --</option>
                  {catalogue?.faculties.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </Select>

                <Select
                  label="Department"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                >
                  <option value="">-- Select Department --</option>
                  {availableDepartments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              </div>

              {/* Programme / Course of Study & Level */}
              <div className="grid sm:grid-cols-2 gap-3">
                <Select
                  label="Programme / Course of Study *"
                  value={programmeId}
                  onChange={(e) => setProgrammeId(e.target.value)}
                  required
                >
                  <option value="">-- Select Programme / Course of Study --</option>
                  {availableProgrammes.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
                </Select>

                <Select
                  label="Current Level"
                  value={levelId}
                  onChange={(e) => setLevelId(e.target.value)}
                >
                  <option value="">-- Select Level --</option>
                  {catalogue?.levels.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>{lvl.name}</option>
                  ))}
                </Select>
              </div>

              {/* Admission Session */}
              <Select
                label="Admission Session *"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                required
              >
                <option value="">-- Select Admission Session --</option>
                {catalogue?.sessions.map((sess) => (
                  <option key={sess.id} value={sess.id}>
                    {sess.name} {sess.is_active ? '(Current Active)' : ''}
                  </option>
                ))}
              </Select>

              {/* Optional Document Upload */}
              <div className="p-4 rounded-xl border border-dashed border-ink-200 bg-ink-50/50 space-y-2">
                <label className="text-xs font-bold text-ink-800 block">
                  Supporting Document (Optional: Student ID Card or Admission Letter)
                </label>
                <input
                  type="file"
                  id="student-doc-input"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setDocumentFile(e.target.files[0]);
                  }}
                  className="text-xs text-ink-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer"
                />
                {documentFile && (
                  <p className="text-xs text-teal-700 font-semibold">
                    Attached: {documentFile.name} ({(documentFile.size / 1024).toFixed(0)} KB)
                  </p>
                )}
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-3 border-t border-ink-100">
                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  loading={submittingStatus}
                  leftIcon={<ShieldCheck className="h-4 w-4" />}
                >
                  Submit for Verification
                </Button>
                <Button
                  type="button"
                  fullWidth
                  variant="ghost"
                  leftIcon={<SkipForward className="h-4 w-4" />}
                  onClick={skipToDashboard}
                >
                  Skip for Now
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
