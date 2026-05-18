/**
 * Regression guards for scheduled-payment sync (no database required).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from '@jest/globals';

const reconciliationSource = readFileSync(
  join(__dirname, '../../services/scheduled-payment-reconciliation.ts'),
  'utf8',
);

const financialReportsSource = readFileSync(
  join(__dirname, '../../api/financial-reports.ts'),
  'utf8',
);

describe('scheduled-payment-reconciliation regression guards', () => {
  it('uses canonical effective balance (includes comp), not totalCost - totalPaid only', () => {
    expect(reconciliationSource).toContain('resolveEnrollmentOutstandingCents');
    expect(reconciliationSource).not.toMatch(/totalCost\s*-\s*totalPaid/);
    expect(reconciliationSource).not.toMatch(/getAllEnrollments\(\)/);
  });

  it('generate-missing queries enrollments scoped by schoolId', () => {
    expect(reconciliationSource).toContain('eq(programEnrollments.schoolId, schoolId)');
  });

  it('POST reconcile is rate-limited', () => {
    expect(financialReportsSource).toContain('reconcileScheduledPaymentsLimiter');
    expect(financialReportsSource).toMatch(
      /router\.post\('\/reconcile-scheduled-payments', reconcileScheduledPaymentsLimiter/,
    );
  });
});
