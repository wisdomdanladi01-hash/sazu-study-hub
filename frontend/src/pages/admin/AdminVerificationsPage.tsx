import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  FileText,
  Download,
  AlertCircle,
  RefreshCw,
  Search,
  UserCheck,
  Eye,
  X,
  ShieldAlert,
} from 'lucide-react';
import { adminService } from '@/services/admin';
import type { VerificationDocument, VerificationQueueItem } from '@/types';

export function AdminVerificationsPage() {
  const [submissions, setSubmissions] = useState<VerificationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected for review
  const [activeSubmission, setActiveSubmission] = useState<VerificationQueueItem | null>(null);
  const [documents, setDocuments] = useState<VerificationDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Decision form
  const [decisionType, setDecisionType] = useState<'approved' | 'rejected' | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [verifiedLevelId, setVerifiedLevelId] = useState<number | ''>('');
  const [verifiedSessionId, setVerifiedSessionId] = useState<number | ''>('');
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminService.listPendingVerifications();
      setSubmissions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load verification submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const handleOpenReview = async (submission: VerificationQueueItem) => {
    setActiveSubmission(submission);
    setDecisionType(null);
    setDecisionReason('');
    setVerifiedLevelId(submission.claimed_level_id || '');
    setVerifiedSessionId(submission.admission_session_id || '');
    setDecisionError(null);

    try {
      setLoadingDocs(true);
      const docs = await adminService.listVerificationDocuments(submission.id);
      setDocuments(docs);
    } catch {
      setDecisionError('Failed to load supporting documents');
      setDocuments([]);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleCloseReview = () => {
    setActiveSubmission(null);
    setDocuments([]);
    setDecisionType(null);
    setDecisionError(null);
  };

  const handleDownloadDoc = async (doc: VerificationDocument) => {
    if (!activeSubmission) return;
    try {
      await adminService.downloadVerificationDocument(activeSubmission.id, doc.id, doc.original_filename);
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : 'Failed to download document');
    }
  };

  const handleSubmitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSubmission || !decisionType) return;

    if (decisionType === 'rejected' && !decisionReason.trim()) {
      setDecisionError('Please provide a reason for rejecting this verification request.');
      return;
    }

    try {
      setSubmittingDecision(true);
      setDecisionError(null);

      await adminService.decideVerification(activeSubmission.id, {
        decision: decisionType,
        decision_reason: decisionReason.trim() || undefined,
        verified_level_id: verifiedLevelId === '' ? undefined : Number(verifiedLevelId),
        verified_session_id: verifiedSessionId === '' ? undefined : Number(verifiedSessionId),
      });

      setSuccessMessage(
        `Submission #${activeSubmission.id} for Matriculation ${activeSubmission.matriculation_number || 'N/A'
        } has been ${decisionType}.`,
      );
      handleCloseReview();
      await fetchSubmissions();
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : 'Failed to save verification decision');
    } finally {
      setSubmittingDecision(false);
    }
  };

  const filteredSubmissions = submissions.filter((sub) => {
    const q = searchQuery.toLowerCase();
    return (
      (sub.matriculation_number && sub.matriculation_number.toLowerCase().includes(q)) ||
      (sub.jamb_registration_number && sub.jamb_registration_number.toLowerCase().includes(q)) ||
      sub.id.toString().includes(q) ||
      sub.user_id.toString().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">Student Verification Queue</h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Review identity records and academic documentation submitted by students for official verification.
          </p>
        </div>
        <button
          onClick={fetchSubmissions}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition shadow-sm"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{successMessage}</div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex items-center gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by matric number, JAMB number, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Queue Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading verification queue...</div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">Queue is clear</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              There are currently no student verification submissions pending review.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Queue ID</th>
                  <th className="px-4 py-3 font-semibold">User ID</th>
                  <th className="px-4 py-3 font-semibold">Matriculation No.</th>
                  <th className="px-4 py-3 font-semibold">JAMB Reg No.</th>
                  <th className="px-4 py-3 font-semibold">Level Claimed</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSubmissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">#{sub.id}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">User #{sub.user_id}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {sub.matriculation_number || (
                        <span className="text-slate-400 italic font-normal">Not provided</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {sub.jamb_registration_number || (
                        <span className="text-slate-400 italic">Not provided</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {sub.claimed_level_id ? `Level ID: ${sub.claimed_level_id}` : 'Unspecified'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 capitalize">
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleOpenReview(sub)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {activeSubmission && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Review Submission #{activeSubmission.id}
                </h3>
                <p className="text-xs text-slate-500">Student Account User #{activeSubmission.user_id}</p>
              </div>
              <button
                onClick={handleCloseReview}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {decisionError && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                  <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>{decisionError}</div>
                </div>
              )}

              {/* Submitted Details */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block mb-0.5">Matriculation Number</span>
                  <span className="font-semibold text-slate-800 text-sm">
                    {activeSubmission.matriculation_number || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">JAMB Registration Number</span>
                  <span className="font-semibold text-slate-800 text-sm">
                    {activeSubmission.jamb_registration_number || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Claimed Level ID</span>
                  <span className="font-medium text-slate-800">{activeSubmission.claimed_level_id || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Admission Session ID</span>
                  <span className="font-medium text-slate-800">
                    {activeSubmission.admission_session_id || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Supporting Documents Section */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Supporting Verification Documents
                </h4>
                {loadingDocs ? (
                  <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-lg">
                    Loading attached credentials...
                  </div>
                ) : documents.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    No supporting document files uploaded for this submission.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                          <div>
                            <div className="text-xs font-semibold text-slate-800">{doc.original_filename}</div>
                            <div className="text-[11px] text-slate-500">
                              {doc.mime_type} • {(doc.size_bytes / 1024).toFixed(1)} KB
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadDoc(doc)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition"
                        >
                          <Download className="h-3.5 w-3.5 text-slate-500" />
                          Download
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Decision Section */}
              <form onSubmit={handleSubmitDecision} className="space-y-4 pt-4 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Verification Action
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDecisionType('approved')}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition ${decisionType === 'approved'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Approve Verification
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecisionType('rejected')}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition ${decisionType === 'rejected'
                        ? 'border-red-600 bg-red-50 text-red-800 ring-2 ring-red-500'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <XCircle className="h-4 w-4 text-red-600" />
                      Reject Verification
                    </button>
                  </div>
                </div>

                {decisionType === 'approved' && (
                  <div className="grid grid-cols-2 gap-4 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Verified Level ID
                      </label>
                      <input
                        type="number"
                        value={verifiedLevelId}
                        onChange={(e) => setVerifiedLevelId(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        placeholder="e.g. 1 (100L)"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Verified Session ID
                      </label>
                      <input
                        type="number"
                        value={verifiedSessionId}
                        onChange={(e) => setVerifiedSessionId(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        placeholder="e.g. 1 (2024/2025)"
                      />
                    </div>
                  </div>
                )}

                {decisionType === 'rejected' && (
                  <div className="bg-red-50/50 p-4 rounded-xl border border-red-100 space-y-2">
                    <label className="block text-xs font-medium text-slate-800">
                      Rejection Reason (Required)
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={decisionReason}
                      onChange={(e) => setDecisionReason(e.target.value)}
                      placeholder="Explain to the student why this verification was rejected (e.g. Matriculation number does not match university record, or document unreadable)..."
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={handleCloseReview}
                    className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!decisionType || submittingDecision}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-xs text-white transition disabled:opacity-50 ${decisionType === 'rejected'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                  >
                    {submittingDecision ? 'Saving...' : 'Confirm Decision'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
