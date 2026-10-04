/**
 * Script to create a parent test account in Supabase
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const parentPassword = process.env.PARENT_TEST_PASSWORD;

if (!supabaseUrl || !supabaseServiceKey || !parentPassword) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and PARENT_TEST_PASSWORD. Do not commit them.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createParentTestAccount() {
  try {
    console.log('Creating parent test account in Supabase...');
    
    // Create auth user in Supabase
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: 'parent.test@americanseekersacademy.com',
      password: parentPassword,
      email_confirm: true,
      user_metadata: {
        full_name: 'Test Parent',
        role: 'parent'
      }
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      return;
    }

    console.log('✅ Auth user created:', authData.user.id);

    // Add to users table if it exists
    try {
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          firebase_uid: authData.user.id,
          email: 'parent.test@americanseekersacademy.com',
          role: 'parent',
          name: 'Test Parent',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (insertError) {
        console.log('Note: Could not insert into users table (table may not exist):', insertError.message);
      } else {
        console.log('✅ User record created in users table');
      }
    } catch (tableError) {
      console.log('Note: Users table may not exist, skipping database insert');
    }

    console.log('\n🎉 Parent test account created successfully!');
    console.log('📧 Email: parent.test@americanseekersacademy.com');
    console.log('🔒 Password: (from PARENT_TEST_PASSWORD; not printed)');
    console.log('👥 Role: parent');
    console.log('\nYou can now use this account to test parent functionality.');

  } catch (error) {
    console.error('❌ Error creating parent test account:', error);
  }
}

createParentTestAccount();