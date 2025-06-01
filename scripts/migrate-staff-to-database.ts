import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrateStaffData() {
  try {
    console.log('🚀 Starting staff data migration...');

    // Read existing staff data from JSON file
    const staffFilePath = path.join(process.cwd(), 'data', 'staff.json');
    
    if (!fs.existsSync(staffFilePath)) {
      console.log('No existing staff file found');
      return;
    }

    const staffData = JSON.parse(fs.readFileSync(staffFilePath, 'utf8'));
    console.log(`Found ${staffData.length} staff members to migrate`);

    // First, create the school_staff table if it doesn't exist
    const { error: tableError } = await supabase.rpc('create_school_staff_table', {});
    if (tableError && !tableError.message.includes('already exists')) {
      console.log('Creating school_staff table with SQL...');
      
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS school_staff (
          id SERIAL PRIMARY KEY,
          school_id INTEGER NOT NULL DEFAULT 1,
          user_id INTEGER,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          phone TEXT,
          position TEXT NOT NULL,
          department TEXT,
          start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          end_date TIMESTAMP WITH TIME ZONE,
          is_active BOOLEAN DEFAULT true,
          permissions JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `;
      
      const { error: sqlError } = await supabase.rpc('exec_sql', { sql: createTableSQL });
      if (sqlError) {
        console.error('Error creating table:', sqlError);
        return;
      }
    }

    // Transform and insert staff data
    for (const staff of staffData) {
      const staffRecord = {
        school_id: 1, // American Seekers Academy
        first_name: staff.firstName,
        last_name: staff.lastName,
        email: staff.email,
        phone: staff.phone || null,
        position: staff.role,
        department: staff.department,
        start_date: staff.joinDate || new Date().toISOString(),
        is_active: staff.status === 'Active' || staff.status === 'Pending',
        permissions: {},
        created_at: staff.invitedAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('school_staff')
        .upsert(staffRecord, { onConflict: 'email' })
        .select();

      if (error) {
        console.error(`Error inserting staff member ${staff.name}:`, error);
      } else {
        console.log(`✅ Migrated staff member: ${staff.name}`);
      }
    }

    console.log('🎉 Staff migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

// Run the migration
migrateStaffData();