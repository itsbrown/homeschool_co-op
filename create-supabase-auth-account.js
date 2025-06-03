import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createSchoolAdminAuthAccount() {
  try {
    console.log('Creating Supabase Auth account for school admin...');
    
    // Create auth account
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: 'contact.americanseekersacademy@gmail.com',
      password: 'SchoolAdmin123!',
      email_confirm: true,
      user_metadata: {
        full_name: 'ASA School Administrator',
        role: 'schoolAdmin'
      }
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        console.log('✅ Auth account already exists');
        
        // Get the existing user
        const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
        if (userError) {
          console.log('Error listing users:', userError);
          return;
        }
        
        const existingUser = userData.users.find(u => u.email === 'contact.americanseekersacademy@gmail.com');
        console.log('✅ Found existing auth user:', existingUser?.id);
        
        // Update the database user record with the supabase_id
        const { data: updateData, error: updateError } = await supabase
          .from('users')
          .update({ supabase_id: existingUser?.id })
          .eq('email', 'contact.americanseekersacademy@gmail.com')
          .select()
          .single();
          
        if (updateError) {
          console.log('Error updating user record:', updateError);
        } else {
          console.log('✅ Updated database user with supabase_id:', updateData);
        }
        
      } else {
        console.error('Error creating auth account:', authError);
        return;
      }
    } else {
      console.log('✅ Auth account created:', authData.user?.id);
      
      // Update the database user record with the supabase_id
      const { data: updateData, error: updateError } = await supabase
        .from('users')
        .update({ supabase_id: authData.user?.id })
        .eq('email', 'contact.americanseekersacademy@gmail.com')
        .select()
        .single();
        
      if (updateError) {
        console.log('Error updating user record:', updateError);
      } else {
        console.log('✅ Updated database user with supabase_id:', updateData);
      }
    }

    console.log('School admin auth setup complete!');

  } catch (error) {
    console.error('Script error:', error);
  }
}

createSchoolAdminAuthAccount();