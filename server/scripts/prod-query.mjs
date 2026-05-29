#!/usr/bin/env node
/**
 * Ad-hoc query runner for the PROD database used during agent/manual
 * investigation. Reads the connection string from a gitignored `.env.prod`
 * file (NEVER from the chat / committed env) so the secret stays on disk only.
 *
 * Usage:
 *   node server/scripts/prod-query.mjs "select count(*) from users"
 *   echo "select * from users limit 5" | node server/scripts/prod-query.mjs
 *
 * Reuses the repo's URL normalization + SSL logic so managed-Postgres hosts
 * (Supabase/Neon/RDS/etc.) connect correctly. Output is JSON for easy parsing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  normalizeDatabaseUrl,
  getPostgresJsSslOption,
} from '../lib/database-url.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const envProdPath = path.join(repoRoot, '.env.prod');

function loadProdUrl() {
  if (!fs.existsSync(envProdPath)) {
    console.error(
      `Missing ${envProdPath}.\n` +
        `Create it (gitignored) with one line:\n` +
        `  DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require`,
    );
    process.exit(2);
  }
  const raw = fs.readFileSync(envProdPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);
    if (m) {
      let v = m[1];
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  console.error(`No DATABASE_URL line found in ${envProdPath}`);
  process.exit(2);
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const sql = (process.argv[2] ?? (await readStdin())).trim();
  if (!sql) {
    console.error('No SQL provided (pass as arg or via stdin).');
    process.exit(2);
  }

  const url = normalizeDatabaseUrl(loadProdUrl());
  const client = postgres(url, {
    prepare: false,
    max: 1,
    ssl: getPostgresJsSslOption(url),
  });

  try {
    const rows = await client.unsafe(sql);
    process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
  } catch (err) {
    console.error('Query failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await client.end({ timeout: 5 });
  }
}

main();
