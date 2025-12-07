import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchema() {
  try {
    console.log('Checking schools table schema...');
    
    // Try to get schema information
    const { data: schemas, error: schemaError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'schools')
      .eq('table_schema', 'public');

    if (schemaError) {
      console.log('Schema query failed, trying direct table query...');
      
      // Try to query the table directly to see what fields exist
      const { data: sampleData, error: sampleError } = await supabase
        .from('schools')
        .select('*')
        .limit(1);
        
      if (sampleError) {
        console.log('Sample query error:', sampleError);
      } else {
        console.log('Sample schools data:', sampleData);
      }
    } else {
      console.log('Schools table schema:', schemas);
    }

    // Check if there are any existing schools
    const { data: existingSchools, error: existingError } = await supabase
      .from('schools')
      .select('*');
      
    console.log('Existing schools:', existingSchools);
    if (existingError) {
      console.log('Error fetching schools:', existingError);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkSchema();