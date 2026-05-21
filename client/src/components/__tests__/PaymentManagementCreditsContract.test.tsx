import { readFileSync } from 'fs';
import { resolve } from 'path';
import { computeOutstandingDisplay } from '@/utils/parentBalance';
import { formatCurrency } from '@/utils/currency';

/**
 * Task 173 — Contract test pinning the wiring between `/api/parent/credits`
 * and the Outstanding Balance card in `PaymentManagement.tsx`.
 *
 * Why this exists: the credits API returns the available balance under
 * `totalAvailableCents` (a number, in cents). An earlier version of the
 * Outstanding Balance card read `creditsData?.totalAvailable`, a key that
 * does NOT exist on the response — so credits were silently treated as 0
 * and the dashboard showed the gross owed amount even when credits should
 * have reduced it. That was the exact bug the Task 173 fix was meant to
 * eliminate.
 *
 * These tests guarantee:
 *   1. The Outstanding Balance card's data wiring uses `totalAvailableCents`
 *      (read from the source file, so a future refactor that re-introduces
 *      the typo fails CI rather than silently regressing the UI).
 *   2. Given the REAL response payload shape, the credit-adjusted display
 *      math produces the expected user-visible amount.
 */

const SOURCE_PATH = resolve(
  __dirname,
  '..',
  'payments',
  'PaymentManagement.tsx',
);
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

describe('PaymentManagement → /api/parent/credits contract', () => {
  it('uses useParentCredits().totalAvailableCents (not the legacy creditsData.totalAvailable typo)', () => {
    expect(SOURCE).toMatch(/useParentCredits\s*\(/);
    expect(SOURCE).toContain('totalAvailableCents');
    const badPattern = /creditsData\?\.totalAvailable(?!Cents|Formatted)/g;
    const offenders = SOURCE.match(badPattern);
    expect(offenders).toBeNull();
  });

  it('produces the credit-adjusted display amount when the real API payload shape is used', () => {
    // Mirror the literal shape returned by `/api/parent/credits` (see
    // server/api/parent.ts ≈ line 955). Only the field this card reads is
    // exercised; the other fields are present to document the contract.
    interface ParentCreditsApiResponse {
      success: boolean;
      totalAvailableCents: number;
      totalAvailableFormatted: string;
      creditsByType: Record<string, { count: number; totalCents: number }>;
      credits: Array<{
        id: number;
        creditType: string;
        title: string;
        creditAmountCents: number;
        usedAmountCents: number;
        remainingCents: number;
        status: string;
      }>;
    }

    const apiResponse: ParentCreditsApiResponse = {
      success: true,
      totalAvailableCents: 9000, // $90 — Grace's outstanding credit
      totalAvailableFormatted: '$90.00',
      creditsByType: { manual: { count: 1, totalCents: 9000 } },
      credits: [
        {
          id: 1,
          creditType: 'manual',
          title: 'Manual credit',
          creditAmountCents: 9000,
          usedAmountCents: 0,
          remainingCents: 9000,
          status: 'approved',
        },
      ],
    };

    // Outstanding owed: $271.50 (Grace's pre-fix charged amount).
    const outstandingCents = 27_150;
    const creditsCents = apiResponse.totalAvailableCents;
    const { displayCents, showCreditsLine } = computeOutstandingDisplay(
      outstandingCents,
      creditsCents,
    );

    // Net = $271.50 − $90.00 = $181.50 (the displayed amount Grace SHOULD have been charged).
    expect(displayCents).toBe(18_150);
    expect(formatCurrency(displayCents)).toBe('$181.50');
    expect(showCreditsLine).toBe(true);
  });

  it('falls back to the gross owed amount when the API key is missing (defensive default)', () => {
    // If the response is malformed, `data?.totalAvailableCents ?? 0` (hook default)
    // must yield 0 credits — never undefined arithmetic.
    const malformed = { success: true } as unknown as { totalAvailableCents?: number };
    const creditsCents = malformed.totalAvailableCents || 0;
    const { displayCents, showCreditsLine } = computeOutstandingDisplay(
      27_150,
      creditsCents,
    );
    expect(displayCents).toBe(27_150);
    expect(showCreditsLine).toBe(false);
  });
});
