import fs from "fs";
import path from "path";
import postgres from "postgres";
import { getNormalizedDatabaseUrl, getPostgresJsSslOption } from "./database-url";

let ensured = false;

const MIGRATION = "server/migrations/263-family-access-codes.sql";

/** Idempotent apply of family access-codes migration (E2E + local). */
export async function ensureFamilyAccessCodesSchema(): Promise<void> {
  if (ensured) return;

  const connectionString = getNormalizedDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = postgres(connectionString, {
    prepare: false,
    max: 1,
    ssl: getPostgresJsSslOption(connectionString),
  });

  try {
    const migrationPath = path.join(process.cwd(), MIGRATION);
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Missing migration file: ${migrationPath}`);
    }
    await client.file(migrationPath);
    ensured = true;
  } finally {
    await client.end({ timeout: 5 });
  }
}
