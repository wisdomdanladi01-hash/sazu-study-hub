import { apiRequest } from './api';

export type StudentTicket = {
  id: number;
  user_id: number;
  user_email?: string;
  user_name?: string;
  category: string;
  subject: string;
  message: string;
  status: 'pending' | 'under_review' | 'resolved' | 'rejected';
  admin_notes?: string | null;
  resolved_by_id?: number | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type TicketCreatePayload = {
  category: string;
  subject: string;
  message: string;
};

export const supportService = {
  async getMyTickets(): Promise<StudentTicket[]> {
    return apiRequest<StudentTicket[]>('/student/tickets');
  },

  async createTicket(payload: TicketCreatePayload): Promise<StudentTicket> {
    return apiRequest<StudentTicket>('/student/tickets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getAdminTickets(statusFilter?: string): Promise<StudentTicket[]> {
    const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    return apiRequest<StudentTicket[]>(`/admin/tickets${query}`);
  },

  async updateAdminTicket(id: number, status: string, admin_notes?: string): Promise<StudentTicket> {
    return apiRequest<StudentTicket>(`/admin/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, admin_notes }),
    });
  },
};
