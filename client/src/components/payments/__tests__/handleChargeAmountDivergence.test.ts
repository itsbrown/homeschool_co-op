// Task 193 — unit test for the friendly self-recovery helper that wraps
// the `charge_amount_diverged` 409.
//
// `/api/scheduled-payments/upcoming` is server-filtered to `pending` and
// `processing`. Anything else is pruned and shows up as MISSING.
// Classification therefore is:
//   - already_paid   → no snapshot ID is still pending/overdue (rows are
//                      missing, in `processing`, or otherwise non-payable).
//   - balance_changed → at least one snapshot ID is still pending/overdue.

const refetchQueriesMock = jest.fn().mockResolvedValue(undefined);
const invalidateQueriesMock = jest.fn().mockResolvedValue(undefined);
const getQueryDataMock = jest.fn();
const captureApiErrorMock = jest.fn().mockResolvedValue(true);

jest.mock('@/lib/queryClient', () => ({
  queryClient: {
    refetchQueries: (...args: any[]) => refetchQueriesMock(...args),
    invalidateQueries: (...args: any[]) => invalidateQueriesMock(...args),
    getQueryData: (...args: any[]) => getQueryDataMock(...args),
  },
  apiRequest: jest.fn(),
}));

jest.mock('@/lib/errorTracker', () => ({
  captureApiError: (...args: any[]) => captureApiErrorMock(...args),
}));

import { handleChargeAmountDivergence } from '../handleChargeAmountDivergence';

const baseDivergenceBody = {
  expectedChargeAmount: 5000,
  serverChargeAmount: 0,
  actualChargeAmount: 0,
  creditsApplied: 5000,
  originalAmount: 5000,
  error:
    'The amount we are about to charge no longer matches what was shown. Please refresh the page and try again.',
};

describe('handleChargeAmountDivergence (Task 193)', () => {
  beforeEach(() => {
    refetchQueriesMock.mockClear();
    invalidateQueriesMock.mockClear();
    getQueryDataMock.mockReset();
    captureApiErrorMock.mockClear();
  });

  it('refetches /upcoming on the exact key BEFORE classifying', async () => {
    let refetchResolvedAt = -1;
    let getQueryDataCalledAt = -1;
    let tick = 0;
    refetchQueriesMock.mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => {
          refetchResolvedAt = ++tick;
          resolve(undefined);
        }, 0);
      });
    });
    getQueryDataMock.mockImplementation(() => {
      getQueryDataCalledAt = ++tick;
      return { success: true, payments: [] };
    });

    await handleChargeAmountDivergence({
      data: baseDivergenceBody,
      snapshotIds: [42],
      endpoint: '/api/scheduled-payments/pay',
      method: 'POST',
      context: 'single',
    });

    expect(refetchQueriesMock).toHaveBeenCalledWith({
      queryKey: ['/api/scheduled-payments/upcoming'],
      exact: true,
    });
    expect(refetchResolvedAt).toBeGreaterThan(0);
    expect(getQueryDataCalledAt).toBeGreaterThan(refetchResolvedAt);
    expect(getQueryDataMock).toHaveBeenCalledWith(['/api/scheduled-payments/upcoming']);
  });

  it('classifies as already_paid (low severity) when the snapshot row is missing from /upcoming after refresh', async () => {
    // /upcoming returns only pending+processing. A row that just settled
    // (completed/cancelled/skipped/failed) is pruned by the server and
    // shows up here as missing — that is the "double-click, first click
    // already settled it" case the dialog must auto-close on.
    getQueryDataMock.mockReturnValue({
      success: true,
      payments: [{ id: 99, status: 'pending' }],
    });

    const result = await handleChargeAmountDivergence({
      data: baseDivergenceBody,
      snapshotIds: [42],
      endpoint: '/api/scheduled-payments/pay',
      method: 'POST',
      context: 'single',
    });

    expect(result.classification).toBe('already_paid');
    expect(result.stillPayableCount).toBe(0);
    expect(result.missingCount).toBe(1);
    expect(captureApiErrorMock).toHaveBeenCalledTimes(1);
    const [message, statusCode, endpoint, method, metadata, severity] =
      captureApiErrorMock.mock.calls[0];
    expect(message).toBe('charge_amount_diverged (already_paid)');
    expect(statusCode).toBe(409);
    expect(endpoint).toBe('/api/scheduled-payments/pay');
    expect(method).toBe('POST');
    expect(severity).toBe('low');
    expect(metadata).toMatchObject({
      classification: 'already_paid',
      context: 'single',
      autoRecovered: true,
      stillPayableCount: 0,
      missingCount: 1,
    });
  });

  it('classifies as already_paid when the snapshot row is present in /upcoming with status `processing` (parallel flow won the race)', async () => {
    getQueryDataMock.mockReturnValue({
      success: true,
      payments: [{ id: 42, status: 'processing' }],
    });

    const result = await handleChargeAmountDivergence({
      data: baseDivergenceBody,
      snapshotIds: [42],
      endpoint: '/api/scheduled-payments/pay',
      method: 'POST',
      context: 'single',
    });

    expect(result.classification).toBe('already_paid');
    expect(result.stillPayableCount).toBe(0);
    expect(result.missingCount).toBe(0);
  });

  it('classifies as already_paid when EVERY snapshot row in a combined dialog is missing or processing', async () => {
    // 42 is pruned (settled/cancelled/skipped), 43 is mid-flight in the
    // server's other charge attempt. None remain pending/overdue → safe to
    // close the dialog.
    getQueryDataMock.mockReturnValue({
      success: true,
      payments: [{ id: 43, status: 'processing' }],
    });

    const result = await handleChargeAmountDivergence({
      data: baseDivergenceBody,
      snapshotIds: [42, 43],
      endpoint: '/api/scheduled-payments/pay-combined',
      method: 'POST',
      context: 'combined',
    });

    expect(result.classification).toBe('already_paid');
    expect(result.stillPayableCount).toBe(0);
    expect(result.missingCount).toBe(1);
  });

  it('classifies as balance_changed (medium severity) when at least one snapshot row is still pending', async () => {
    getQueryDataMock.mockReturnValue({
      success: true,
      payments: [
        { id: 42, status: 'pending' },
        { id: 43, status: 'overdue' },
      ],
    });

    const result = await handleChargeAmountDivergence({
      data: { ...baseDivergenceBody, serverChargeAmount: 4250, actualChargeAmount: 4250 },
      snapshotIds: [42, 43],
      endpoint: '/api/scheduled-payments/pay-combined',
      method: 'POST',
      context: 'combined',
    });

    expect(result.classification).toBe('balance_changed');
    expect(result.stillPayableCount).toBe(2);
    expect(result.serverChargeAmount).toBe(4250);
    const [message, statusCode, endpoint, method, metadata, severity] =
      captureApiErrorMock.mock.calls[0];
    expect(message).toBe('charge_amount_diverged (balance_changed)');
    expect(statusCode).toBe(409);
    expect(endpoint).toBe('/api/scheduled-payments/pay-combined');
    expect(method).toBe('POST');
    expect(severity).toBe('medium');
    expect(metadata).toMatchObject({
      classification: 'balance_changed',
      context: 'combined',
      autoRecovered: false,
      stillPayableCount: 2,
      serverChargeAmount: 4250,
    });
  });

  it('classifies as balance_changed when one snapshot row is missing but another is still pending', async () => {
    // Mixed: 42 pruned, 43 still pending → user still owes 43, dialog
    // stays open with the fresh combined amount.
    getQueryDataMock.mockReturnValue({
      success: true,
      payments: [{ id: 43, status: 'pending' }],
    });

    const result = await handleChargeAmountDivergence({
      data: baseDivergenceBody,
      snapshotIds: [42, 43],
      endpoint: '/api/scheduled-payments/pay-combined',
      method: 'POST',
      context: 'combined',
    });

    expect(result.classification).toBe('balance_changed');
    expect(result.stillPayableCount).toBe(1);
    expect(result.missingCount).toBe(1);
  });

  it('falls back to actualChargeAmount when serverChargeAmount is missing (back-compat)', async () => {
    getQueryDataMock.mockReturnValue({
      success: true,
      payments: [{ id: 42, status: 'pending' }],
    });

    const result = await handleChargeAmountDivergence({
      data: {
        expectedChargeAmount: 5000,
        actualChargeAmount: 4250,
        creditsApplied: 750,
        originalAmount: 5000,
      },
      snapshotIds: [42],
      endpoint: '/api/scheduled-payments/pay',
      method: 'POST',
      context: 'single',
    });

    expect(result.serverChargeAmount).toBe(4250);
  });

  it('awaits the full set of supporting cache invalidations alongside the critical refetch', async () => {
    getQueryDataMock.mockReturnValue({ success: true, payments: [] });

    await handleChargeAmountDivergence({
      data: baseDivergenceBody,
      snapshotIds: [42],
      endpoint: '/api/scheduled-payments/pay',
      method: 'POST',
      context: 'single',
    });

    const invalidatedKeys = invalidateQueriesMock.mock.calls.map(
      args => args[0].queryKey[0],
    );
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        '/api/scheduled-payments',
        '/api/scheduled-payments/grouped',
        '/api/parent/enrollments',
        '/api/parent/credits',
        '/api/payment-history',
        '/api/enrollments',
      ]),
    );
  });
});
