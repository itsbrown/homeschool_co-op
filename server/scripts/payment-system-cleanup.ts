/**
 * Payment System Cleanup Script
 * 
 * This script:
 * 1. Migrates all legacy enrollments to new Stripe system
 * 2. Standardizes enrollment data structure
 * 3. Removes inconsistencies between old and new payment systems
 * 4. Ensures all enrollments use Stripe-managed payment status
 */

import { MemStorage } from '../storage';

export class PaymentSystemCleanup {
  constructor(private storage: MemStorage) {}

  /**
   * Run the complete cleanup process
   */
  async runCleanup(): Promise<void> {
    console.log('🧹 Starting Payment System Cleanup...');

    try {
      // Step 1: Analyze current state
      await this.analyzeCurrentState();

      // Step 2: Migrate legacy enrollments
      await this.migrateLegacyEnrollments();

      // Step 3: Clear legacy payment data
      await this.clearLegacyPaymentData();

      // Step 4: Validate cleanup results
      await this.validateCleanupResults();

      console.log('✅ Payment system cleanup completed successfully!');
      
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Analyze current payment system state
   */
  private async analyzeCurrentState(): Promise<void> {
    console.log('🔍 Analyzing current payment system state...');

    const allEnrollments = await this.storage.getAllEnrollments();
    console.log(`📋 Total enrollments found: ${allEnrollments.length}`);

    // Categorize enrollments
    const legacyEnrollments = allEnrollments.filter(e => 
      e.status === 'pending_payment' || 
      !e.paymentSystemVersion ||
      e.paymentSystemVersion !== 'v2_stripe'
    );

    const stripeEnrollments = allEnrollments.filter(e => 
      e.paymentSystemVersion === 'v2_stripe' && 
      e.paymentStatus === 'stripe_managed'
    );

    console.log(`📊 Legacy enrollments (need migration): ${legacyEnrollments.length}`);
    console.log(`✅ Stripe enrollments (already migrated): ${stripeEnrollments.length}`);

    // Show details of legacy enrollments
    if (legacyEnrollments.length > 0) {
      console.log('\n🔍 Legacy enrollments to migrate:');
      legacyEnrollments.forEach(enrollment => {
        console.log(`  - ${enrollment.childName} | ${enrollment.className} | Status: ${enrollment.status} | Amount: ${enrollment.amount || 0}`);
      });
    }

    // Check for scheduled payments
    const scheduledPayments = await this.storage.getAllScheduledPayments();
    console.log(`📅 Legacy scheduled payments found: ${scheduledPayments.length}`);
  }

  /**
   * Migrate all legacy enrollments to new Stripe system
   */
  private async migrateLegacyEnrollments(): Promise<void> {
    console.log('🔄 Migrating legacy enrollments to Stripe system...');

    const allEnrollments = await this.storage.getAllEnrollments();
    let migratedCount = 0;

    for (const enrollment of allEnrollments) {
      const needsMigration = 
        enrollment.status === 'pending_payment' ||
        !enrollment.paymentSystemVersion ||
        enrollment.paymentSystemVersion !== 'v2_stripe' ||
        !enrollment.paymentStatus;

      if (needsMigration) {
        try {
          // Determine the class price for totalCost
          let totalCost = enrollment.totalCost;
          if (!totalCost && enrollment.classId) {
            const classData = await this.storage.getClassById(enrollment.classId);
            totalCost = classData?.price || 30000; // Default to $300 if not found
          }
          if (!totalCost && enrollment.programId) {
            const classData = await this.storage.getClassById(enrollment.programId);
            totalCost = classData?.price || 30000; // Default to $300 if not found
          }

          // Create the migrated enrollment data
          const migratedEnrollment = {
            ...enrollment,
            // Standardize payment fields
            totalCost: totalCost || 30000,
            totalPaid: enrollment.totalPaid || enrollment.amount || 0,
            remainingBalance: totalCost ? totalCost - (enrollment.totalPaid || enrollment.amount || 0) : totalCost || 30000,
            
            // Set new Stripe system fields
            paymentSystemVersion: 'v2_stripe',
            paymentStatus: 'stripe_managed',
            status: 'enrolled', // All migrated enrollments are enrolled
            
            // Clear legacy fields
            depositRequired: undefined,
            installmentsPaid: undefined,
            totalInstallments: undefined,
            nextDueDate: undefined,
            paymentPlanStatus: undefined,
            
            // Add migration timestamp
            migrationDate: new Date().toISOString(),
            migratedFrom: enrollment.status,
            
            // Ensure required dates
            createdAt: enrollment.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            enrollmentDate: enrollment.enrollmentDate || new Date()
          };

          // Update the enrollment
          await this.storage.updateEnrollment(migratedEnrollment);
          
          console.log(`✅ Migrated: ${enrollment.childName} - ${enrollment.className}`);
          migratedCount++;
          
        } catch (error) {
          console.error(`❌ Failed to migrate enrollment ${enrollment.id}:`, error);
        }
      }
    }

    console.log(`✅ Successfully migrated ${migratedCount} enrollments to Stripe system`);
  }

  /**
   * Clear legacy payment data that's no longer needed
   */
  private async clearLegacyPaymentData(): Promise<void> {
    console.log('🗑️ Clearing legacy payment data...');

    try {
      // Clear scheduled payments (now handled by Stripe)
      const scheduledPayments = await this.storage.getAllScheduledPayments();
      if (scheduledPayments.length > 0) {
        console.log(`📅 Clearing ${scheduledPayments.length} legacy scheduled payments...`);
        // Clear the scheduled payments array
        await this.storage.clearAllScheduledPayments();
        console.log('✅ Legacy scheduled payments cleared');
      }

      // Clear any legacy payment history entries that aren't from Stripe
      const paymentHistory = await this.storage.getAllPayments();
      const legacyPayments = paymentHistory.filter(p => !p.stripePaymentIntentId);
      
      if (legacyPayments.length > 0) {
        console.log(`💳 Found ${legacyPayments.length} legacy payment records (keeping Stripe payments)`);
        // Note: In a real cleanup, you might want to archive these instead of deleting
      }

    } catch (error) {
      console.error('❌ Error clearing legacy payment data:', error);
    }
  }

  /**
   * Validate that cleanup was successful
   */
  private async validateCleanupResults(): Promise<void> {
    console.log('✅ Validating cleanup results...');

    const allEnrollments = await this.storage.getAllEnrollments();
    
    // Check that all enrollments are now on Stripe system
    const nonStripeEnrollments = allEnrollments.filter(e => 
      e.paymentSystemVersion !== 'v2_stripe' || 
      e.paymentStatus !== 'stripe_managed'
    );

    if (nonStripeEnrollments.length > 0) {
      console.warn(`⚠️ ${nonStripeEnrollments.length} enrollments still not on Stripe system:`);
      nonStripeEnrollments.forEach(e => {
        console.warn(`  - ${e.childName} - ${e.className}: paymentSystemVersion=${e.paymentSystemVersion}, paymentStatus=${e.paymentStatus}`);
      });
    } else {
      console.log('✅ All enrollments successfully migrated to Stripe system');
    }

    // Check for pending_payment status
    const pendingPayments = allEnrollments.filter(e => e.status === 'pending_payment');
    if (pendingPayments.length > 0) {
      console.warn(`⚠️ ${pendingPayments.length} enrollments still have 'pending_payment' status`);
    } else {
      console.log('✅ No enrollments with legacy pending_payment status found');
    }

    // Summary
    console.log('\n📊 Cleanup Summary:');
    console.log(`  Total enrollments: ${allEnrollments.length}`);
    console.log(`  Stripe-managed: ${allEnrollments.filter(e => e.paymentSystemVersion === 'v2_stripe').length}`);
    console.log(`  Enrolled status: ${allEnrollments.filter(e => e.status === 'enrolled').length}`);
    console.log(`  Legacy status remaining: ${nonStripeEnrollments.length}`);
  }

  /**
   * Emergency rollback function (use with caution)
   */
  async rollbackMigration(): Promise<void> {
    console.log('🔄 Rolling back migration...');
    
    // This would restore from backup if needed
    console.warn('⚠️ Rollback functionality requires manual backup restoration');
    console.warn('⚠️ Please restore from backup files in data/backups/ if needed');
  }
}

/**
 * Quick script to run cleanup
 */
export async function runPaymentSystemCleanup(): Promise<void> {
  const storage = new MemStorage();
  const cleanup = new PaymentSystemCleanup(storage);
  
  await cleanup.runCleanup();
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runPaymentSystemCleanup()
    .then(() => {
      console.log('🎉 Payment system cleanup completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Cleanup failed:', error);
      process.exit(1);
    });
}