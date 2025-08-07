
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://moivwjuglwwfrhqeewju.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vaXZ3anVnbHd3ZnJocWVld2p1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNTQ4MDk3MywiZXhwIjoyMDQxMDU2OTczfQ.g2zbGJBtVhDH_K89Uyxqnb1vECOYfhQgUCBQT2xAa4Q';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createSuperAdmin() {
  try {
    console.log('🔧 Creating super admin user in Supabase...');

    const email = 'corey@americanseekersacademy.com';
    const password = 'I4mlnrC30!';

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
    console.log('🔑 Login credentials:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role: superAdmin`);

  } catch (error) {
    console.error('❌ Unexpected error creating super admin user:', error);
  }
}

createSuperAdmin();
