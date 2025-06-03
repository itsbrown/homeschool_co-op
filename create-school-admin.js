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
    console.log('Getting existing school admin account...');
    
    // Get the existing school admin account
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'contact.americanseekersacademy@gmail.com')
      .single();

    if (error) {
      console.error('Error finding account:', error);
      return;
    }

    console.log('✅ Found school admin account:', data);

    // Also create a school record for this admin
    const { data: schoolData, error: schoolError } = await supabase
      .from('schools')
      .insert({
        name: 'American Seekers Academy',
        type: 'school',
        admin_id: data.id,
        city: 'San Francisco',
        state: 'CA',
        zip_code: '94102',
        email: 'contact.americanseekersacademy@gmail.com',
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