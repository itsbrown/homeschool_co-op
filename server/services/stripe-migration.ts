import { MemStorage } from '../storage';
import { StripePaymentPlanService } from './stripe-payment-plans';
import { CurrencyUtils } from '../../shared/currency-utils';

export interface MigrationStats {
  totalEnrollments: number;
  migratedEnrollments: number;
  completedEnrollments: number;
  failedMigrations: number;
  errors: Array<{ enrollmentId: number; error: string }>;
}

export class StripeMigrationService {
  private paymentPlanService: StripePaymentPlanService;

  constructor(private storage: MemStorage) {
    this.paymentPlanService = new StripePaymentPlanService(storage);
  }

  /**
   * Migrate all existing enrollments with payment plans to Stripe
   */
  async migrateAllEnrollments(): Promise<MigrationStats> {
    console.log('🚀 Starting migration of existing enrollments to Stripe...');

    const stats: MigrationStats = {
      totalEnrollments: 0,
      migratedEnrollments: 0,
      completedEnrollments: 0,
      failedMigrations: 0,
      errors: []
    };

    try {
      // Get all enrollments that need migration
      const allEnrollments = await this.storage.getAllEnrollments();
      stats.totalEnrollments = allEnrollments.length;

      console.log(`📊 Found ${stats.totalEnrollments} total enrollments`);

      // Group enrollments by parent and outstanding balances
      const enrollmentsByParent = this.groupEnrollmentsByParent(allEnrollments);

      for (const [parentEmail, enrollments] of Object.entries(enrollmentsByParent)) {
        try {
          const result = await this.migrateParentEnrollments(parentEmail, enrollments);
          stats.migratedEnrollments += result.migrated;
          stats.completedEnrollments += result.completed;

          if (result.errors.length > 0) {
            stats.errors.push(...result.errors);
            stats.failedMigrations += result.errors.length;
          }
        } catch (error) {
          console.error(`❌ Failed to migrate enrollments for ${parentEmail}:`, error);
          enrollments.forEach(enrollment => {
            stats.errors.push({
              enrollmentId: enrollment.id,
              error: `Parent migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
          });
          stats.failedMigrations += enrollments.length;
        }
      }

      // Clean up old scheduled payments
      await this.cleanupOldScheduledPayments();

      console.log('✅ Migration completed!', stats);
      return stats;

    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Migrate enrollments for a specific parent
   */
  private async migrateParentEnrollments(
    parentEmail: string, 
    enrollments: any[]
  ): Promise<{ migrated: number; completed: number; errors: Array<{ enrollmentId: number; error: string }> }> {
    console.log(`👨‍👩‍👧‍👦 Migrating enrollments for parent: ${parentEmail}`);

    const result = { migrated: 0, completed: 0, errors: [] as Array<{ enrollmentId: number; error: string }> };

    // Separate enrollments by payment status
    const activePaymentPlanEnrollments = enrollments.filter(e => 
      e.remainingBalance && e.remainingBalance > 0 && 
      !e.stripeSubscriptionScheduleId // Not already migrated
    );

    const completedEnrollments = enrollments.filter(e => 
      !e.remainingBalance || e.remainingBalance === 0
    );

    console.log(`📋 Parent ${parentEmail}: ${activePaymentPlanEnrollments.length} active, ${completedEnrollments.length} completed`);

    // Mark completed enrollments (no migration needed)
    for (const enrollment of completedEnrollments) {
      try {
        await this.storage.updateEnrollment(enrollment.id, {
          paymentSystemVersion: 'v2_stripe',
          paymentStatus: 'paid',
          migrationDate: new Date()
        });
        result.completed++;
      } catch (error) {
        result.errors.push({
          enrollmentId: enrollment.id,
          error: `Failed to update completed enrollment: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }

    // Migrate active payment plans
    if (activePaymentPlanEnrollments.length > 0) {
      try {
        // Calculate total remaining balance
        const totalRemainingBalance = activePaymentPlanEnrollments.reduce(
          (sum, enrollment) => sum + (enrollment.remainingBalance || 0), 0
        );

        // Determine payment plan based on number of enrollments and amount
        const paymentPlan = this.determinePaymentPlan(totalRemainingBalance, activePaymentPlanEnrollments.length);

        // Create Stripe subscription schedule for remaining balance
        const schedule = await this.paymentPlanService.createEducationalPaymentPlan({
          parentEmail,
          enrollmentIds: activePaymentPlanEnrollments.map(e => e.id),
          totalAmount: totalRemainingBalance,
          paymentPlan
        });

        console.log(`✅ Created Stripe schedule ${schedule.id} for ${parentEmail}: ${CurrencyUtils.toDisplay(totalRemainingBalance)}`);
        result.migrated += activePaymentPlanEnrollments.length;

      } catch (error) {
        console.error(`❌ Failed to create Stripe schedule for ${parentEmail}:`, error);
        activePaymentPlanEnrollments.forEach(enrollment => {
          result.errors.push({
            enrollmentId: enrollment.id,
            error: `Stripe schedule creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        });
      }
    }

    return result;
  }

  /**
   * Group enrollments by parent email
   */
  private groupEnrollmentsByParent(enrollments: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    for (const enrollment of enrollments) {
      // Get parent email from child or enrollment data
      const parentEmail = enrollment.parentEmail || 
                         (enrollment.child && enrollment.child.parentEmail) ||
                         'unknown@example.com';

      if (!grouped[parentEmail]) {
        grouped[parentEmail] = [];
      }
      grouped[parentEmail].push(enrollment);
    }

    return grouped;
  }

  /**
   * Determine appropriate payment plan based on remaining balance and enrollment count
   */
  private determinePaymentPlan(totalAmount: number, enrollmentCount: number): 'deposit' | 'split' | 'monthly' | 'full' {
    // Convert cents to dollars for decision making
    const amountInDollars = totalAmount / 100;

    // If less than $100, require full payment
    if (amountInDollars < 100) {
      return 'full';
    }

    // If less than $300, offer split payment
    if (amountInDollars < 300) {
      return 'split';
    }

    // For larger amounts, offer monthly payments
    return 'monthly';
  }

  /**
   * Clean up old scheduled payments that are no longer needed
   */
  private async cleanupOldScheduledPayments(): Promise<void> {
    console.log('🧹 Cleaning up old scheduled payments...');

    try {
      // Get all scheduled payments
      const scheduledPayments = await this.storage.getAllScheduledPayments();
      
      for (const payment of scheduledPayments) {
        if (payment.status === 'pending') {
          // Cancel pending payments since we're moving to Stripe
          await this.storage.updateScheduledPaymentStatus(payment.id, 'cancelled');
          console.log(`🗑️ Cancelled scheduled payment ${payment.id}`);
        }
      }

      console.log('✅ Scheduled payments cleanup completed');
    } catch (error) {
      console.error('❌ Failed to cleanup scheduled payments:', error);
    }
  }

  /**
   * Migrate a specific enrollment to Stripe (useful for individual migrations)
   */
  async migrateSingleEnrollment(enrollmentId: number): Promise<boolean> {
    try {
      console.log(`🎯 Migrating single enrollment: ${enrollmentId}`);

      const enrollment = await this.storage.getEnrollmentById(enrollmentId);
      if (!enrollment) {
        throw new Error(`Enrollment ${enrollmentId} not found`);
      }

      // Skip if already migrated
      if (enrollment.stripeSubscriptionScheduleId) {
        console.log(`⚠️ Enrollment ${enrollmentId} already migrated to Stripe`);
        return true;
      }

      // Skip if no remaining balance
      if (!enrollment.remainingBalance || enrollment.remainingBalance <= 0) {
        await this.storage.updateEnrollment(enrollmentId, {
          paymentSystemVersion: 'v2_stripe',
          paymentStatus: 'paid',
          migrationDate: new Date()
        });
        console.log(`✅ Marked completed enrollment ${enrollmentId} as migrated`);
        return true;
      }

      // Get parent email
      const parentEmail = enrollment.parentEmail || 
                         (enrollment.child && enrollment.child.parentEmail);

      if (!parentEmail) {
        throw new Error(`No parent email found for enrollment ${enrollmentId}`);
      }

      // Create Stripe schedule for remaining balance
      const paymentPlan = this.determinePaymentPlan(enrollment.remainingBalance, 1);
      
      await this.paymentPlanService.createEducationalPaymentPlan({
        parentEmail,
        enrollmentIds: [enrollmentId],
        totalAmount: enrollment.remainingBalance,
        paymentPlan
      });

      console.log(`✅ Successfully migrated enrollment ${enrollmentId} to Stripe`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to migrate enrollment ${enrollmentId}:`, error);
      return false;
    }
  }

  /**
   * Check migration status
   */
  async getMigrationStatus(): Promise<{
    totalEnrollments: number;
    migratedToStripe: number;
    pendingMigration: number;
    completedEnrollments: number;
  }> {
    const allEnrollments = await this.storage.getAllEnrollments();
    
    const migratedToStripe = allEnrollments.filter(e => 
      e.paymentSystemVersion === 'v2_stripe' || e.stripeSubscriptionScheduleId
    ).length;

    const completedEnrollments = allEnrollments.filter(e => 
      e.paymentStatus === 'paid' || (e.remainingBalance === 0)
    ).length;

    const pendingMigration = allEnrollments.filter(e => 
      e.paymentSystemVersion !== 'v2_stripe' && 
      !e.stripeSubscriptionScheduleId &&
      e.remainingBalance > 0
    ).length;

    return {
      totalEnrollments: allEnrollments.length,
      migratedToStripe,
      pendingMigration,
      completedEnrollments
    };
  }
}