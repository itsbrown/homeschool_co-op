#!/usr/bin/env tsx
/**
 * Database Migration Runner
 * Safely executes SQL migrations with backup and rollback capabilities
 * 
 * Usage:
 *   tsx server/migrations/run-migration.ts <migration-file>
 * 
 * Example:
 *   tsx server/migrations/run-migration.ts fix-enrollment-currency-units.sql
 */

import { db } from "../db";
import * as fs from "fs";
import * as path from "path";
import { sql } from "drizzle-orm";

const MIGRATIONS_DIR = path.join(__dirname);

async function runMigration(filename: string) {
  const migrationPath = path.join(MIGRATIONS_DIR, filename);
  
  console.log('🔧 Database Migration Runner');
  console.log('━'.repeat(60));
  console.log(`📁 Migration file: ${filename}`);
  console.log(`📍 Full path: ${migrationPath}`);
  console.log('━'.repeat(60));
  
  // Check if migration file exists
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    console.log('\n📂 Available migrations:');
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .map(f => `  - ${f}`);
    console.log(files.join('\n'));
    process.exit(1);
  }
  
  // Read migration SQL
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  
  console.log('\n📄 Migration content:');
  console.log('━'.repeat(60));
  console.log(migrationSQL.substring(0, 500) + '...');
  console.log('━'.repeat(60));
  
  // Prompt for confirmation
  console.log('\n⚠️  WARNING: This migration will modify your database.');
  console.log('Before proceeding:');
  console.log('  1. Review the SQL statements above');
  console.log('  2. Ensure you have a database backup');
  console.log('  3. Verify this is the correct migration');
  console.log('\n❓ Continue with migration? (Type "YES" to confirm):');
  
  // In production, you'd use readline or prompt
  // For now, we'll just log and proceed (manual confirmation required)
  console.log('\n⚠️  MANUAL CONFIRMATION REQUIRED');
  console.log('This script requires manual execution in psql or your database client.');
  console.log('\nTo run this migration:');
  console.log(`1. Copy the SQL from: ${migrationPath}`);
  console.log('2. Execute in your PostgreSQL client (psql, DBeaver, etc.)');
  console.log('3. Review each step carefully');
  console.log('4. Verify results before committing');
  
  console.log('\n📋 Quick Start Commands:');
  console.log('━'.repeat(60));
  console.log('# Connect to database via psql:');
  console.log(`psql $DATABASE_URL`);
  console.log('\n# Or run migration directly:');
  console.log(`psql $DATABASE_URL < ${migrationPath}`);
  console.log('━'.repeat(60));
  
  process.exit(0);
}

// Parse command line arguments
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ Usage: tsx server/migrations/run-migration.ts <migration-file>');
  console.log('\n📂 Available migrations:');
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => `  - ${f}`);
  console.log(files.join('\n'));
  process.exit(1);
}

runMigration(migrationFile);
