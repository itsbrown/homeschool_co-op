import express from 'express';
import { MemStorage } from '../storage';

const router = express.Router();

/**
 * Clean up legacy payment system - migrate all enrollments to Stripe
 */
router.post('/migrate-to-stripe', async (req, res) => {
  try {
    console.log('🧹 Starting payment system cleanup...');
    
    const storage = new MemStorage();
    const allEnrollments = await storage.getAllEnrollments();
    
    let migratedCount = 0;
    let errorCount = 0;
    
    console.log(`📋 Found ${allEnrollments.length} enrollments to check`);
    
    for (const enrollment of allEnrollments) {
      try {
        // Check if enrollment needs migration
        const needsMigration = 
          enrollment.status === 'pending_payment' ||
          !enrollment.paymentSystemVersion ||
          enrollment.paymentSystemVersion !== 'v2_stripe' ||
          !enrollment.paymentStatus;

        if (needsMigration) {
          console.log(`🔄 Migrating: ${enrollment.childName} - ${enrollment.className} (Status: ${enrollment.status})`);
          
          // Get class price for totalCost
          let totalCost = enrollment.totalCost;
          if (!totalCost && enrollment.classId) {
            const classData = await storage.getClassById(enrollment.classId);
            totalCost = classData?.price || 30000;
          }
          if (!totalCost && enrollment.programId) {
            const classData = await storage.getClassById(enrollment.programId);
            totalCost = classData?.price || 30000;
          }

          // Calculate migrated enrollment fields
          const totalPaid = enrollment.totalPaid || enrollment.amount || 0;
          const remainingBalance = totalCost ? totalCost - totalPaid : totalCost || 30000;
          
          // Update enrollment with Stripe system fields
          await storage.updateProgramEnrollment(enrollment.id, {
            totalCost: totalCost || 30000,
            totalPaid: totalPaid,
            remainingBalance: remainingBalance,
            paymentSystemVersion: 'v2_stripe',
            paymentStatus: 'stripe_managed',
            status: 'enrolled'
          });
          migratedCount++;
          console.log(`✅ Migrated: ${enrollment.childName} - ${enrollment.className}`);
        }
      } catch (error) {
        console.error(`❌ Failed to migrate enrollment ${enrollment.id}:`, error);
        errorCount++;
      }
    }
    
    console.log(`✅ Migration completed: ${migratedCount} enrollments migrated, ${errorCount} errors`);
    
    res.json({
      success: true,
      message: 'Payment system cleanup completed',
      migratedCount,
      errorCount,
      totalEnrollments: allEnrollments.length
    });
    
  } catch (error) {
    console.error('❌ Payment cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * Get cleanup status - analyze current payment system state
 */
router.get('/status', async (req, res) => {
  try {
    const storage = new MemStorage();
    const allEnrollments = await storage.getAllEnrollments();
    
    const legacyCount = allEnrollments.filter(e => 
      e.status === 'pending_payment' || 
      !e.paymentSystemVersion ||
      e.paymentSystemVersion !== 'v2_stripe'
    ).length;
    
    const stripeCount = allEnrollments.filter(e => 
      e.paymentSystemVersion === 'v2_stripe' && 
      e.paymentStatus === 'stripe_managed'
    ).length;
    
    const pendingPaymentCount = allEnrollments.filter(e => 
      e.status === 'pending_payment'
    ).length;
    
    res.json({
      success: true,
      total: allEnrollments.length,
      legacyCount,
      stripeCount,
      pendingPaymentCount,
      needsMigration: legacyCount > 0
    });
    
  } catch (error) {
    console.error('❌ Status check failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router;