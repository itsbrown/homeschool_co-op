import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function restoreCredits() {
  console.log('🔍 Checking credits for user_id = 10...\n');
  
  try {
    const creditsResult = await pool.query(`
      SELECT id, amount_cents, consumed_amount_cents, status, credit_type, description, created_at
      FROM credits 
      WHERE user_id = 10 
      ORDER BY id DESC
    `);
    
    console.log('Current credits:');
    console.table(creditsResult.rows.map(r => ({
      id: r.id,
      amount: `$${(r.amount_cents / 100).toFixed(2)}`,
      consumed: `$${(r.consumed_amount_cents / 100).toFixed(2)}`,
      remaining: `$${((r.amount_cents - r.consumed_amount_cents) / 100).toFixed(2)}`,
      status: r.status,
      type: r.credit_type,
      description: r.description?.substring(0, 40)
    })));
    
    const totalCredits = creditsResult.rows.reduce((sum, r) => sum + r.amount_cents, 0);
    const totalConsumed = creditsResult.rows.reduce((sum, r) => sum + r.consumed_amount_cents, 0);
    const totalAvailable = totalCredits - totalConsumed;
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total credits: $${(totalCredits / 100).toFixed(2)}`);
    console.log(`   Total consumed: $${(totalConsumed / 100).toFixed(2)}`);
    console.log(`   Available balance: $${(totalAvailable / 100).toFixed(2)}`);
    
    const targetAmount = 130000;
    const amountToRestore = targetAmount - totalAvailable;
    
    if (amountToRestore <= 0) {
      console.log(`\n✅ Credits already at or above target ($${(targetAmount / 100).toFixed(2)}). No restoration needed.`);
      return;
    }
    
    console.log(`\n🔧 Need to restore: $${(amountToRestore / 100).toFixed(2)}`);
    console.log('   This will reset consumed_amount_cents on existing credits...\n');
    
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    
    const answer = await new Promise<string>(resolve => {
      rl.question('Proceed with restoration? (yes/no): ', resolve);
    });
    rl.close();
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Restoration cancelled.');
      return;
    }
    
    let remainingToRestore = amountToRestore;
    
    for (const credit of creditsResult.rows) {
      if (remainingToRestore <= 0) break;
      if (credit.consumed_amount_cents <= 0) continue;
      
      const canRestore = Math.min(credit.consumed_amount_cents, remainingToRestore);
      const newConsumed = credit.consumed_amount_cents - canRestore;
      
      await pool.query(`
        UPDATE credits 
        SET consumed_amount_cents = $1 
        WHERE id = $2
      `, [newConsumed, credit.id]);
      
      console.log(`   ✅ Credit #${credit.id}: restored $${(canRestore / 100).toFixed(2)} (consumed: $${(credit.consumed_amount_cents / 100).toFixed(2)} → $${(newConsumed / 100).toFixed(2)})`);
      remainingToRestore -= canRestore;
    }
    
    const verifyResult = await pool.query(`
      SELECT 
        SUM(amount_cents) as total,
        SUM(consumed_amount_cents) as consumed,
        SUM(amount_cents - consumed_amount_cents) as available
      FROM credits 
      WHERE user_id = 10
    `);
    
    const final = verifyResult.rows[0];
    console.log(`\n✅ Restoration complete!`);
    console.log(`   New available balance: $${(final.available / 100).toFixed(2)}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

restoreCredits();
