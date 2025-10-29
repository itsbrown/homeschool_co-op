import postgres from 'postgres';

const sql = postgres({
  host: process.env.PGHOST!,
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE!,
  username: process.env.PGUSER!,
  password: process.env.PGPASSWORD!,
  ssl: 'require'
});

async function generateReport() {
  console.log('📊 SCHEMA SYNC REPORT');
  console.log('='.repeat(80));
  
  // Tables defined in schema
  const schemaTables = [
    'users', 'schools', 'school_students', 'school_staff', 'school_classes',
    'school_class_enrollments', 'children', 'emergency_contacts',
    'program_enrollments', 'payments', 'scheduled_payments', 'refunds',
    'programs', 'stripe_subscription_schedules', 'membership_enrollments',
    'curricula', 'lessons', 'role_invitations', 'events', 'marketplace_items',
    'knowledge_bases', 'activities', 'classes', 'marketing_links',
    'link_analytics', 'locations', 'user_locations', 'notifications',
    'notification_recipients', 'discounts', 'discount_applications',
    'daily_flow_templates', 'daily_flow_entries', 'daily_flow_schedules',
    'custom_forms', 'custom_form_fields', 'custom_form_submissions'
  ];
  
  // Get actual tables in database
  const dbTables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
  `;
  
  const dbTableNames = dbTables.map(t => t.table_name).sort();
  const schemaTableNames = schemaTables.sort();
  
  console.log(`\n✅ SYNCED TABLES (${dbTableNames.length} tables exist in database):\n`);
  for (const table of dbTableNames) {
    console.log(`   ✓ ${table}`);
  }
  
  const missingTables = schemaTableNames.filter(t => !dbTableNames.includes(t));
  
  console.log(`\n⚠️  MISSING TABLES (${missingTables.length} tables not in database):\n`);
  for (const table of missingTables) {
    console.log(`   ✗ ${table}`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`\n📈 SUMMARY:`);
  console.log(`   • Schema defines: ${schemaTableNames.length} tables`);
  console.log(`   • Database has: ${dbTableNames.length} tables`);
  console.log(`   • Missing: ${missingTables.length} tables`);
  console.log(`   • Sync status: ${missingTables.length === 0 ? '✅ FULLY SYNCED' : '⚠️  PARTIAL'}\n`);
  
  await sql.end();
}

generateReport().catch(console.error);
