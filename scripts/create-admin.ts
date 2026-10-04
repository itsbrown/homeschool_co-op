
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.ADMIN_INITIAL_PASSWORD;

if (!supabaseUrl || !supabaseServiceKey || !password) {
  console.error(
    'Set SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, and ADMIN_INITIAL_PASSWORD in the environment. Do not commit them.',
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createSuperAdmin() {
  try {
    console.log('🔧 Creating super admin user in Supabase...');

    const email = process.env.ADMIN_EMAIL || 'corey@americanseekersacademy.com';

    // Check if user already exists
    console.log('🔍 Checking if super admin user already exists...');
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error checking existing users:', listError);
      return;
    }

    const existingUser = existingUsers.users.find(user => user.email === email);

    if (existingUser) {
      console.log('✅ Super admin user already exists:', existingUser.email);
      
      // Update their user metadata to ensure they have the superAdmin role
      const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        {
          user_metadata: {
            role: 'superAdmin',
            name: 'Super Admin'
          }
        }
      );

      if (updateError) {
        console.error('❌ Error updating user metadata:', updateError);
      } else {
        console.log('✅ Updated user role to superAdmin');
      }

      return;
    }

    // Create new user
    console.log('👤 Creating new super admin user...');
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        role: 'superAdmin',
        name: 'Super Admin'
      }
    });

    if (createError) {
      console.error('❌ Error creating super admin user:', createError);
      return;
    }

    console.log('✅ Super admin user created successfully:', newUser.user?.email);
    console.log(`   Email: ${email}`);
    console.log('   Password: (from ADMIN_INITIAL_PASSWORD; not printed)');
    console.log('   Role: superAdmin');

  } catch (error) {
    console.error('❌ Unexpected error creating super admin user:', error);
  }
}

createSuperAdmin();
