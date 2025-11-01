/**
 * Comprehensive Schema Audit
 * Compares shared/schema.ts definitions against actual production database
 */

import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';

interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
}

interface TableInfo {
  table_name: string;
  table_type: string;
}

async function auditSchema() {
  console.log('🔍 Starting comprehensive schema audit...\n');
  
  try {
    const db = await getDb();
    
    // Get all tables in public schema
    console.log('📊 Fetching table list...');
    const tables = await db.execute<TableInfo>(sql`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log(`\n✅ Found ${tables.length} tables in database\n`);
    
    // Priority tables to check (based on known migrations and usage)
    const priorityTables = [
      'users',
      'children', 
      'schools',
      'classes',
      'school_students',
      'program_enrollments',
      'marketplace_class_enrollments',
      'school_class_enrollments',
      'membership_enrollments',
      'locations',
      'user_locations',
      'staff_positions',
      'role_invitations',
      'password_reset_tokens',
      'discounts',
      'discount_applications',
      'stripe_subscription_schedules',
      'daily_flow_templates',
      'daily_flow_entries',
      'daily_flow_schedules',
      'marketing_links'
    ];
    
    const mismatches: Array<{
      table: string;
      issue: string;
      severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      recommendation: string;
    }> = [];
    
    // Check each priority table
    for (const tableName of priorityTables) {
      const tableExists = tables.some((t: any) => t.table_name === tableName);
      
      if (!tableExists) {
        mismatches.push({
          table: tableName,
          issue: `Table does not exist in database`,
          severity: 'HIGH',
          recommendation: `Run migration to create ${tableName} table or remove from schema`
        });
        console.log(`❌ Table '${tableName}' - NOT FOUND`);
        continue;
      }
      
      // Get column information for this table
      const columns = await db.execute<ColumnInfo>(sql`
        SELECT 
          table_name,
          column_name, 
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND table_name = ${tableName}
        ORDER BY ordinal_position
      `);
      
      console.log(`\n✅ Table '${tableName}' - ${columns.length} columns`);
      columns.forEach((col: any) => {
        const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(required)';
        const defaultVal = col.column_default ? ` default: ${col.column_default}` : '';
        console.log(`   - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
      });
    }
    
    // Known schema fields that should be checked against database
    console.log('\n\n🔍 KNOWN SCHEMA ISSUES:\n');
    
    // Check users table for firstName/lastName
    const usersColumns = await db.execute<ColumnInfo>(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
    `);
    
    const usersColumnNames = usersColumns.map((c: any) => c.column_name);
    
    if (!usersColumnNames.includes('first_name')) {
      mismatches.push({
        table: 'users',
        issue: 'Column first_name defined in schema but missing in database',
        severity: 'CRITICAL',
        recommendation: 'Either add column to database OR remove from schema (currently filtered in userSyncService)'
      });
      console.log('❌ CRITICAL: users.first_name - defined in schema, missing in database');
    }
    
    if (!usersColumnNames.includes('last_name')) {
      mismatches.push({
        table: 'users',
        issue: 'Column last_name defined in schema but missing in database',
        severity: 'CRITICAL',
        recommendation: 'Either add column to database OR remove from schema (currently filtered in userSyncService)'
      });
      console.log('❌ CRITICAL: users.last_name - defined in schema, missing in database');
    }
    
    // Check for emergency contact fields
    const emergencyFields = ['emergency_contact_first_name', 'emergency_contact_last_name', 'emergency_contact_phone', 'emergency_contact_relationship'];
    emergencyFields.forEach(field => {
      if (!usersColumnNames.includes(field)) {
        mismatches.push({
          table: 'users',
          issue: `Column ${field} defined in schema but missing in database`,
          severity: 'MEDIUM',
          recommendation: `Add column to database if emergency contacts are used, otherwise remove from schema`
        });
        console.log(`⚠️  MEDIUM: users.${field} - defined in schema, missing in database`);
      }
    });
    
    // Summary Report
    console.log('\n\n📋 SCHEMA AUDIT SUMMARY:\n');
    console.log(`Total tables checked: ${priorityTables.length}`);
    console.log(`Total mismatches found: ${mismatches.length}\n`);
    
    if (mismatches.length > 0) {
      console.log('🚨 MISMATCHES BY SEVERITY:\n');
      
      const critical = mismatches.filter(m => m.severity === 'CRITICAL');
      const high = mismatches.filter(m => m.severity === 'HIGH');
      const medium = mismatches.filter(m => m.severity === 'MEDIUM');
      const low = mismatches.filter(m => m.severity === 'LOW');
      
      if (critical.length > 0) {
        console.log(`🔴 CRITICAL (${critical.length}):`);
        critical.forEach(m => {
          console.log(`   ${m.table}: ${m.issue}`);
          console.log(`   → ${m.recommendation}\n`);
        });
      }
      
      if (high.length > 0) {
        console.log(`🟠 HIGH (${high.length}):`);
        high.forEach(m => {
          console.log(`   ${m.table}: ${m.issue}`);
          console.log(`   → ${m.recommendation}\n`);
        });
      }
      
      if (medium.length > 0) {
        console.log(`🟡 MEDIUM (${medium.length}):`);
        medium.forEach(m => {
          console.log(`   ${m.table}: ${m.issue}`);
          console.log(`   → ${m.recommendation}\n`);
        });
      }
      
      if (low.length > 0) {
        console.log(`🟢 LOW (${low.length}):`);
        low.forEach(m => {
          console.log(`   ${m.table}: ${m.issue}`);
          console.log(`   → ${m.recommendation}\n`);
        });
      }
    } else {
      console.log('✅ No schema mismatches found!');
    }
    
    console.log('\n✅ Schema audit complete!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error during schema audit:', error);
    process.exit(1);
  }
}

auditSchema();
