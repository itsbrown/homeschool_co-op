/**
 * Standalone idempotent schema init (same path as server startup).
 * Usage: npx tsx scripts/run-init-db.ts
 * Post-merge on Replit: node scripts/run-init-db.mjs
 */
import '../server/local-env';
import { initializeDatabase } from '../server/init-db';

await initializeDatabase({ strict: true });
console.log('✅ initializeDatabase (strict) finished');
