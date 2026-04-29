import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static "wiring" regression test.
 *
 * The Cart and Payment Management UI guard tests render replicated branch
 * markup wired through `freeEnrollmentGate` and `parentBalance` helpers.
 * That is fast and stable, but leaves one small gap: nothing prevents a
 * future refactor from removing the helper imports and inlining the
 * (potentially buggy) gating logic again.
 *
 * This test reads the real production source files for `CartCheckout.tsx`
 * and `PaymentManagement.tsx` and asserts they continue to import and
 * call the helpers. If anyone removes the helper usage, this test fails
 * — even before any UI is rendered.
 */
const repoRoot = join(__dirname, '..', '..', '..', '..');

function readSource(relPath: string): string {
  return readFileSync(join(repoRoot, relPath), 'utf8');
}

describe('Production guard wiring — CartCheckout', () => {
  const source = readSource('client/src/pages/CartCheckout.tsx');

  it('imports both cart gating helpers from @/utils/freeEnrollmentGate', () => {
    expect(source).toMatch(
      /from\s+['"]@\/utils\/freeEnrollmentGate['"]/,
    );
    expect(source).toMatch(/isFreeEnrollmentApproved/);
    expect(source).toMatch(/cartLooksFreeButUnverified/);
  });

  it('actually invokes the helpers (not just imports them)', () => {
    // CartCheckout aliases the helper imports (e.g.
    // `isFreeEnrollmentApproved as gateIsFreeEnrollmentApproved`) and then
    // calls them. Match either the original or any aliased call site so
    // the test follows reasonable refactors but fails if the helpers are
    // dropped entirely.
    expect(source).toMatch(/(?:gate)?[Ii]sFreeEnrollmentApproved\s*\(/);
    expect(source).toMatch(/(?:gate)?[Cc]artLooksFreeButUnverified\s*\(/);
  });
});

describe('Production guard wiring — PaymentManagement', () => {
  const source = readSource('client/src/components/payments/PaymentManagement.tsx');

  it('imports the parent balance helpers from @/utils/parentBalance', () => {
    expect(source).toMatch(
      /from\s+['"]@\/utils\/parentBalance['"]/,
    );
  });

  it('uses getEnrollmentEffectiveBalance and getMembershipOutstandingBalance', () => {
    expect(source).toMatch(/getEnrollmentEffectiveBalance\s*\(/);
    expect(source).toMatch(/getMembershipOutstandingBalance\s*\(/);
  });

  it('does NOT compute outstanding from enrollment.remainingBalance directly (regression guard)', () => {
    // The whole point of the helpers is that enrollment.remainingBalance is
    // intentionally 0 for Stripe-managed plans and must NEVER be summed
    // into the parent's outstanding balance. If a future change starts
    // reading enrollment.remainingBalance again, fail loudly.
    expect(source).not.toMatch(/enrollment\.remainingBalance/);
    expect(
      /enrollments[^.]*\.\s*reduce\([^)]*remainingBalance/.test(
        source.replace(/\n/g, ' '),
      ),
    ).toBe(false);
  });
});
