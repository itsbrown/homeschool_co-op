import { storage } from '../storage';
import { reconcileMembershipLedgerForParent } from '../lib/reconcile-membership-ledger';

export class MembershipStatusService {
  private static membershipStatusInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Calendar-driven membership lifecycle (grace / expiration). Heals drift via
   * reconcileMembershipLedgerForParent first; never recomputes amountPaid from
   * payments.metadata.membershipId (combined checkout / backfills omit that key).
   */
  static async updateAllMembershipStatuses(): Promise<void> {
    try {
      console.log('🏅 Starting membership status update job...');

      const schools = await storage.getAllSchools();
      const membershipsUpdated: number[] = [];

      for (const school of schools) {
        if (!school.membershipFeeAmount || school.membershipFeeAmount <= 0) {
          continue;
        }

        const schoolMemberships = await storage.getMembershipEnrollmentsBySchoolId(school.id);

        for (const membership of schoolMemberships) {
          try {
            const parentUser = await storage.getUser(membership.parentUserId);
            if (!parentUser) continue;

            await reconcileMembershipLedgerForParent(membership.parentUserId, school.id);

            const refreshed =
              (await storage.getMembershipEnrollmentById(membership.id)) ?? membership;
            const totalPaid = refreshed.amountPaid ?? 0;
            const membershipAmount = refreshed.amount ?? 0;
            const isFullyPaid = membershipAmount > 0 && totalPaid >= membershipAmount;

            const newStatus = this.calculateMembershipStatus(refreshed, totalPaid);

            if (this.shouldSkipStatusTransition(refreshed, newStatus, isFullyPaid)) {
              continue;
            }

            if (newStatus !== refreshed.status) {
              await storage.updateMembershipEnrollment(refreshed.id, {
                status: newStatus,
                remainingBalance: Math.max(0, membershipAmount - totalPaid),
              });

              membershipsUpdated.push(refreshed.id);
              console.log(
                `✅ Updated membership ${refreshed.id} from ${refreshed.status} to ${newStatus}`,
              );
            }
          } catch (error) {
            console.error(`❌ Error updating membership ${membership.id}:`, error);
            continue;
          }
        }
      }

      console.log(
        `✅ Membership status update completed. Updated ${membershipsUpdated.length} memberships.`,
      );
    } catch (error) {
      console.error('❌ Error in membership status update job:', error);
    }
  }

  /** Prevent reverting paid/enrolled rows to pending when ledger already shows satisfaction. */
  static shouldSkipStatusTransition(
    membership: { status: string },
    newStatus: string,
    isFullyPaid: boolean,
  ): boolean {
    if (!isFullyPaid) {
      return false;
    }
    const downgradeTargets = new Set(['pending_payment', 'partial_payment', 'grace_period']);
    if (downgradeTargets.has(newStatus)) {
      return true;
    }
    if (
      (membership.status === 'enrolled' || membership.status === 'active') &&
      newStatus !== 'expired' &&
      newStatus !== membership.status
    ) {
      return true;
    }
    return false;
  }

  /**
   * Calculate the correct membership status based on dates and payment
   */
  static calculateMembershipStatus(membership: any, totalPaid: number): string {
    const now = new Date();
    const expirationDate = new Date(membership.expirationDate);

    let gracePeriodEnd: Date;
    if (membership.gracePeriodEnd) {
      gracePeriodEnd = new Date(membership.gracePeriodEnd);
    } else {
      gracePeriodEnd = new Date(expirationDate);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 30);
    }

    const remainingBalance = membership.amount - totalPaid;

    if (remainingBalance <= 0) {
      if (now > gracePeriodEnd) {
        return 'expired';
      }
      return 'enrolled';
    }
    if (now > gracePeriodEnd) {
      return 'expired';
    }
    if (now > expirationDate) {
      return 'grace_period';
    }
    if (totalPaid > 0) {
      return 'partial_payment';
    }
    return 'pending_payment';
  }

  /**
   * Get membership status summary for a school
   */
  static async getSchoolMembershipSummary(schoolId: number): Promise<{
    total: number;
    active: number;
    pending: number;
    partial: number;
    gracePeriod: number;
    expired: number;
  }> {
    try {
      const memberships = await storage.getMembershipEnrollmentsBySchoolId(schoolId);

      const summary = {
        total: memberships.length,
        active: 0,
        pending: 0,
        partial: 0,
        gracePeriod: 0,
        expired: 0,
      };

      memberships.forEach((membership) => {
        switch (membership.status) {
          case 'active':
          case 'enrolled':
            summary.active++;
            break;
          case 'pending_payment':
            summary.pending++;
            break;
          case 'partial_payment':
            summary.partial++;
            break;
          case 'grace_period':
            summary.gracePeriod++;
            break;
          case 'expired':
            summary.expired++;
            break;
          default:
            summary.pending++;
        }
      });

      return summary;
    } catch (error) {
      console.error(`❌ Error getting membership summary for school ${schoolId}:`, error);
      throw error;
    }
  }

  /**
   * Get memberships expiring soon (within next 30 days)
   */
  static async getMembershipsExpiringSoon(
    schoolId: number,
    daysAhead: number = 30,
  ): Promise<any[]> {
    try {
      const memberships = await storage.getMembershipEnrollmentsBySchoolId(schoolId);
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(now.getDate() + daysAhead);

      return memberships.filter((membership) => {
        const expirationDate = new Date(membership.expirationDate);
        return expirationDate >= now && expirationDate <= futureDate;
      });
    } catch (error) {
      console.error(`❌ Error getting expiring memberships for school ${schoolId}:`, error);
      throw error;
    }
  }

  /**
   * Initialize membership status update job (run daily)
   */
  static initializeMembershipStatusJob(): void {
    if (this.membershipStatusInterval) {
      console.log('ℹ️ Membership status update job already running; skipping duplicate start');
      return;
    }

    this.updateAllMembershipStatuses().catch((error) => {
      console.error('❌ Initial membership status update failed:', error);
    });

    this.membershipStatusInterval = setInterval(() => {
      this.updateAllMembershipStatuses().catch((error) => {
        console.error('❌ Scheduled membership status update failed:', error);
      });
    }, 24 * 60 * 60 * 1000);
    this.membershipStatusInterval.unref?.();

    console.log('✅ Membership status update job initialized - will run every 24 hours');
  }

  static stopMembershipStatusJob(): void {
    if (this.membershipStatusInterval) {
      clearInterval(this.membershipStatusInterval);
      this.membershipStatusInterval = null;
      console.log('🛑 Membership status update job stopped');
    }
  }
}
