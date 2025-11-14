import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateUserSchool(email, schoolId) {
  try {
    console.log(`\n🔍 Searching for user: ${email}`);
    
    // Get user by email
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error fetching users:', listError);
      return;
    }
    
    const user = users.find(u => u.email === email);
    
    if (!user) {
      console.log(`❌ User not found: ${email}`);
      return;
    }
    
    console.log(`✅ User found: ${user.email} (ID: ${user.id})`);
    console.log(`\n📦 Current app_metadata:`, JSON.stringify(user.app_metadata, null, 2));
    console.log(`👤 Current user_metadata:`, JSON.stringify(user.user_metadata, null, 2));
    
    // Update app_metadata to include school_id
    console.log(`\n🔄 Updating app_metadata to add school_id: ${schoolId}...`);
    
    const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        app_metadata: {
          ...user.app_metadata,
          school_id: schoolId
        }
      }
    );
    
    if (updateError) {
      console.error('❌ Failed to update user:', updateError);
      return;
    }
    
    console.log(`✅ Successfully updated user metadata!`);
    console.log(`\n📦 New app_metadata:`, JSON.stringify(updatedUser.user.app_metadata, null, 2));
    console.log(`\n✨ User ${email} is now associated with school ID ${schoolId}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get email and schoolId from command line arguments
const email = process.argv[2] || 'contact.americanseekersacademy@gmail.com';
const schoolId = parseInt(process.argv[3]) || 1;

console.log('🚀 Supabase User School Association Updater');
console.log('===========================================');

updateUserSchool(email, schoolId);
