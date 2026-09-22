import fs from 'node:fs';
import path from 'node:path';

/**
 * Boot-time init-db used to add every used credit onto every open enrollment
 * for that parent. Guard the source so a restart cannot do it again.
 */
describe('init-db must not mutate enrollment money on boot', () => {
  const src = fs.readFileSync(path.join(__dirname, '../init-db.ts'), 'utf8');

  it('does not re-apply parent-wide credit usage to total_paid', () => {
    expect(src).not.toMatch(/Applying missed credit amounts to enrollment total_paid/);
    expect(src).not.toMatch(/JOIN program_enrollments pe ON pe\.parent_id = c\.user_id/);
    expect(src).not.toMatch(/total_paid\s*=\s*pe\.total_paid\s*\+\s*cta\.total_credit_amount/);
    expect(src).toMatch(/DISABLED 2026-09-12/);
    expect(src).toMatch(/Do not restore a boot-time total_paid mutation/);
  });

  it('does not rewrite ledgers, memberships, or payment history on boot', () => {
    expect(src).not.toMatch(/description LIKE '%full payment%'/);
    expect(src).not.toMatch(/DELETE FROM stripe_payment_history/);
    expect(src).not.toMatch(/Cancelling orphaned scheduled payments/);
    expect(src).not.toMatch(/total_paid\s*=\s*7350/);
    expect(src).not.toMatch(/Cancelling orphaned pending_payment membership/);
    expect(src).toMatch(/Do not restore a boot-time ledger repair/);
  });
});
