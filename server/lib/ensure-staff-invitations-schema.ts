import fs from "fs";
import path from "path";
import postgres from "postgres";
import { getNormalizedDatabaseUrl, getPostgresJsSslOption } from "./database-url";

let ensured = false;

const MIGRATION = "server/migrations/259-staff-invitations.sql";

/** Idempotent apply of staff-invitations migration (E2E + local + boot). */
export async function ensureStaffInvitationsSchema(): Promise<void> {
  if (ensured) return;

  const connectionString = getNormalizedDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL not set");
  }

  const client = postgres(connectionString, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
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
