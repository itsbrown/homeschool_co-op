/**
 * Regression guards for enrollment balance SQL (no database required).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from '@jest/globals';
import { getTableColumns } from 'drizzle-orm';
import { programEnrollments } from '@shared/schema';

const financialReportsSource = readFileSync(
  join(__dirname, '../../api/financial-reports.ts'),
  'utf8',
);

const enrollmentBalanceSource = readFileSync(
  join(__dirname, '../../lib/enrollment-balance.ts'),
  'utf8',
);

describe('enrollment-balance SQL regression guards', () => {
  it('financial-reports summary does not query effective_balance column directly', () => {
    expect(financialReportsSource).not.toMatch(/SUM\(effective_balance\)/);
    expect(financialReportsSource).not.toMatch(/[`'"]effective_balance > 0[`'"]/);
    expect(financialReportsSource).toContain('sqlSumEnrollmentEffectiveBalance');
    expect(financialReportsSource).toContain('tuitionOutstandingCents');
    expect(financialReportsSource).toContain('membershipOutstandingCents');
    expect(financialReportsSource).not.toMatch(/programEnrollments\.compAmountCents/);
  });

  it('enrollment-balance helpers use the canonical formula in SQL templates', () => {
    expect(enrollmentBalanceSource).toMatch(
      /sql`GREATEST\(0, \$\{programEnrollments\.totalCost\} - \$\{programEnrollments\.totalPaid\} - COALESCE\(comp_amount_cents, 0\)\)`/,
    );
  });

  it('Drizzle schema exposes totalCost/totalPaid but not compAmountCents', () => {
    const columns = getTableColumns(programEnrollments);
    expect(columns.compAmountCents).toBeUndefined();
    expect(columns.totalCost).toBeDefined();
    expect(columns.totalPaid).toBeDefined();
  });
});
