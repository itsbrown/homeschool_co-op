/**
 * Ensures production-path tests never run against MemStorage because core tables are missing.
 */
export async function assertCorePostgresSchema(): Promise<void> {
  const url =
    process.env.DATABASE_URL ||
    process.env.TEST_DATABASE_URL ||
    'postgresql://test:test@localhost:5432/asa_test';

  const requiredTables = ['users', 'schools', 'locations', 'user_roles', 'children'];
  const postgres = (await import('postgres')).default;
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 5 });

  try {
    const missing: string[] = [];
    for (const table of requiredTables) {
      const rows = await sql`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${table}
      `;
      if (rows.length === 0) {
        missing.push(table);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `[production-path] Missing Postgres tables: ${missing.join(', ')}. ` +
          'Run npx drizzle-kit push --force against asa_test before this suite.',
      );
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
}
