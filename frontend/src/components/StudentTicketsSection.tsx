import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import {
  LifeBuoy,
  PlusCircle,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  AlertCircle,
  FileEdit,
} from 'lucide-react';
import { supportService, type StudentTicket } from '@/services/support';

const CATEGORIES = [
  { value: 'level_correction', label: 'Academic Level / Progression Correction' },
  { value: 'matric_correction', label: 'Matriculation Number / ID Correction' },
  { value: 'department_correction', label: 'Department or Programme Update' },
  { value: 'material_request', label: 'Missing Material / Handout Request' },
  { value: 'payment_issue', label: 'Payment / Subscription Issue' },
  { value: 'general_complaint', label: 'General Complaint / Feedback' },
];

export function StudentTicketsSection() {
  const [tickets, setTickets] = useState<StudentTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Form state
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const data = await supportService.getMyTickets();
      setTickets(data);
    } catch {
      // Gracefully ignore load error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (subject.trim().length < 3) {
      setFormError('Please enter a descriptive subject (at least 3 characters).');
      return;
    }
    if (message.trim().length < 10) {
      setFormError('Please provide more details in your message (at least 10 characters).');
      return;
    }

    try {
      setSubmitting(true);
      await supportService.createTicket({ category, subject, message });
      setSuccessMessage('Your request has been submitted to the academic administrators.');
      setSubject('');
      setMessage('');
      setShowForm(false);
      fetchTickets();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to submit ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: StudentTicket['status']) => {
    switch (status) {
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Resolved
          </span>
        );
      case 'under_review':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-800 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200">
            <Clock className="h-3 w-3 text-sky-600" /> Under Review
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-800 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
            <XCircle className="h-3 w-3 text-rose-600" /> Dismissed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
            <Clock className="h-3 w-3 text-amber-600" /> Pending Review
          </span>
        );
    }
  };

  return (
    <Card className="p-6 border-ink-200/80 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-ink-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-800">
            <LifeBuoy className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-ink-950">Academic Corrections &amp; Support</h2>
            <p className="text-xs text-ink-500">
              Request profile adjustments, report carryover level mismatches, or submit feedback to administrators.
            </p>
          </div>
        </div>

        <Button
          size="sm"
          variant={showForm ? 'outline' : 'primary'}
          onClick={() => {
            setShowForm(!showForm);
            setFormError(null);
            setSuccessMessage(null);
          }}
          leftIcon={showForm ? <XCircle className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
        >
          {showForm ? 'Cancel Request' : 'New Request or Complaint'}
        </Button>
      </div>

      {successMessage && (
        <Alert tone="success" className="mt-4">
          {successMessage}
        </Alert>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-5 p-5 rounded-2xl bg-ink-50/70 border border-ink-200 space-y-4">
          <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2">
            <FileEdit className="h-4 w-4 text-teal-600" />
            Submit Academic Record Correction or Complaint
          </h3>

          {formError && <Alert tone="error">{formError}</Alert>}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-700 mb-1">Issue Category</label>
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-700 mb-1">Subject</label>
              <Input
                placeholder="Brief summary e.g. Level correction for carryover"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-700 mb-1">Detailed Explanation</label>
            <textarea
              className="w-full rounded-xl border border-ink-200 bg-white p-3 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              rows={4}
              placeholder="Explain the correction needed (e.g., your correct matriculation number, department, or reason for level adjustment)..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={submitting}
            >
              Submit Ticket
            </Button>
          </div>
        </form>
      )}

      {/* Ticket List */}
      <div className="mt-5 space-y-3">
        {loading ? (
          <p className="text-xs text-ink-400 py-3 text-center">Loading ticket history…</p>
        ) : tickets.length === 0 ? (
          <div className="text-center py-6 px-4 rounded-xl border border-dashed border-ink-200 bg-ink-50/30">
            <MessageSquare className="h-7 w-7 text-ink-400 mx-auto mb-2 opacity-50" />
            <p className="text-xs font-medium text-ink-600">No active corrections or complaints.</p>
            <p className="text-[11px] text-ink-400 mt-0.5">
              If your academic details or level require correction, submit a request above.
            </p>
          </div>
        ) : (
          tickets.map((t) => {
            const isExpanded = expandedId === t.id;
            return (
              <div
                key={t.id}
                className="rounded-xl border border-ink-200 bg-white p-4 shadow-2xs hover:border-ink-300 transition"
              >
                <div
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer select-none"
                  onClick={() => setExpandedId(isExpanded ? null : t.id)}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-ink-950">{t.subject}</span>
                      {getStatusBadge(t.status)}
                      <Badge tone="neutral">
                        {CATEGORIES.find((c) => c.value === t.category)?.label || t.category}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-ink-500">
                      Submitted on {new Date(t.created_at).toLocaleDateString()} at{' '}
                      {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-400">
                      {isExpanded ? 'Collapse' : 'View response'}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-ink-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-ink-400" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-ink-100 text-xs space-y-3">
                    <div>
                      <span className="font-semibold text-ink-700 block mb-0.5">Your Message:</span>
                      <p className="text-ink-600 bg-ink-50/70 p-3 rounded-lg whitespace-pre-wrap leading-relaxed">
                        {t.message}
                      </p>
                    </div>

                    {t.admin_notes ? (
                      <div className="p-3.5 rounded-lg bg-teal-50/80 border border-teal-200 space-y-1">
                        <span className="font-bold text-teal-900 flex items-center gap-1.5 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5 text-teal-700" />
                          Administrator Response:
                        </span>
                        <p className="text-teal-950 whitespace-pre-wrap leading-relaxed pl-5">
                          {t.admin_notes}
                        </p>
                        {t.resolved_at && (
                          <p className="text-[10px] text-teal-700 pl-5 pt-1">
                            Updated {new Date(t.resolved_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-ink-500 italic text-[11px] pt-1">
                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                        Awaiting administrator review. You will receive an update here once processed.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
