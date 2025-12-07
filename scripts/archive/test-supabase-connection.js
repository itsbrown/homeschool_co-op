import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Testing Supabase connection...');
console.log('URL:', supabaseUrl);
console.log('Service key exists:', !!serviceKey);

if (!supabaseUrl || !serviceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false }
});

async function testConnection() {
  try {
    console.log('\n1. Testing basic connectivity...');
    
    // Try to list tables first
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .limit(10);
    
    if (tablesError) {
      console.error('Tables query error:', tablesError);
    } else {
      console.log('Tables in public schema:', tables?.map(t => t.table_name));
    }

    console.log('\n2. Testing accounts table access...');
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('*')
      .limit(1);
    
    if (accountsError) {
      console.error('Accounts error:', accountsError);
      
      // Try to create the accounts table
      console.log('\n3. Attempting to create accounts table...');
      const { error: createError } = await supabase.rpc('exec', {
        query: `
          CREATE TABLE IF NOT EXISTS public.accounts (
            id BIGSERIAL PRIMARY KEY,
            firebase_uid VARCHAR(128) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            role VARCHAR(20) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
        `
      });
      
      if (createError) {
        console.error('Create table error:', createError);
      } else {
        console.log('Table creation attempted');
      }
    } else {
      console.log('Accounts table accessible, found', accounts?.length, 'records');
    }

    console.log('\n4. Testing schools table access...');
    const { data: schools, error: schoolsError } = await supabase
      .from('schools')
      .select('*')
      .limit(1);
    
    if (schoolsError) {
      console.error('Schools error:', schoolsError);
    } else {
      console.log('Schools table accessible, found', schools?.length, 'records');
    }

  } catch (error) {
    console.error('Connection test failed:', error);
  }
}

testConnection();