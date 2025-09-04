import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { AlertTriangle, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/SupabaseProvider';
import { useLocation } from 'wouter';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';

interface BillingSummary {
  totalBalance: number;
  totalBalanceFormatted: string;
  enrollmentCount: number;
  enrollmentDetails: Array<{
    enrollmentId: string;
    childName: string;
    className: string;
    balance: number;
    status: string;
  }>;
  parentEmail: string;
}

export default function BalanceIndicator() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  
  // Initialize real-time updates
  useRealTimeUpdates();

  const { data: billingSummary } = useQuery<BillingSummary>({
    queryKey: ['billing-summary'],
    enabled: !!user?.email && isAuthenticated,
    staleTime: 0, // Always consider data stale - fetch fresh data
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/billing/summary');
      if (!response.ok) throw new Error('Failed to fetch billing summary');
      return response.json();
    },
  });

  // Don't show if no balance due
  if (!billingSummary || billingSummary.totalBalance <= 0) {
    return null;
  }

  const handleViewPayments = () => {
    setLocation('/billing');
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-800">
            {billingSummary.totalBalanceFormatted} Due
          </span>
        </div>
        <p className="text-xs text-amber-700">
          {billingSummary.enrollmentCount} enrollment{billingSummary.enrollmentCount !== 1 ? 's' : ''} pending payment
        </p>
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={handleViewPayments}
        className="border-amber-300 text-amber-700 hover:bg-amber-100"
      >
        View
      </Button>
    </div>
  );
}