import { storage } from '../storage';
import { MembershipService } from './membership-service';

export class MembershipStatusService {
  private static membershipStatusInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Updates all membership statuses based on current date and payment status
   */
  static async updateAllMembershipStatuses(): Promise<void> {
    try {
      console.log('🏅 Starting membership status update job...');
      
      // Get all schools to check their membership enrollments
      const schools = await storage.getAllSchools();
      const membershipsUpdated: number[] = [];
      
      for (const school of schools) {
        if (!school.membershipFeeAmount || school.membershipFeeAmount <= 0) {
          continue; // Skip schools without membership fees
        }
        
        const schoolMemberships = await storage.getMembershipEnrollmentsBySchoolId(school.id);
        
        for (const membership of schoolMemberships) {
          try {
            // Get payment history for this parent
            const parentUser = await storage.getUser(membership.parentUserId);
            if (!parentUser) continue;
            
            const paymentHistory = await storage.getPaymentsByParentEmail(parentUser.email);
            const membershipPayments = paymentHistory.filter(p => 
              p.metadata?.membershipId === membership.id &&
              ['completed', 'succeeded'].includes(p.status)
            );
            
            const totalPaid = membershipPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
            
            // Calculate new status based on date and payment
            const newStatus = this.calculateMembershipStatus(membership, totalPaid);
            
            if (newStatus !== membership.status) {
              await storage.updateMembershipEnrollment(membership.id, {
                status: newStatus,
                amountPaid: totalPaid,
                remainingBalance: membership.amount - totalPaid
              });
              
              membershipsUpdated.push(membership.id);
              console.log(`✅ Updated membership ${membership.id} from ${membership.status} to ${newStatus}`);
            }
            
          } catch (error) {
            console.error(`❌ Error updating membership ${membership.id}:`, error);
            continue;
          }
        }
      }
      
      console.log(`✅ Membership status update completed. Updated ${membershipsUpdated.length} memberships.`);
      
    } catch (error) {
      console.error('❌ Error in membership status update job:', error);
    }
  }
  
  /**
   * Calculate the correct membership status based on dates and payment
   */
  static calculateMembershipStatus(membership: any, totalPaid: number): string {
    const now = new Date();
    const expirationDate = new Date(membership.expirationDate);
    
    // Handle null/undefined gracePeriodEnd by defaulting to expirationDate + 30 days
    // This prevents new Date(null) from creating epoch date (1970) which causes false expiration
    let gracePeriodEnd: Date;
    if (membership.gracePeriodEnd) {
      gracePeriodEnd = new Date(membership.gracePeriodEnd);
    } else {
      // Fallback: use expiration date + 30 days as grace period end
      gracePeriodEnd = new Date(expirationDate);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 30);
    }
    
    const remainingBalance = membership.amount - totalPaid;
    
    // If fully paid - membership stays enrolled through the paid term
    // Grace period only applies to UNPAID renewals
    if (remainingBalance <= 0) {
      // Check if past grace period (term completely ended)
      if (now > gracePeriodEnd) {
        return 'expired'; // Fully paid but the entire term + grace has passed
      } else {
        return 'enrolled'; // Fully paid - stays enrolled through the entire term
      }
    } 
    // If not fully paid - subject to grace period rules
    else {
      // Check if expired (past grace period)
      if (now > gracePeriodEnd) {
        return 'expired'; // Not paid and grace period ended
      } else if (now > expirationDate) {
        return 'grace_period'; // Not paid but within grace period for late payment
      } else {
        // Not expired yet, check payment status
        if (totalPaid > 0) {
          return 'partial_payment'; // Some payment made
        } else {
          return 'pending_payment'; // No payment made
        }
      }
    }
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
        expired: 0
      };
      
      memberships.forEach(membership => {
        switch (membership.status) {
          case 'active':
          case 'enrolled': // 'enrolled' is the canonical active status
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
            summary.pending++; // Default unknown statuses to pending
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
  static async getMembershipsExpiringSoon(schoolId: number, daysAhead: number = 30): Promise<any[]> {
    try {
      const memberships = await storage.getMembershipEnrollmentsBySchoolId(schoolId);
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(now.getDate() + daysAhead);
      
      return memberships.filter(membership => {
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

    // Run immediately
    this.updateAllMembershipStatuses().catch((error) => {
      console.error('❌ Initial membership status update failed:', error);
    });
    
    // Then run every 24 hours
    this.membershipStatusInterval = setInterval(() => {
      this.updateAllMembershipStatuses().catch((error) => {
        console.error('❌ Scheduled membership status update failed:', error);
      });
    }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
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