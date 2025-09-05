import express from 'express';
import { storage } from '../storage';
import { StripeEnrollmentMigration } from '../scripts/migrate-to-stripe';

const router = express.Router();

/**
 * Migration API endpoints for moving to Stripe native payments
 */

// Get migration status
router.get('/status', async (req, res) => {
  try {
    // Use the shared storage instance
    const migration = new StripeEnrollmentMigration(storage);
    
    const status = await migration.getMigrationStatus();
    
    res.json({
      success: true,
      ...status,
      message: `${status.migratedEnrollments} of ${status.totalEnrollments} enrollments migrated to Stripe`
    });
  } catch (error) {
    console.error('Error getting migration status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get migration status'
    });
  }
});

// Run full migration
router.post('/run', async (req, res) => {
  try {
    // Use the shared storage instance
    const migration = new StripeEnrollmentMigration(storage);
    
    console.log('🚀 Starting Stripe migration via API...');
    await migration.runMigration();
    
    const status = await migration.getMigrationStatus();
    
    res.json({
      success: true,
      message: 'Migration completed successfully',
      ...status
    });
  } catch (error) {
    console.error('Error running migration:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Migration failed'
    });
  }
});

// Clean slate migration (reset everything)
router.post('/clean-slate', async (req, res) => {
  try {
    // Use the shared storage instance
    const migration = new StripeEnrollmentMigration(storage);
    
    console.log('🧹 Starting clean slate migration via API...');
    await migration.cleanSlate();
    
    const status = await migration.getMigrationStatus();
    
    res.json({
      success: true,
      message: 'Clean slate migration completed - all enrollments reset to paid status',
      ...status
    });
  } catch (error) {
    console.error('Error running clean slate migration:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Clean slate migration failed'
    });
  }
});

export default router;