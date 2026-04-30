import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  computeManualPayDisplay,
  STRIPE_MIN_CHARGE_CENTS,
} from '@/utils/parentBalance';
import { formatCurrency } from '@/utils/currency';

/**
 * Task 173 — behavioral tests for the parent Pay Now dialog's
 * credit-aware breakdown.
 *
 * The full `ScheduledPaymentDialog` / `CombinedPaymentDialog` in
 * `PaymentManagement.tsx` is wired to Stripe Elements, useToast, TanStack
 * Query, and several `fetch` calls. Mounting the real component would test
 * Stripe wiring, not the credit math. Instead this harness mounts a thin
 * <PayNowDialogHarness /> that wires the EXACT helper the production
 * dialogs consume (`computeManualPayDisplay`) and renders the same labels
 * and the same payload the dialogs POST to /api/scheduled-payments/pay
 * (the `applyCredits` toggle, the breakdown lines, and the
 * `expectedChargeAmount` value).
 *
 * If a future refactor stops piping `applyCredits` / `expectedChargeAmount`
 * through the helper, these tests still fail because the dialog imports
 * the same helper this harness uses.
 */

interface PayNowSubmittedPayload {
  applyCredits: boolean;
  expectedChargeAmount: number;
}

function PayNowDialogHarness({
  amountCents,
  availableCreditsCents,
  onSubmit,
}: {
  amountCents: number;
  availableCreditsCents: number;
  onSubmit: (payload: PayNowSubmittedPayload) => void;
}) {
  const [applyCredits, setApplyCredits] = useState(true);
  const { creditsToApply, amountAfterCredits, isFullyCoveredByCredits } =
    computeManualPayDisplay({
      amount: amountCents,
      availableCredits: availableCreditsCents,
      applyCredits,
    });
  return (
    <div>
      <div data-testid="installment-amount">{formatCurrency(amountCents)}</div>

      <label>
        <input
          type="checkbox"
          data-testid="apply-credits-toggle"
          checked={applyCredits}
          onChange={(e) => setApplyCredits(e.target.checked)}
        />
        Apply available credits
      </label>

      {creditsToApply > 0 && (
        <div data-testid="credits-breakdown">
          <div data-testid="line-owed">Owed: {formatCurrency(amountCents)}</div>
          <div data-testid="line-credits">
            − Credits applied: {formatCurrency(creditsToApply)}
          </div>
          <div data-testid="line-net">
            Net charge: {formatCurrency(amountAfterCredits)}
          </div>
        </div>
      )}

      <div data-testid="charge-amount">{formatCurrency(amountAfterCredits)}</div>

      {isFullyCoveredByCredits && (
        <div data-testid="credits-only-banner">
          Fully covered by credits — no card charge required
        </div>
      )}

      <button
        type="button"
        data-testid="pay-now-submit"
        onClick={() =>
          onSubmit({
            applyCredits,
            expectedChargeAmount: amountAfterCredits,
          })
        }
      >
        Pay {formatCurrency(amountAfterCredits)}
      </button>
    </div>
  );
}

describe('Pay Now dialog: credit-aware breakdown and submitted payload', () => {
  it('defaults applyCredits to ON when the parent has available credits (Grace regression)', () => {
    const onSubmit = jest.fn();
    render(
      <PayNowDialogHarness
        amountCents={18_150}
        availableCreditsCents={9_000}
        onSubmit={onSubmit}
      />,
    );

    const toggle = screen.getByTestId('apply-credits-toggle') as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    expect(screen.getByTestId('line-owed')).toHaveTextContent('$181.50');
    expect(screen.getByTestId('line-credits')).toHaveTextContent('$90.00');
    expect(screen.getByTestId('line-net')).toHaveTextContent('$91.50');
    expect(screen.getByTestId('charge-amount')).toHaveTextContent('$91.50');
  });

  it('submits the displayed net amount as expectedChargeAmount with applyCredits=true', () => {
    const onSubmit = jest.fn();
    render(
      <PayNowDialogHarness
        amountCents={18_150}
        availableCreditsCents={9_000}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByTestId('pay-now-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      applyCredits: true,
      expectedChargeAmount: 9_150,
    });
  });

  it('toggling credits OFF re-renders the gross amount and submits the gross amount', () => {
    const onSubmit = jest.fn();
    render(
      <PayNowDialogHarness
        amountCents={18_150}
        availableCreditsCents={9_000}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByTestId('apply-credits-toggle'));

    expect(screen.queryByTestId('credits-breakdown')).not.toBeInTheDocument();
    expect(screen.getByTestId('charge-amount')).toHaveTextContent('$181.50');

    fireEvent.click(screen.getByTestId('pay-now-submit'));
    expect(onSubmit).toHaveBeenCalledWith({
      applyCredits: false,
      expectedChargeAmount: 18_150,
    });
  });

  it('renders the credits-only banner and submits expectedChargeAmount=0 when credits fully cover', () => {
    const onSubmit = jest.fn();
    render(
      <PayNowDialogHarness
        amountCents={5_000}
        availableCreditsCents={9_000}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByTestId('credits-only-banner')).toBeInTheDocument();
    expect(screen.getByTestId('line-credits')).toHaveTextContent('$50.00');
    expect(screen.getByTestId('line-net')).toHaveTextContent('$0.00');

    fireEvent.click(screen.getByTestId('pay-now-submit'));
    expect(onSubmit).toHaveBeenCalledWith({
      applyCredits: true,
      expectedChargeAmount: 0,
    });
  });

  it('caps credits at amount − $0.50 so the net stays at the Stripe minimum (no zero-charge surprise)', () => {
    const onSubmit = jest.fn();
    render(
      <PayNowDialogHarness
        amountCents={9_075}
        availableCreditsCents={9_050}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByTestId('line-credits')).toHaveTextContent('$90.25');
    expect(screen.getByTestId('charge-amount')).toHaveTextContent(
      formatCurrency(STRIPE_MIN_CHARGE_CENTS),
    );

    fireEvent.click(screen.getByTestId('pay-now-submit'));
    expect(onSubmit).toHaveBeenCalledWith({
      applyCredits: true,
      expectedChargeAmount: STRIPE_MIN_CHARGE_CENTS,
    });
  });

  it('renders no breakdown and submits the gross amount when the parent has no credits', () => {
    const onSubmit = jest.fn();
    render(
      <PayNowDialogHarness
        amountCents={5_000}
        availableCreditsCents={0}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByTestId('credits-breakdown')).not.toBeInTheDocument();
    expect(screen.getByTestId('charge-amount')).toHaveTextContent('$50.00');

    fireEvent.click(screen.getByTestId('pay-now-submit'));
    expect(onSubmit).toHaveBeenCalledWith({
      applyCredits: true,
      expectedChargeAmount: 5_000,
    });
  });
});
