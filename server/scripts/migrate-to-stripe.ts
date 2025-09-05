import { MemStorage } from '../storage';
import { CurrencyUtils } from '../../shared/currency-utils';

/**
 * Migration script to move existing enrollments to Stripe-native payment system
 */
export class StripeEnrollmentMigration {
  constructor(private storage: MemStorage) {}

  /**
   * Run the complete migration
   */
  async runMigration(): Promise<void> {
    console.log('🚀 Starting Stripe migration...');

    try {
      // Step 1: Clear old payment data (already done)
      console.log('✅ Payment history cleared');

      // Step 2: Update existing enrollments with new schema fields
      await this.updateEnrollmentSchema();

      // Step 3: Mark migration as complete
      console.log('✅ Stripe migration completed successfully!');
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Update existing enrollments to include new Stripe fields
   */
  private async updateEnrollmentSchema(): Promise<void> {
    console.log('🔄 Updating enrollment schema...');

    const allEnrollments = await this.storage.getAllEnrollments();
    console.log(`📋 Found ${allEnrollments.length} enrollments to update`);

    for (const enrollment of allEnrollments) {
      try {
        // Update each enrollment with new fields
        await this.storage.updateEnrollment(enrollment.id, {
          // Set default values for new fields
          totalCost: enrollment.totalCost || 30000, // Default $300 if not set
          remainingBalance: 0, // Start with 0 balance (all paid)
          paymentSystemVersion: 'v2_stripe',
          paymentStatus: 'paid', // Mark existing as paid
          migrationDate: new Date()
        });

        console.log(`✅ Updated enrollment ${enrollment.id} for ${enrollment.childName}`);
      } catch (error) {
        console.error(`❌ Failed to update enrollment ${enrollment.id}:`, error);
      }
    }

    console.log('✅ Enrollment schema update completed');
  }

  /**
   * Clean slate - reset all payment data
   */
  async cleanSlate(): Promise<void> {
    console.log('🧹 Starting clean slate migration...');

    try {
      // Reset all enrollments to a clean state
      const allEnrollments = await this.storage.getAllEnrollments();
      
      for (const enrollment of allEnrollments) {
        await this.storage.updateEnrollment(enrollment.id, {
          totalCost: 30000, // $300 default
          totalPaid: 30000, // Fully paid
          remainingBalance: 0, // No balance
          paymentSystemVersion: 'v2_stripe',
          paymentStatus: 'paid',
          migrationDate: new Date(),
          // Clear any Stripe references (will be set when needed)
          stripeSubscriptionScheduleId: null,
          stripeCustomerId: null
        });
      }

      console.log('✅ Clean slate migration completed - all enrollments marked as paid');
    } catch (error) {
      console.error('❌ Clean slate migration failed:', error);
      throw error;
    }
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<{
    totalEnrollments: number;
    migratedEnrollments: number;
    pendingEnrollments: number;
  }> {
    const allEnrollments = await this.storage.getAllEnrollments();
    
    const migratedEnrollments = allEnrollments.filter(e => 
      e.paymentSystemVersion === 'v2_stripe'
    ).length;

    const pendingEnrollments = allEnrollments.filter(e => 
      e.paymentSystemVersion !== 'v2_stripe'
    ).length;

    return {
      totalEnrollments: allEnrollments.length,
      migratedEnrollments,
      pendingEnrollments
    };
  }
}

/**
 * Run migration if called directly
 */
if (require.main === module) {
  // This would be run via npm script
  console.log('Migration script would run here when called from command line');
}