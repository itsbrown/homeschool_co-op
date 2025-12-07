const { createClient } = require('@supabase/supabase-js');

// Test database connection
async function testConnection() {
  console.log('Testing Supabase connection...');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing environment variables');
    return;
  }
  
  const supabase = createClient(supabaseUrl, serviceKey);
  
  try {
    // Test basic connection
    console.log('1. Testing basic connection...');
    const { data, error } = await supabase.from('accounts').select('count', { count: 'exact' });
    
    if (error) {
      console.error('Connection error:', error.message);
      
      // Try creating the table if it doesn't exist
      console.log('2. Attempting to create accounts table...');
      const { error: createError } = await supabase.rpc('create_accounts_table');
      
      if (createError) {
        console.error('Create table error:', createError.message);
      }
    } else {
      console.log('Success! Found', data[0]?.count || 0, 'accounts');
    }
    
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

testConnection();