import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function restoreCredits() {
  console.log('🔍 Analyzing credits for user_id = 10...\n');
  
  try {
    const creditsResult = await pool.query(`
      SELECT id, credit_amount_cents, used_amount_cents, status, credit_type, title, created_at
      FROM credits 
      WHERE user_id = 10 
      ORDER BY id DESC
    `);
    
    console.log('Current credits:');
    console.table(creditsResult.rows.map(r => ({
      id: r.id,
      amount: `$${(r.credit_amount_cents / 100).toFixed(2)}`,
      used: `$${(r.used_amount_cents / 100).toFixed(2)}`,
      remaining: `$${((r.credit_amount_cents - r.used_amount_cents) / 100).toFixed(2)}`,
      status: r.status,
      type: r.credit_type,
      title: r.title?.substring(0, 40)
    })));
    
    const totalCredits = creditsResult.rows.reduce((sum, r) => sum + r.credit_amount_cents, 0);
    const totalUsed = creditsResult.rows.reduce((sum, r) => sum + r.used_amount_cents, 0);
    const totalAvailable = totalCredits - totalUsed;
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total credits granted: $${(totalCredits / 100).toFixed(2)}`);
    console.log(`   Total used: $${(totalUsed / 100).toFixed(2)}`);
    console.log(`   Current available balance: $${(totalAvailable / 100).toFixed(2)}`);
    
    const usageLogsResult = await pool.query(`
      SELECT ucl.id, ucl.credit_id, ucl.amount_cents, ucl.description, ucl.created_at, ucl.payment_history_id
      FROM unified_credit_usage_logs ucl
      JOIN credits c ON ucl.credit_id = c.id
      WHERE c.user_id = 10
      ORDER BY ucl.created_at DESC
      LIMIT 20
    `);
    
    console.log('\n📋 Recent credit usage logs:');
    console.table(usageLogsResult.rows.map(r => ({
      log_id: r.id,
      credit_id: r.credit_id,
      amount: `$${(r.amount_cents / 100).toFixed(2)}`,
      payment_id: r.payment_history_id || 'none',
      date: r.created_at?.toISOString().split('T')[0],
      desc: r.description?.substring(0, 50)
    })));
    
    const orphanedLogsResult = await pool.query(`
      SELECT ucl.id, ucl.credit_id, ucl.amount_cents, ucl.description, ucl.created_at
      FROM unified_credit_usage_logs ucl
      JOIN credits c ON ucl.credit_id = c.id
      WHERE c.user_id = 10
        AND ucl.payment_history_id IS NULL
      ORDER BY ucl.created_at DESC
    `);
    
    if (orphanedLogsResult.rows.length > 0) {
      console.log('\n⚠️  ORPHANED USAGE LOGS (no associated payment - likely from failed checkouts):');
      console.table(orphanedLogsResult.rows.map(r => ({
        log_id: r.id,
        credit_id: r.credit_id,
        amount: `$${(r.amount_cents / 100).toFixed(2)}`,
        date: r.created_at?.toISOString().split('T')[0],
        desc: r.description?.substring(0, 50)
      })));
      
      const orphanedTotal = orphanedLogsResult.rows.reduce((sum, r) => sum + r.amount_cents, 0);
      console.log(`\n💰 Total orphaned credits: $${(orphanedTotal / 100).toFixed(2)}`);
      
      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      
      const answer = await new Promise<string>(resolve => {
        rl.question('\nRestore these orphaned credits? (yes/no): ', resolve);
      });
      rl.close();
      
      if (answer.toLowerCase() !== 'yes') {
        console.log('❌ Restoration cancelled.');
        return;
      }
      
      console.log('\n🔄 Restoring credits...');
      
      for (const log of orphanedLogsResult.rows) {
        const creditResult = await pool.query(`
          SELECT id, credit_amount_cents, used_amount_cents, status 
          FROM credits WHERE id = $1
        `, [log.credit_id]);
        
        if (creditResult.rows.length > 0) {
          const credit = creditResult.rows[0];
          const newUsed = Math.max(0, credit.used_amount_cents - log.amount_cents);
          const newStatus = newUsed === 0 ? 'approved' : 
                           newUsed < credit.credit_amount_cents ? 'partially_used' : 'used';
          
          await pool.query(`
            UPDATE credits 
            SET used_amount_cents = $1, status = $2, updated_at = NOW()
            WHERE id = $3
          `, [newUsed, newStatus, credit.id]);
          
          await pool.query(`DELETE FROM unified_credit_usage_logs WHERE id = $1`, [log.id]);
          
          console.log(`   ✅ Restored $${(log.amount_cents / 100).toFixed(2)} to credit #${credit.id}`);
        }
      }
      
      const verifyResult = await pool.query(`
        SELECT 
          SUM(credit_amount_cents) as total,
          SUM(used_amount_cents) as used,
          SUM(credit_amount_cents - used_amount_cents) as available
        FROM credits 
        WHERE user_id = 10
      `);
      
      const final = verifyResult.rows[0];
      console.log(`\n✅ Restoration complete!`);
      console.log(`   New available balance: $${(final.available / 100).toFixed(2)}`);
    } else {
      console.log('\n✅ No orphaned credit usage logs found. All credits properly accounted for.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

restoreCredits();
