/**
 * Script to create all test accounts in Supabase for testing different user roles
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Test accounts to create
const testAccounts = [
  {
    email: 'schooladmin.test@americanseekersacademy.com',
    password: 'SchoolAdmin123!',
    role: 'school_admin',
    name: 'Test School Admin',
    description: 'School administrator test account'
  },
  {
    email: 'educator.test@americanseekersacademy.com',
    password: 'Educator123!',
    role: 'educator',
    name: 'Test Educator',
    description: 'Educator/teacher test account'
  },
  {
    email: 'learner.test@americanseekersacademy.com',
    password: 'Learner123!',
    role: 'learner',
    name: 'Test Learner',
    description: 'Student/learner test account'
  }
];

async function createTestAccount(accountInfo) {
  try {
    console.log(`Creating ${accountInfo.role} test account...`);
    
    // Create auth user in Supabase
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: accountInfo.email,
      password: accountInfo.password,
      email_confirm: true,
      user_metadata: {
        full_name: accountInfo.name,
        role: accountInfo.role
      }
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        console.log(`⚠️  User ${accountInfo.email} already exists, skipping...`);
        return true;
      }
      console.error(`Error creating ${accountInfo.role} auth user:`, authError);
      return false;
    }

    console.log(`✅ Auth user created: ${authData.user.id}`);

    // Add to users table if it exists
    try {
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          firebase_uid: authData.user.id,
          email: accountInfo.email,
          role: accountInfo.role,
          name: accountInfo.name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (insertError) {
        console.log(`Note: Could not insert ${accountInfo.role} into users table:`, insertError.message);
      } else {
        console.log(`✅ ${accountInfo.role} record created in users table`);
      }
    } catch (tableError) {
      console.log(`Note: Users table may not exist for ${accountInfo.role}, skipping database insert`);
    }

    return true;
  } catch (error) {
    console.error(`❌ Error creating ${accountInfo.role} test account:`, error);
    return false;
  }
}

async function createAllTestAccounts() {
  console.log('Creating test accounts for all user roles...\n');
  
  let successCount = 0;
  
  for (const account of testAccounts) {
    const success = await createTestAccount(account);
    if (success) successCount++;
    console.log(''); // Add spacing between accounts
  }
  
  console.log(`\n🎉 Test account creation complete! ${successCount}/${testAccounts.length} accounts created successfully.\n`);
  
  console.log('📋 Test Account Summary:');
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Include the parent account we created earlier
  console.log('👨‍👩‍👧‍👦 PARENT ACCOUNT:');
  console.log('📧 Email: parent.test@americanseekersacademy.com');
  console.log('🔒 Password: TestParent123!');
  console.log('👥 Role: parent\n');
  
  testAccounts.forEach(account => {
    const roleEmoji = {
      'school_admin': '🏫',
      'educator': '👩‍🏫',
      'learner': '🎓'
    }[account.role] || '👤';
    
    console.log(`${roleEmoji} ${account.description.toUpperCase()}:`);
    console.log(`📧 Email: ${account.email}`);
    console.log(`🔒 Password: ${account.password}`);
    console.log(`👥 Role: ${account.role}\n`);
  });
  
  console.log('You can now use these accounts to test different user role functionalities.');
}

createAllTestAccounts();