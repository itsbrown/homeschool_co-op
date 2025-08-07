import { db } from '../server/db';
import { users } from '../shared/schema';
import bcrypt from 'bcryptjs';

async function createSuperAdmin() {
  try {
    console.log('Database connection to Supabase created successfully');

    const email = 'corey@americanseekersacademy.com';
    const password = 'I4mlnrC30!';

    // Check if user already exists
    console.log('Checking if super admin user already exists...');
    const { data: existingUser } = await supabase.auth.admin.getUserByEmail(email);

    if (existingUser.user) {
      console.log('✅ Super admin user already exists:', existingUser.user.email);

      // Update their role in our database
      const { data: profile, error: profileError } = await supabase
        .from('accounts')
        .upsert({
          email: email,
          role: 'superAdmin',
          name: 'Super Admin',
          isActive: true,
          supabaseId: existingUser.user.id
        }, {
          onConflict: 'email'
        });

      if (profileError) {
        console.error('Error updating profile:', profileError);
      } else {
        console.log('✅ Updated user role to superAdmin');
      }

      return;
    }

    // Create new user
    console.log('Creating new super admin user...');
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
      console.error('Error creating super admin user:', createError);
      return;
    }

    console.log('✅ Super admin user created:', newUser.user?.email);

    // Create profile in accounts table
    const { data: profile, error: profileError } = await supabase
      .from('accounts')
      .insert({
        email: email,
        role: 'superAdmin',
        name: 'Super Admin',
        isActive: true,
        supabaseId: newUser.user?.id
      });

    if (profileError) {
      console.error('Error creating profile:', profileError);
    } else {
      console.log('✅ Super admin profile created successfully');
    }

  } catch (error) {
    console.error('Error creating super admin user:', error);
  }
}

createSuperAdmin();