/**
 * Simulate GET /api/billing/summary enrollment aggregation for one parent email.
 *
 *   node scripts/with-prod-env.mjs npx tsx server/scripts/diagnose-parent-billing-summary.ts --email beigel.shaley@gmail.com
 */

import { storage } from '../storage';
import { getChildrenForAuthenticatedParent, resolveParentDbUser } from '../lib/parent-auth-scope';
import { resolveEnrollmentEffectiveBalance } from '../lib/enrollment-effective-balance';

function parseEmail(): string {
  const idx = process.argv.indexOf('--email');
  const email = idx >= 0 ? process.argv[idx + 1]?.trim() : '';
  if (!email) {
    console.error('Usage: --email parent@example.com');
    process.exit(1);
  }
  return email;
}

async function main() {
  const email = parseEmail();
  const parent = await resolveParentDbUser(storage, { email });
  console.log('Parent DB user:', parent ? { id: parent.id, email: parent.email, supabaseId: parent.supabaseId } : null);

  const children = await getChildrenForAuthenticatedParent(storage, { email });
  console.log('Children:', children.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, parentId: c.parentId })));

  if (children.length === 0) {
    console.log('\nRESULT: totalBalance=0 (no children)');
    return;
  }

  const allEnrollments = [];
  for (const child of children) {
    const rows = await storage.getEnrollmentsByChildId(child.id);
    console.log(`\nEnrollments for child ${child.id}:`, rows.length);
    for (const row of rows) {
      const childMatch = children.find((c) => c.id === row.childId);
      const balance = resolveEnrollmentEffectiveBalance(row);
      console.log(
        `  enr #${row.id} childId=${row.childId} (${typeof row.childId}) match=${!!childMatch} balance=${balance}c status=${row.status} paymentStatus=${row.paymentStatus} marketplaceClassId=${row.marketplaceClassId}`,
      );
      allEnrollments.push(row);
    }
  }

  let totalBalance = 0;
  const details: Array<{ id: number; balance: number; included: boolean; reason?: string }> = [];

  for (const enrollment of allEnrollments) {
    const child = children.find((c) => c.id === enrollment.childId);
    const balance = resolveEnrollmentEffectiveBalance(enrollment);
    if (!child) {
      details.push({ id: enrollment.id, balance, included: false, reason: 'child not in parent children list (strict id match)' });
      continue;
    }
    details.push({ id: enrollment.id, balance, included: true });
    if (balance > 0) totalBalance += balance;
  }

  console.log('\n--- Billing summary simulation ---');
  console.log('totalBalance cents:', totalBalance);
  console.log('totalBalance dollars:', (totalBalance / 100).toFixed(2));
  console.log('details:', details);

  const byParentId = parent ? await storage.getProgramEnrollmentsByParent(parent.id) : [];
  console.log('\ngetProgramEnrollmentsByParent rows:', byParentId.length);
  for (const row of byParentId) {
    console.log(
      `  enr #${row.id} childId=${row.childId} balance=${resolveEnrollmentEffectiveBalance(row)}c`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
