/**
 * Grant Verryluz Pagan a $90 sibling discount credit (prod one-off).
 *
 * Run:
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/grant-verryluz-sibling-discount-credit.ts
 */

import { storage } from '../storage';

const USER_ID = 67;
const SCHOOL_ID = 2;
const AMOUNT_CENTS = 9000;

async function main() {
  const user = await storage.getUser(USER_ID);
  if (!user || user.email !== 'verryluzpagan@yahoo.com') {
    throw new Error(`User mismatch: ${JSON.stringify({ id: user?.id, email: user?.email })}`);
  }

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const credit = await storage.createCredit({
    userId: USER_ID,
    schoolId: SCHOOL_ID,
    creditType: 'manual',
    sourceType: 'sibling_discount',
    creditAmountCents: AMOUNT_CENTS,
    status: 'approved',
    title: 'Sibling discount',
    description: 'Sibling discount',
    notes: 'Admin grant — sibling discount for Verryluz Pagan',
    expiresAt,
    approvedBy: null,
    approvedAt: new Date(),
  });

  const available = await storage.getTotalAvailableCredits(USER_ID);
  console.log(
    JSON.stringify(
      {
        creditId: credit.id,
        title: credit.title,
        amountCents: credit.creditAmountCents,
        status: credit.status,
        availableCreditCents: available,
        availableDollars: (available / 100).toFixed(2),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
