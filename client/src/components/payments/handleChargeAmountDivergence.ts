// Task 193 — friendly recovery for the `charge_amount_diverged` 409.
//
// Refreshes the upcoming-payments cache, classifies the divergence as either
// `already_paid` (close dialog) or `balance_changed` (keep dialog open with
// the server-confirmed amount), and reports it via `captureApiError` with
// an explicit severity (low for already_paid, medium for balance_changed).
import { queryClient } from '@/lib/queryClient';
import { captureApiError } from '@/lib/errorTracker';

export type ChargeDivergenceClassification = 'already_paid' | 'balance_changed';

export interface ChargeDivergenceResponse {
  expectedChargeAmount?: number;
  serverChargeAmount?: number;
  actualChargeAmount?: number;
  creditsApplied?: number;
  originalAmount?: number;
  error?: string;
}

export interface ChargeDivergenceResult {
  classification: ChargeDivergenceClassification;
  serverChargeAmount: number;
  expectedChargeAmount: number | null;
  creditsApplied: number;
  originalAmount: number;
  stillPayableCount: number;
  missingCount: number;
}

interface UpcomingScheduledPayment {
  id: string | number;
  status: string;
}

interface UpcomingScheduledPaymentsResponse {
  success?: boolean;
  payments?: UpcomingScheduledPayment[];
}

export async function handleChargeAmountDivergence(input: {
  data: ChargeDivergenceResponse;
  snapshotIds: Array<string | number>;
  endpoint: string;
  method: string;
  context: 'single' | 'combined';
}): Promise<ChargeDivergenceResult> {
  const { data, snapshotIds, endpoint, method, context } = input;
  const serverChargeAmount =
    typeof data.serverChargeAmount === 'number'
      ? data.serverChargeAmount
      : typeof data.actualChargeAmount === 'number'
        ? data.actualChargeAmount
        : 0;
  const expectedChargeAmount =
    typeof data.expectedChargeAmount === 'number' ? data.expectedChargeAmount : null;
  const creditsApplied =
    typeof data.creditsApplied === 'number' ? data.creditsApplied : 0;
  const originalAmount =
    typeof data.originalAmount === 'number' ? data.originalAmount : 0;

  // Refetch the upcoming list (the data we classify against) and invalidate
  // every other dialog-relevant cache so the UI re-renders with fresh state.
  await Promise.all([
    queryClient.refetchQueries({
      queryKey: ['/api/scheduled-payments/upcoming'],
      exact: true,
    }),
    queryClient.invalidateQueries({ queryKey: ['/api/parent/enrollments'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/parent/credits'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/scheduled-payments'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/scheduled-payments/grouped'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/payment-history'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/enrollments'] }),
  ]);

  // Classification (per task #193 contract):
  //   /api/scheduled-payments/upcoming is server-filtered to `pending` and
  //   `processing` only. Anything else (completed / cancelled / skipped /
  //   failed) is pruned by the server and shows up here as MISSING.
  //
  //   already_paid    — every snapshot ID is no longer payable, i.e. either
  //                     missing from the refreshed upcoming list (terminal)
  //                     OR present with status `processing` (a parallel flow
  //                     already took it). The dialog can safely close.
  //   balance_changed — at least one snapshot ID is still `pending` /
  //                     `overdue` after refresh: the row is genuinely still
  //                     payable, but at a different amount. Keep dialog open.
  const refreshed = queryClient.getQueryData<UpcomingScheduledPaymentsResponse>(
    ['/api/scheduled-payments/upcoming'],
  );
  const statusById = new Map<string, string>();
  for (const p of refreshed?.payments ?? []) {
    statusById.set(String(p.id), p.status);
  }
  let stillPayableCount = 0;
  let missingCount = 0;
  for (const id of snapshotIds) {
    const status = statusById.get(String(id));
    if (status === undefined) {
      missingCount += 1;
    } else if (status === 'pending' || status === 'overdue') {
      stillPayableCount += 1;
    }
    // status === 'processing' (or any other present-but-not-payable value)
    // counts as no-longer-payable: neither still-payable nor missing.
  }
  const classification: ChargeDivergenceClassification =
    snapshotIds.length > 0 && stillPayableCount === 0
      ? 'already_paid'
      : 'balance_changed';

  void captureApiError(
    `charge_amount_diverged (${classification})`,
    409,
    endpoint,
    method,
    {
      classification,
      context,
      expectedChargeAmount,
      serverChargeAmount,
      creditsApplied,
      originalAmount,
      snapshotIds,
      stillPayableCount,
      missingCount,
      autoRecovered: classification === 'already_paid',
    },
    classification === 'already_paid' ? 'low' : 'medium',
  );

  return {
    classification,
    serverChargeAmount,
    expectedChargeAmount,
    creditsApplied,
    originalAmount,
    stillPayableCount,
    missingCount,
  };
}
