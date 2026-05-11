import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

/**
 * Scheduled vs Stripe subscription schedules for the billing "Payment plans" tab.
 * Extracted from BillingPage to keep data-fetching testable and isolated from layout.
 */
export function useSubscriptionSchedulesTabData() {
  const { data: scheduledPayments = [], isLoading: scheduledLoading } = useQuery({
    queryKey: ['scheduled-payments-upcoming'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/scheduled-payments/upcoming');
      if (!response.ok) {
        throw new Error('Failed to fetch scheduled payments');
      }
      const data = await response.json();
      return data.success ? data.payments : [];
    },
  });

  const { data: stripeSchedules = [], isLoading: stripeLoading } = useQuery({
    queryKey: ['stripe-subscription-schedules'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/stripe/subscription-schedules');
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return data.success ? data.schedules : [];
    },
  });

  return {
    scheduledPayments,
    stripeSchedules,
    isLoading: scheduledLoading || stripeLoading,
  };
}
