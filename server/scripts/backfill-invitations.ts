import { createClient } from "@supabase/supabase-js";

async function backfillInvitations() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  
  const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  
  // First, check how many need updating
  const { data: pending, error: checkError } = await supabaseAdmin
    .from('role_invitations')
    .select('id, email, is_active, used_at')
    .is('used_at', null);
    
  if (checkError) {
    console.error("Error checking invitations:", checkError);
    process.exit(1);
  }
  
  console.log(`Found ${pending?.length || 0} pending invitations`);
  console.log("Pending invitations:", JSON.stringify(pending, null, 2));
  
  // Update invitations that are pending but not active
  const { data, error } = await supabaseAdmin
    .from('role_invitations')
    .update({ is_active: true })
    .is('used_at', null)
    .or('is_active.is.null,is_active.eq.false')
    .select();
    
  if (error) {
    console.error("Error updating invitations:", error);
    process.exit(1);
  }
  
  console.log(`Updated ${data?.length || 0} invitations to is_active=true`);
  if (data && data.length > 0) {
    console.log("Updated invitations:", JSON.stringify(data, null, 2));
  }
}

backfillInvitations().catch(console.error);
