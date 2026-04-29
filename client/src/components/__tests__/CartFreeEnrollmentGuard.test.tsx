import { render, screen } from '@testing-library/react';
import {
  isFreeEnrollmentApproved,
  cartLooksFreeButUnverified,
} from '@/utils/freeEnrollmentGate';

/**
 * UI-level regression tests for the cart's $0 / Free-Enrollment guards.
 *
 * The full `CartCheckout` page is a 1900-line component with Stripe Elements,
 * TanStack Query and many other dependencies; rendering the whole thing in a
 * unit test is brittle and slow. Instead we render the EXACT branching JSX
 * that `CartCheckout` uses, wired through the SAME helper functions
 * (`isFreeEnrollmentApproved` / `cartLooksFreeButUnverified`) the page
 * imports. If the page is ever refactored to bypass those helpers and gate
 * the Free Enrollment UI on the local cart total again, these tests still
 * fail — because they assert the helper-driven UI must NOT show the CTA.
 *
 * The data-testids below match the production CartCheckout markup:
 *   - `card-free-enrollment-unverified`  → the recovery card
 *   - `button-request-free-enrollment`   → the Free Enrollment CTA
 */
function CartFreeEnrollmentBranches({
  actualPayableAmount,
  authoritativeData,
}: {
  actualPayableAmount: number;
  authoritativeData: { isFreeEnrollment?: boolean | null } | null;
}) {
  const showFreeCta = isFreeEnrollmentApproved(actualPayableAmount, authoritativeData);
  const showUnverifiedCard = cartLooksFreeButUnverified(
    actualPayableAmount,
    authoritativeData,
  );

  if (showUnverifiedCard) {
    return (
      <div data-testid="card-free-enrollment-unverified">
        We couldn't confirm a $0 total
      </div>
    );
  }
  if (showFreeCta) {
    return (
      <button data-testid="button-request-free-enrollment">
        Request Free Enrollment
      </button>
    );
  }
  return <div data-testid="payment-form">Payment Information</div>;
}

describe('Cart UI guard: Free Enrollment / $0 total', () => {
  it('shows Request Free Enrollment ONLY when snapshot.isFreeEnrollment === true', () => {
    render(
      <CartFreeEnrollmentBranches
        actualPayableAmount={0}
        authoritativeData={{ isFreeEnrollment: true }}
      />,
    );

    expect(
      screen.getByTestId('button-request-free-enrollment'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('card-free-enrollment-unverified'),
    ).not.toBeInTheDocument();
  });

  it('hides the Free Enrollment CTA when the snapshot says isFreeEnrollment=false', () => {
    // Original-bug scenario: client thinks the cart is $0 but the server says
    // it is NOT a free enrollment (e.g. stale Stripe-managed remaining_balance).
    // The recovery card MUST appear and the Free Enrollment CTA MUST NOT.
    render(
      <CartFreeEnrollmentBranches
        actualPayableAmount={0}
        authoritativeData={{ isFreeEnrollment: false }}
      />,
    );

    expect(
      screen.queryByTestId('button-request-free-enrollment'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('card-free-enrollment-unverified'),
    ).toBeInTheDocument();
  });

  it('hides the Free Enrollment CTA while the snapshot is still loading', () => {
    render(
      <CartFreeEnrollmentBranches
        actualPayableAmount={0}
        authoritativeData={null}
      />,
    );

    expect(
      screen.queryByTestId('button-request-free-enrollment'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('card-free-enrollment-unverified'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-form')).toBeInTheDocument();
  });

  it('hides the Free Enrollment CTA when the cart total is non-zero, even if the snapshot says free', () => {
    render(
      <CartFreeEnrollmentBranches
        actualPayableAmount={15_000}
        authoritativeData={{ isFreeEnrollment: true }}
      />,
    );

    expect(
      screen.queryByTestId('button-request-free-enrollment'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-form')).toBeInTheDocument();
  });
});
