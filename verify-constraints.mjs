import postgres from 'postgres';

function buildPostgresUrl() {
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = process.env;
  
  if (!PGHOST || !PGUSER || !PGPASSWORD || !PGDATABASE) {
    return null;
  }
  
  const encodedUser = encodeURIComponent(PGUSER);
  const encodedPassword = encodeURIComponent(PGPASSWORD);
  const port = PGPORT || '5432';
  
  return `postgresql://${encodedUser}:${encodedPassword}@${PGHOST}:${port}/${PGDATABASE}?sslmode=require`;
}

async function verifyConstraints() {
  const connectionString = buildPostgresUrl();
  const sql = postgres(connectionString, { 
    prepare: false,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    console.log('✅ Verification Report for program_enrollments Table\n');
    console.log('═'.repeat(80));
    
    // Check payment_plan constraint
    console.log('\n1️⃣  PAYMENT PLAN CONSTRAINT');
    console.log('─'.repeat(80));
    const paymentPlanConstraint = await sql`
      SELECT 
        conname AS constraint_name,
        pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint 
      WHERE conrelid = 'program_enrollments'::regclass 
        AND conname = 'program_enrollments_payment_plan_check'
    `;
    
    if (paymentPlanConstraint.length > 0) {
      console.log('✅ Constraint exists');
      console.log('Definition:', paymentPlanConstraint[0].constraint_definition);
      
      // Check if biweekly is in the allowed values
      const def = paymentPlanConstraint[0].constraint_definition;
      const hasBiweekly = def.includes("'biweekly'");
      const allowsNull = def.includes('IS NULL');
      
      console.log('\nAllowed values check:');
      console.log(`  - Allows NULL: ${allowsNull ? '✅' : '❌'}`);
      console.log(`  - Allows 'full_payment': ${def.includes("'full_payment'") ? '✅' : '❌'}`);
      console.log(`  - Allows 'deposit_only': ${def.includes("'deposit_only'") ? '✅' : '❌'}`);
      console.log(`  - Allows 'biweekly': ${hasBiweekly ? '✅' : '❌'}`);
      console.log(`  - Allows 'custom': ${def.includes("'custom'") ? '✅' : '❌'}`);
    } else {
      console.log('❌ Constraint NOT found');
    }
    
    // Check payment_frequency constraint
    console.log('\n\n2️⃣  PAYMENT FREQUENCY CONSTRAINT');
    console.log('─'.repeat(80));
    const paymentFreqConstraint = await sql`
      SELECT 
        conname AS constraint_name,
        pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint 
      WHERE conrelid = 'program_enrollments'::regclass 
        AND conname = 'program_enrollments_payment_frequency_check'
    `;
    
    if (paymentFreqConstraint.length > 0) {
      console.log('✅ Constraint exists');
      console.log('Definition:', paymentFreqConstraint[0].constraint_definition);
      
      const def = paymentFreqConstraint[0].constraint_definition;
      const hasBiweekly = def.includes("'biweekly'");
      const allowsNull = def.includes('IS NULL');
      
      console.log('\nAllowed values check:');
      console.log(`  - Allows NULL: ${allowsNull ? '✅' : '❌'}`);
      console.log(`  - Allows 'weekly': ${def.includes("'weekly'") ? '✅' : '❌'}`);
      console.log(`  - Allows 'biweekly': ${hasBiweekly ? '✅' : '❌'}`);
      console.log(`  - Allows 'monthly': ${def.includes("'monthly'") ? '✅' : '❌'}`);
      console.log(`  - Allows 'one_time': ${def.includes("'one_time'") ? '✅' : '❌'}`);
    } else {
      console.log('❌ Constraint NOT found');
    }
    
    // Test insert (dry run - will rollback)
    console.log('\n\n3️⃣  DRY RUN TEST INSERT');
    console.log('─'.repeat(80));
    
    try {
      await sql.begin(async sql => {
        // This will rollback automatically
        const testInsert = await sql`
          INSERT INTO program_enrollments (
            school_id, child_id, child_name, class_name, parent_id, parent_email,
            total_cost, total_paid, remaining_balance, deposit_required,
            payment_status, payment_plan, payment_frequency, payment_system_version,
            status, enrollment_date
          ) VALUES (
            1, 1, 'Test Child', 'Test Class', 1, 'test@example.com',
            10000, 0, 10000, 0,
            'pending', 'biweekly', 'biweekly', 'v2_stripe',
            'enrolled', NOW()
          ) RETURNING id
        `;
        
        console.log('✅ Test insert successful - biweekly values accepted!');
        console.log(`Created test record ID: ${testInsert[0].id}`);
        
        // Throw to rollback
        throw new Error('ROLLBACK');
      });
    } catch (error) {
      if (error.message === 'ROLLBACK') {
        console.log('✅ Test data rolled back (no actual data created)');
      } else {
        console.log('❌ Test insert failed:', error.message);
      }
    }
    
    console.log('\n' + '═'.repeat(80));
    console.log('\n🎉 VERIFICATION COMPLETE\n');
    
  } catch (error) {
    console.error('❌ Verification error:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

verifyConstraints();
