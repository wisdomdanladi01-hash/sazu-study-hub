import { apiRequest } from '@/services/api';

export interface SubscriptionPackage {
  id: number;
  name: string;
  description: string | null;
  package_type: 'subscription' | 'semester' | 'session' | 'level' | 'course' | 'resource' | 'resource_package';
  price_minor: number;
  subscriber_price_minor?: number | null;
  effective_price_minor?: number | null;
  currency: string;
  semester_id?: number | null;
  academic_session_id?: number | null;
  academic_level_id?: number | null;
  course_id?: number | null;
  resource_id?: number | null;
  target_name?: string | null;
  semester_starts_on?: string | null;
  semester_ends_on?: string | null;
  available_from?: string | null;
  available_until?: string | null;
  is_active: boolean;
  buyers_count?: number;
  total_revenue_minor?: number;
}

export interface PaymentRecord {
  id: number;
  status: string;
  provider_reference: string | null;
  amount_minor: number;
  currency: string;
  created_at: string;
  verified_at: string | null;
  package: { id: number; name: string } | null;
}

export interface PaymentVerification {
  status: string;
  reference: string;
  subscription_status: string;
  message: string;
}

export const paymentService = {
  async listPackages(): Promise<SubscriptionPackage[]> {
    const res = await apiRequest<SubscriptionPackage[] | { items: SubscriptionPackage[] }>('/subscriptions/packages');
    return Array.isArray(res) ? res : (res.items || []);
  },

  async initializePayment(packageId: number): Promise<{ checkout_url: string; reference: string }> {
    return apiRequest<{ checkout_url: string; reference: string }>('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ package_id: packageId }),
    });
  },

  async getPaymentHistory(): Promise<PaymentRecord[]> {
    const response = await apiRequest<PaymentRecord[] | { items: PaymentRecord[]; total: number }>('/payments');
    return Array.isArray(response) ? response : (response.items || []);
  },

  async verifyPayment(reference: string): Promise<PaymentVerification> {
    return apiRequest(`/payments/${encodeURIComponent(reference)}/verify`, {
      method: 'POST',
    });
  },
};
