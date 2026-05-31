/**
 * Regression guards for financial collections module (no database required).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from '@jest/globals';

const financialCollectionsSource = readFileSync(
  join(__dirname, '../../lib/financial-collections.ts'),
  'utf8',
);

const financialReportsSource = readFileSync(
  join(__dirname, '../../api/financial-reports.ts'),
  'utf8',
);

describe('financial-collections regression guards', () => {
  it('uses enrollment effective balance helpers (not effective_balance column)', () => {
    expect(financialCollectionsSource).toContain('sqlEnrollmentEffectiveBalanceColumn');
    expect(financialCollectionsSource).toContain('sqlEnrollmentEffectiveBalancePositive');
    expect(financialCollectionsSource).not.toMatch(/effective_balance/);
  });

  it('exposes collections and outstanding builders plus shared auto-pay fetch', () => {
    expect(financialCollectionsSource).toContain('export async function buildOutstandingBalanceRows');
    expect(financialCollectionsSource).toContain('export async function buildCollectionsOverview');
    expect(financialCollectionsSource).toContain('export async function fetchAutoPayHistoryRecords');
  });

  it('rolls up family totals from enrollment remaining balance, not installment row amounts', () => {
    expect(financialCollectionsSource).toContain('seenEnrollments');
    expect(financialCollectionsSource).toContain('enrollmentRemainingBalance');
    expect(financialCollectionsSource).not.toMatch(
      /acc\[email\]\.totalOutstandingCents \+= balance\.amount/,
    );
  });

  it('includes membership owed rows in outstanding balances', () => {
    expect(financialCollectionsSource).toContain("type: 'membership'");
    expect(financialCollectionsSource).toContain('MEMBERSHIP_OWED_STATUSES');
    expect(financialCollectionsSource).toContain('membershipOutstandingCents');
    expect(financialCollectionsSource).toContain('tuitionOutstandingCents');
  });

  it('financial-reports does not call missing storage.getAutoPayHistory', () => {
    expect(financialReportsSource).not.toContain('getAutoPayHistory');
    expect(financialReportsSource).toContain('fetchAutoPayHistoryRecords');
    expect(financialReportsSource).toContain('buildCollectionsOverview');
    expect(financialReportsSource).toContain('/collections-overview');
  });
});
