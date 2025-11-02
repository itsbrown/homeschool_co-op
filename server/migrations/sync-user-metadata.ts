import { createClient } from '@supabase/supabase-js';
import { storage } from '../storage.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function syncUserMetadata() {
  console.log('🔄 Starting user metadata synchronization...');
  
  try {
    // Get all users from database
    const dbUsers = await storage.getAllUsers();
    console.log(`📊 Found ${dbUsers.length} users in database`);
    
    // Get all Supabase auth users
    const { data: { users: supabaseUsers }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Failed to list Supabase users:', listError);
      return;
    }
    
    console.log(`📊 Found ${supabaseUsers.length} users in Supabase`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Match database users with Supabase users by email
    for (const dbUser of dbUsers) {
      if (!dbUser.email || !dbUser.schoolId) {
        console.log(`⏭️  Skipping user without email or schoolId: ${dbUser.name}`);
        skippedCount++;
        continue;
      }
      
      const supabaseUser = supabaseUsers.find(su => su.email === dbUser.email);
      
      if (!supabaseUser) {
        console.log(`⚠️  No Supabase user found for email: ${dbUser.email}`);
        skippedCount++;
        continue;
      }
      
      // Check if user already has school_id in metadata
      if (supabaseUser.user_metadata?.school_id) {
        console.log(`✅ User ${dbUser.email} already has school_id=${supabaseUser.user_metadata.school_id}`);
        skippedCount++;
        continue;
      }
      
      // Update user metadata
      console.log(`🔄 Updating ${dbUser.email} with school_id=${dbUser.schoolId}`);
      
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        supabaseUser.id,
        {
          user_metadata: {
            ...supabaseUser.user_metadata,
            school_id: dbUser.schoolId,
            role: dbUser.role,
            name: dbUser.name
          }
        }
      );
      
      if (updateError) {
        console.error(`❌ Failed to update ${dbUser.email}:`, updateError.message);
        errorCount++;
      } else {
        console.log(`✅ Successfully updated ${dbUser.email}`);
        updatedCount++;
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Updated: ${updatedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('\n✨ User metadata synchronization complete!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  syncUserMetadata()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { syncUserMetadata };
