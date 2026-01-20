/**
 * Backup script for scheduled_payments table
 * Creates a backup before running reconciliation
 * 
 * Usage: npx tsx server/scripts/backup-scheduled-payments.ts
 */

import { getDb } from '../db';
import { sql } from 'drizzle-orm';
import { scheduledPayments } from '../../shared/schema';
import fs from 'fs';
import path from 'path';

async function backupScheduledPayments() {
  console.log('📦 Starting scheduled_payments backup...');
  
  const db = await getDb();
  
  try {
    // Get current timestamp for backup naming
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    
    // Step 1: Create backup table in database
    console.log(`📋 Creating backup table: scheduled_payments_backup`);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scheduled_payments_backup AS 
      SELECT *, NOW() as backup_created_at FROM scheduled_payments WHERE 1=0
    `);
    
    // Insert all current data with timestamp
    await db.execute(sql`
      INSERT INTO scheduled_payments_backup 
      SELECT *, NOW() as backup_created_at FROM scheduled_payments
    `);
    
    // Step 2: Also export to JSON file for extra safety
    const allPayments = await db.select().from(scheduledPayments);
    
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const backupFile = path.join(backupDir, `scheduled_payments_${timestamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(allPayments, null, 2));
    
    console.log(`✅ Backup complete!`);
    console.log(`   - Database backup table: scheduled_payments_backup`);
    console.log(`   - JSON backup file: ${backupFile}`);
    console.log(`   - Total records backed up: ${allPayments.length}`);
    
    // Show summary by status
    const statusCounts = allPayments.reduce((acc: Record<string, number>, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log(`\n📊 Status breakdown:`);
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`   - ${status}: ${count}`);
    });
    
    return {
      success: true,
      recordCount: allPayments.length,
      backupFile,
      statusCounts
    };
    
  } catch (error) {
    console.error('❌ Backup failed:', error);
    throw error;
  }
}

// Run if called directly
backupScheduledPayments()
  .then(result => {
    console.log('\n✅ Backup completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Backup failed:', error);
    process.exit(1);
  });

export { backupScheduledPayments };
