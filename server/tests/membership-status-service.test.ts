import { describe, it, expect } from '@jest/globals';
import { MembershipStatusService } from '../services/membership-status-service';

describe('MembershipStatusService.shouldSkipStatusTransition', () => {
  it('blocks downgrade from enrolled when ledger shows fully paid', () => {
    expect(
      MembershipStatusService.shouldSkipStatusTransition(
        { status: 'enrolled' },
        'pending_payment',
        true,
      ),
    ).toBe(true);
    expect(
      MembershipStatusService.shouldSkipStatusTransition(
        { status: 'enrolled' },
        'partial_payment',
        true,
      ),
    ).toBe(true);
  });

  it('allows transition to expired when fully paid and term ended', () => {
    expect(
      MembershipStatusService.shouldSkipStatusTransition(
        { status: 'enrolled' },
        'expired',
        true,
      ),
    ).toBe(false);
  });

  it('allows pending transitions when not fully paid', () => {
    expect(
      MembershipStatusService.shouldSkipStatusTransition(
        { status: 'pending_payment' },
        'grace_period',
        false,
      ),
    ).toBe(false);
  });
});
