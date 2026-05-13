// This script normalizes the DATABASE_URL (percent-encoding any reserved
// characters in the password via the shared helper) and runs drizzle-kit push.

import { execSync } from 'child_process';
import { normalizeDatabaseUrl } from '../server/lib/database-url.mjs';

const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

try {
  const normalized = normalizeDatabaseUrl(rawUrl);
  if (!normalized) {
    console.error("Could not normalize DATABASE_URL");
    process.exit(1);
  }

  console.log("Running drizzle-kit push with normalized DATABASE_URL...");

  process.env.DATABASE_URL = normalized;
  execSync('npx drizzle-kit push', { stdio: 'inherit' });

  console.log("Database schema push completed.");
} catch (error) {
  console.error("Error during database schema push:", error);
  process.exit(1);
}
