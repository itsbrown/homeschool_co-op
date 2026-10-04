#!/usr/bin/env tsx
/**
 * Migration script to create financial tracking tables in the database
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getNormalizedDatabaseUrl, getPostgresJsSslOption } from '../server/lib/database-url.js';

async function migrate() {
  console.log('🔄 Starting financial tables migration...');

  const connectionString = getNormalizedDatabaseUrl();

  if (!connectionString) {
    console.error('❌ DATABASE_URL is not set');
    process.exit(1);
  }

  console.log('✅ DATABASE_URL detected');

  const client = postgres(connectionString, { max: 1, ssl: getPostgresJsSslOption(connectionString) });
  const db = drizzle(client);
  
  try {
    // Schema changes are additive SQL in server/migrations/. Do not db:push production.
    // This script just verifies the connection works
    
    console.log('📋 Checking if new tables exist...');
    
    const result = await client`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('program_enrollments', 'payments', 'scheduled_payments', 'refunds')
      ORDER BY table_name
    `;
    
    console.log('\n📊 Financial tables status:');
    const tableNames = new Set(result.map(r => r.table_name));
    
    ['program_enrollments', 'payments', 'scheduled_payments', 'refunds'].forEach(tableName => {
      const exists = tableNames.has(tableName);
      console.log(`  ${exists ? '✅' : '❌'} ${tableName}: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
    });
    
    if (tableNames.size === 0) {
      console.log('\n⚠️  No financial tables found. Apply additive SQL in server/migrations/ (never db:push on production).');
    } else if (tableNames.size < 4) {
      console.log('\n⚠️  Some financial tables are missing. Apply additive SQL in server/migrations/ (never db:push on production).');
    } else {
      console.log('\n✅ All financial tables exist!');
    }
    
  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
