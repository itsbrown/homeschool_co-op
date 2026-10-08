import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SUPER_ADMIN_EMAIL;
const password = process.env.SUPER_ADMIN_PASSWORD;

if (!supabaseUrl || !supabaseServiceKey || !email || !password) {
  console.error(
    'Set SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD',
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createSuperAdmin() {
  try {
    console.log('Creating super admin user in Supabase...');

    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error('Error checking existing users:', listError);
      return;
    }

    const existingUser = existingUsers.users.find((user) => user.email === email);

    if (existingUser) {
      console.log('Super admin user already exists:', existingUser.email);

      const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
        user_metadata: {
          role: 'superAdmin',
          name: 'Super Admin',
        },
      });

      if (updateError) {
        console.error('Error updating user metadata:', updateError);
      } else {
        console.log('Updated user role to superAdmin');
      }

      return;
    }

    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'superAdmin',
        name: 'Super Admin',
      },
    });

    if (createError) {
      console.error('Error creating super admin user:', createError);
      return;
    }

    console.log('Super admin user created:', newUser.user?.email);
  } catch (error) {
    console.error('Unexpected error creating super admin user:', error);
  }
}

createSuperAdmin();
