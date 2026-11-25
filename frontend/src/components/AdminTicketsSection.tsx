import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import {
  LifeBuoy,
  Clock,
  CheckCircle2,
  XCircle,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Send,
  RefreshCw,
} from 'lucide-react';
import { supportService, type StudentTicket } from '@/services/support';

export function AdminTicketsSection() {
  const [tickets, setTickets] = useState<StudentTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState<{ [id: number]: string }>({});
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const data = await supportService.getAdminTickets(filter === 'all' ? undefined : filter);
      setTickets(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to fetch tickets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [filter]);

  const handleUpdate = async (ticketId: number, newStatus: string) => {
    try {
      setUpdatingId(ticketId);
      setActionError(null);
      setActionSuccess(null);
      const note = replyText[ticketId];
      await supportService.updateAdminTicket(ticketId, newStatus, note);
      setActionSuccess(`Ticket #${ticketId} status updated to ${newStatus}.`);
      fetchTickets();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update ticket.');
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadge = (status: StudentTicket['status']) => {
    switch (status) {
      case 'resolved':
        return <Badge tone="green">Resolved</Badge>;
      case 'under_review':
        return <Badge tone="blue">Under Review</Badge>;
      case 'rejected':
        return <Badge tone="neutral">Dismissed</Badge>;
      default:
        return <Badge tone="amber">Pending</Badge>;
    }
  };

  return (
    <Card className="p-5 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-ink-100">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
            <LifeBuoy className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-display font-bold text-ink-950">Student Corrections &amp; Complaints</h2>
            <p className="text-xs text-ink-500">Review student level adjustments, profile corrections &amp; reports</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="text-xs rounded-lg border border-ink-200 bg-white py-1 px-2.5 text-ink-700 focus:outline-none"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="under_review">Under Review</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Dismissed</option>
          </select>
          <Button variant="ghost" size="sm" onClick={fetchTickets} title="Refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {actionSuccess && <Alert tone="success" className="mb-3">{actionSuccess}</Alert>}
      {actionError && <Alert tone="error" className="mb-3">{actionError}</Alert>}

      {loading ? (
        <p className="text-xs text-ink-400 py-6 text-center">Loading student requests…</p>
      ) : tickets.length === 0 ? (
        <div className="text-center py-6 text-xs text-ink-500">
          No student support tickets found for the selected filter.
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const isExpanded = expandedId === t.id;
            return (
              <div key={t.id} className="p-3.5 rounded-xl border border-ink-150 bg-white shadow-2xs space-y-2">
                <div
                  className="flex items-start justify-between gap-3 cursor-pointer select-none"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : t.id);
                    if (!replyText[t.id] && t.admin_notes) {
                      setReplyText({ ...replyText, [t.id]: t.admin_notes });
                    }
                  }}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-xs text-ink-900">{t.subject}</span>
                      {getStatusBadge(t.status)}
                      <span className="text-[10px] uppercase font-bold tracking-wider text-ink-400 bg-ink-50 px-1.5 py-0.5 rounded">
                        {t.category.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-500 truncate">
                      From: <strong className="text-ink-700">{t.user_name || 'Student'}</strong> ({t.user_email}) &middot;{' '}
                      {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="shrink-0 flex items-center gap-1 text-ink-400 text-xs">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="pt-3 border-t border-ink-100 text-xs space-y-3">
                    <div className="p-3 rounded-lg bg-ink-50 text-ink-800 whitespace-pre-wrap leading-relaxed">
                      {t.message}
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[11px] font-semibold text-ink-700">
                        Administrator Response to Student:
                      </label>
                      <textarea
                        className="w-full rounded-lg border border-ink-200 bg-white p-2.5 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-teal-600"
                        rows={2}
                        placeholder="Type reply or explanation to the student..."
                        value={replyText[t.id] ?? t.admin_notes ?? ''}
                        onChange={(e) => setReplyText({ ...replyText, [t.id]: e.target.value })}
                      />

                      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUpdate(t.id, 'under_review')}
                          loading={updatingId === t.id}
                        >
                          Mark Under Review
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdate(t.id, 'rejected')}
                          loading={updatingId === t.id}
                        >
                          Dismiss
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleUpdate(t.id, 'resolved')}
                          loading={updatingId === t.id}
                          leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        >
                          Resolve &amp; Save
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
