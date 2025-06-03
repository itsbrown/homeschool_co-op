import { createClient } from '@supabase/supabase-js';

// Use service role key for admin operations
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createSchoolAdminAccount() {
  try {
    console.log('Creating school admin account...');
    
    // Insert the school admin account
    const { data, error } = await supabase
      .from('accounts')
      .insert({
        email: 'contact.americanseekersacademy@gmail.com',
        role: 'school_admin',
        name: 'ASA School Administrator'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating account:', error);
      return;
    }

    console.log('✅ School admin account created:', data);

    // Also create a school record for this admin
    const { data: schoolData, error: schoolError } = await supabase
      .from('schools')
      .insert({
        name: 'American Seekers Academy',
        type: 'academy',
        city: 'City',
        state: 'State',
        zip_code: '12345',
        created_by: data.id,
        status: 'active'
      })
      .select()
      .single();

    if (schoolError) {
      console.error('Error creating school:', schoolError);
    } else {
      console.log('✅ School record created:', schoolData);
    }

  } catch (error) {
    console.error('Script error:', error);
  }
}

createSchoolAdminAccount();