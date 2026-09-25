import fs from "fs";
import path from "path";
import postgres from "postgres";
import { getNormalizedDatabaseUrl, getPostgresJsSslOption } from "./database-url";

let ensured = false;

const MIGRATION = "server/migrations/263-payroll-days.sql";

export async function ensurePayrollDaySchema(): Promise<void> {
  if (ensured) return;
  const connectionString = getNormalizedDatabaseUrl();
  if (!connectionString) throw new Error("DATABASE_URL not set");
  const client = postgres(connectionString, {
    prepare: false,
    max: 1,
    ssl: getPostgresJsSslOption(connectionString),
  });
  try {
    const migrationPath = path.join(process.cwd(), MIGRATION);
    await client.file(migrationPath);
    ensured = true;
  } finally {
    await client.end({ timeout: 5 });
  }
}
