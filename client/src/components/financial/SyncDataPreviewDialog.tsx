import { useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

export interface SyncPreviewSummary {
  enrollmentsToProcess: number;
  enrollmentsWithChanges: number;
  paymentsToMarkCompleted: number;
  cancelledToDelete: number;
  generatedCatchupsToRemove: number;
  duplicatesToRemove: number;
  orphansToRemove: number;
  excessToRemove: number;
  totalToClean: number;
  missingPaymentsToCreate: number;
  enrollmentsWithMissingPayments: number;
}

interface SyncPreviewResponse {
  message: string;
  summary: SyncPreviewSummary;
  errors?: Array<{ enrollmentId: number; error: string }>;
  cleanupDetails?: Array<{
    scheduledPaymentId: number;
    reason: string;
    enrollmentId: number;
    amount: number;
  }>;
  missingPaymentsDetails?: Array<{
    enrollmentId: number;
    parentEmail: string;
    remainingBalance: number;
    paymentCreated: boolean;
  }>;
}

const CLEANUP_LABELS: Record<string, string> = {
  duplicate: 'Duplicate installments',
  orphan: 'Orphaned installments',
  excess: 'Over-scheduled installments',
  cancelled: 'Cancelled rows (delete)',
  generated_catchup: 'Catch-ups to regenerate',
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    (cents || 0) / 100,
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  if (value <= 0) return null;
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? 'font-semibold text-foreground' : 'font-medium'}>{value}</span>
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function SyncDataPreviewDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();

  const {
    data: preview,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<SyncPreviewResponse>({
    queryKey: ['/api/admin/financial-reports/reconcile-scheduled-payments/preview'],
    enabled: open,
    staleTime: 0,
  });

  const summary = preview?.summary;
  const previewErrors = preview?.errors ?? [];

  const hasChanges = useMemo(() => {
    if (!summary) return false;
    return (
      (summary.totalToClean ?? 0) > 0 ||
      (summary.paymentsToMarkCompleted ?? 0) > 0 ||
      (summary.missingPaymentsToCreate ?? 0) > 0
    );
  }, [summary]);

  const applyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/financial-reports/reconcile-scheduled-payments', {});
      return response.json();
    },
    onSuccess: (data: { summary?: SyncPreviewSummary & { missingPaymentsCreated?: number }; errors?: unknown[] }) => {
      const cleaned = data.summary?.totalCleaned ?? data.summary?.totalToClean ?? 0;
      const updated = data.summary?.paymentsMarkedCompleted ?? 0;
      const created = data.summary?.missingPaymentsCreated ?? data.summary?.missingPaymentsToCreate ?? 0;
      const parts: string[] = [];
      if (cleaned > 0) parts.push(`Removed ${cleaned} stale row(s)`);
      if (updated > 0) parts.push(`Marked ${updated} installment(s) completed`);
      if (created > 0) parts.push(`Created ${created} catch-up installment(s)`);
      const errorCount = data.errors?.length ?? 0;
      toast({
        title: 'Data synced successfully',
        description:
          parts.length > 0
            ? parts.join('. ') + (errorCount > 0 ? ` (${errorCount} enrollment(s) had errors.)` : '.')
            : 'No changes were needed.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/outstanding-balances'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/payment-plans'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/collections-overview'] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: 'Sync failed',
        description: err.message || 'An error occurred while syncing data.',
        variant: 'destructive',
      });
    },
  });

  const cleanupByReason = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of preview?.cleanupDetails ?? []) {
      counts[row.reason] = (counts[row.reason] ?? 0) + 1;
    }
    return counts;
  }, [preview?.cleanupDetails]);

  const catchUpTotalCents = useMemo(
    () =>
      (preview?.missingPaymentsDetails ?? []).reduce((sum, row) => sum + (row.remainingBalance ?? 0), 0),
    [preview?.missingPaymentsDetails],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync scheduled payments</DialogTitle>
          <DialogDescription>
            Aligns installment rows with enrollment payments: cleans duplicates, marks paid
            installments complete, and creates catch-up rows where needed. This does not charge cards.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not load preview</AlertTitle>
            <AlertDescription>
              {(error as Error).message || 'Try again in a moment.'}
            </AlertDescription>
          </Alert>
        ) : summary ? (
          <div className="space-y-4 py-1">
            {!hasChanges ? (
              <Alert className="border-green-200 bg-green-50 text-green-900">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle>Everything looks up to date</AlertTitle>
                <AlertDescription>
                  No cleanup, status updates, or catch-up installments are needed right now.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {(summary.totalToClean ?? 0) > 0 && (
                  <div className="rounded-lg border p-3 space-y-1">
                    <p className="text-sm font-medium">1. Cleanup</p>
                    <SummaryRow label="Total rows affected" value={summary.totalToClean} highlight />
                    {Object.entries(cleanupByReason).map(([reason, count]) => (
                      <SummaryRow
                        key={reason}
                        label={CLEANUP_LABELS[reason] ?? reason}
                        value={count}
                      />
                    ))}
                  </div>
                )}

                {(summary.paymentsToMarkCompleted ?? 0) > 0 && (
                  <div className="rounded-lg border p-3 space-y-1">
                    <p className="text-sm font-medium">2. Mark installments completed</p>
                    <SummaryRow
                      label="Pending installments already covered by payments"
                      value={summary.paymentsToMarkCompleted}
                      highlight
                    />
                    <SummaryRow
                      label="Enrollments affected"
                      value={summary.enrollmentsWithChanges}
                    />
                  </div>
                )}

                {(summary.missingPaymentsToCreate ?? 0) > 0 && (
                  <div className="rounded-lg border p-3 space-y-1">
                    <p className="text-sm font-medium">3. Create catch-up installments</p>
                    <SummaryRow
                      label="New pending installments"
                      value={summary.missingPaymentsToCreate}
                      highlight
                    />
                    <SummaryRow
                      label="Enrollments with gaps"
                      value={summary.enrollmentsWithMissingPayments}
                    />
                    {catchUpTotalCents > 0 && (
                      <p className="text-xs text-muted-foreground pt-1">
                        Combined catch-up amount: {formatCurrency(catchUpTotalCents)} (due in ~7 days)
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {previewErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{previewErrors.length} enrollment(s) may fail</AlertTitle>
                <AlertDescription className="text-xs mt-1 max-h-24 overflow-y-auto">
                  {previewErrors.slice(0, 5).map((e) => (
                    <div key={e.enrollmentId}>
                      #{e.enrollmentId}: {e.error}
                    </div>
                  ))}
                  {previewErrors.length > 5 && (
                    <div className="mt-1">…and {previewErrors.length - 5} more</div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : null}

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="sm:mr-auto"
            onClick={() => refetch()}
            disabled={isLoading || isFetching || applyMutation.isPending}
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Refresh preview
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applyMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (hasChanges) applyMutation.mutate();
              else onOpenChange(false);
            }}
            disabled={isLoading || !!error || applyMutation.isPending}
          >
            {applyMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Syncing…
              </>
            ) : hasChanges ? (
              'Apply sync'
            ) : (
              'Close'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
