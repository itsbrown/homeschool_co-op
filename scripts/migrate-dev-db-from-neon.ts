/**
 * One-off dev-only migration: copy every public-schema table from the legacy
 * Neon dev database (read from `NEON_DATABASE_URL`) into the project's
 * current dev Postgres database (read from `DATABASE_URL`).
 *
 * Hard-failure guardrails (production-safety):
 *   - Aborts immediately if NODE_ENV === 'production'.
 *   - Aborts if either URL is missing.
 *   - Aborts if NEON_DATABASE_URL === DATABASE_URL.
 *   - Aborts if NEON_DATABASE_URL and DATABASE_URL resolve to the same
 *     Postgres instance (system_identifier equality).
 *   - Aborts if the destination DATABASE_URL hostname looks like a managed
 *     production host (Neon/Supabase/RDS/Aiven/etc.) — the migration is
 *     dev-only.
 *   - Refuses to run unless the caller sets MIGRATION_CONFIRM=1, since
 *     DATABASE_URL is the LIVE dev URL the app reads from and a misfire
 *     would TRUNCATE all dev data.
 *
 * Each table is copied inside its own transaction (TRUNCATE then INSERT)
 * with `session_replication_role = replica` set on the dest so FK checks
 * don't fail mid-copy. If any table's transaction fails, only that table
 * is rolled back; previously-copied tables remain in place.
 *
 * IMPORTANT: this script expects the destination DATABASE_URL to point at
 * a freshly initialized / empty database (only the schema bootstrapped,
 * no rows of interest). The per-table `TRUNCATE ... CASCADE` is safe only
 * under that assumption — if a downstream table's transaction CASCADEs
 * into a previously-copied table, those earlier rows would be wiped
 * before being re-inserted. For re-runs against a partially populated
 * dev DB, restart from a clean schema first (`npm run db:push --force`
 * against an empty database) before running this script.
 *
 * Usage:
 *   NEON_DATABASE_URL=...neon... \
 *   MIGRATION_CONFIRM=1 \
 *   tsx scripts/migrate-dev-db-from-neon.ts
 *
 *   (DATABASE_URL is read from the project's normal env — it must already
 *   point at the new dev DB.)
 *
 * Optional flags via env:
 *   MIGRATION_TABLES=users,schools,...   only migrate these tables (comma-list)
 *   MIGRATION_DRY_RUN=1                  print plan + counts, do not write
 */

import postgres from 'postgres';
import {
  getNormalizedDatabaseUrl,
  getPostgresJsSslOption,
  normalizeDatabaseUrl,
} from '../server/lib/database-url.mjs';

const MANAGED_PROD_SUFFIXES = [
  '.neon.tech',
  '.supabase.co',
  '.pooler.supabase.com',
  '.rds.amazonaws.com',
  '.aivencloud.com',
  '.azure.com',
  '.digitalocean.com',
  '.cockroachlabs.cloud',
];

function abort(msg: string): never {
  console.error(`✖  ${msg}`);
  process.exit(1);
}

function safeHost(url: string): string {
  try {
    const p = new URL(url);
    return `${p.hostname}:${p.port || ''}/${p.pathname.replace(/^\//, '')}`;
  } catch {
    return '<unparseable>';
  }
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    abort('NODE_ENV=production — refusing to run dev migration script.');
  }
  if (process.env.MIGRATION_CONFIRM !== '1') {
    abort(
      'MIGRATION_CONFIRM=1 not set — refusing to run. This script TRUNCATEs ' +
        'every table in the destination DATABASE_URL before copying. Set ' +
        'MIGRATION_CONFIRM=1 only when you are sure DATABASE_URL points at ' +
        'the dev DB you want to overwrite.',
    );
  }

  const rawSource = process.env.NEON_DATABASE_URL;
  const rawDest = getNormalizedDatabaseUrl();
  if (!rawSource) abort('NEON_DATABASE_URL is empty — nothing to migrate from.');
  if (!rawDest) abort('DATABASE_URL is empty — nowhere to migrate to.');

  const sourceUrl = normalizeDatabaseUrl(rawSource) ?? rawSource;
  const destUrl = rawDest;
  if (sourceUrl === destUrl) {
    abort('NEON_DATABASE_URL === DATABASE_URL — refusing to overwrite the source.');
  }

  const destHost = hostnameOf(destUrl);
  if (MANAGED_PROD_SUFFIXES.some((s) => destHost.endsWith(s))) {
    abort(
      `DATABASE_URL host "${destHost}" looks like a managed prod Postgres ` +
        'provider. This script is dev-only and will not write to a managed ' +
        'cloud DB. Aborting.',
    );
  }

  const onlyTables = (process.env.MIGRATION_TABLES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const dryRun = process.env.MIGRATION_DRY_RUN === '1';

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`source  (Neon)            : ${safeHost(sourceUrl)}`);
  console.log(`dest    (DATABASE_URL)    : ${safeHost(destUrl)}`);
  console.log(`dryRun                    : ${dryRun}`);
  console.log(`onlyTables                : ${onlyTables.length ? onlyTables.join(', ') : '(all)'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const source = postgres(sourceUrl, {
    prepare: false,
    max: 4,
    ssl: getPostgresJsSslOption(sourceUrl),
    connect_timeout: 15,
  });
  const dest = postgres(destUrl, {
    prepare: false,
    max: 4,
    ssl: getPostgresJsSslOption(destUrl),
    connect_timeout: 15,
  });

  try {
    // Sanity check: confirm both DBs are responsive and not the same instance.
    const [sId] = await source<{ id: string }[]>`SELECT system_identifier::text AS id FROM pg_control_system()`;
    const [dId] = await dest<{ id: string }[]>`SELECT system_identifier::text AS id FROM pg_control_system()`;
    if (sId.id === dId.id) {
      abort(`Source and destination are the same Postgres instance (system_identifier=${sId.id}).`);
    }

    // Discover all base tables in the destination's public schema. We use the
    // destination as the canonical list because the schema bootstrap is what
    // defines "where rows are allowed to go". Tables only present in Neon are
    // legacy and intentionally skipped.
    const destTablesRaw = await dest<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'
      ORDER BY table_name
    `;
    const destTables = new Set(destTablesRaw.map((r) => r.table_name));

    const sourceTablesRaw = await source<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'
      ORDER BY table_name
    `;
    const sourceTables = new Set(sourceTablesRaw.map((r) => r.table_name));

    let tablesToMigrate = [...destTables].filter((t) => sourceTables.has(t));
    const onlyInSource = [...sourceTables].filter((t) => !destTables.has(t));
    const onlyInDest = [...destTables].filter((t) => !sourceTables.has(t));
    if (onlyInSource.length) {
      console.log(`ℹ skipping ${onlyInSource.length} tables that exist in Neon but not in dest:`);
      console.log(`   ${onlyInSource.join(', ')}`);
    }
    if (onlyInDest.length) {
      console.log(`ℹ leaving empty in dest (no source rows): ${onlyInDest.join(', ')}`);
    }
    if (onlyTables.length) {
      tablesToMigrate = tablesToMigrate.filter((t) => onlyTables.includes(t));
    }

    // Per-table column lookup including which columns are GENERATED (must be
    // skipped on insert). We pull this from the destination because the dest
    // is what we are inserting into.
    const destColumnsRaw = await dest<
      { table_name: string; column_name: string; is_generated: string; ordinal_position: number }[]
    >`
      SELECT table_name, column_name, is_generated, ordinal_position
      FROM information_schema.columns
      WHERE table_schema='public'
      ORDER BY table_name, ordinal_position
    `;
    const destColumnsByTable = new Map<string, { name: string; generated: boolean }[]>();
    for (const row of destColumnsRaw) {
      if (!destColumnsByTable.has(row.table_name)) destColumnsByTable.set(row.table_name, []);
      destColumnsByTable.get(row.table_name)!.push({
        name: row.column_name,
        generated: row.is_generated === 'ALWAYS',
      });
    }

    // Plan summary first.
    const plan: { table: string; sourceCount: number; destCount: number }[] = [];
    for (const t of tablesToMigrate) {
      const [{ c: sc }] = await source<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM ${source(t)}`;
      const [{ c: dc }] = await dest<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM ${dest(t)}`;
      plan.push({ table: t, sourceCount: sc, destCount: dc });
    }
    console.log('\nPlan (table → source → dest):');
    for (const p of plan) {
      console.log(`  ${p.table.padEnd(35)} ${String(p.sourceCount).padStart(7)}  →  ${String(p.destCount).padStart(7)}`);
    }
    const totalSource = plan.reduce((a, b) => a + b.sourceCount, 0);
    console.log(`  ${'TOTAL'.padEnd(35)} ${String(totalSource).padStart(7)}`);

    if (dryRun) {
      console.log('\nDry run — no changes made.');
      return;
    }

    console.log('\n▶ Starting copy. Each table runs in its own transaction with');
    console.log('  session_replication_role=replica to defer FK + triggers.');

    let totalCopied = 0;
    let failed = 0;
    for (const tbl of tablesToMigrate) {
      const cols = destColumnsByTable.get(tbl) || [];
      const insertCols = cols.filter((c) => !c.generated).map((c) => c.name);
      if (insertCols.length === 0) {
        console.log(`  ${tbl}: no insertable columns, skipping`);
        continue;
      }

      // Confirm the source has the same set of columns. Take the intersection
      // so we do not break on legacy/dropped columns either side.
      const sourceColsRaw = await source<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name = ${tbl}
      `;
      const sourceColSet = new Set(sourceColsRaw.map((r) => r.column_name));
      const finalCols = insertCols.filter((c) => sourceColSet.has(c));
      const missingInSource = insertCols.filter((c) => !sourceColSet.has(c));
      if (missingInSource.length) {
        console.log(`  ⚠ ${tbl}: dest columns missing in source (will use dest defaults / NULL): ${missingInSource.join(', ')}`);
      }
      if (finalCols.length === 0) {
        console.log(`  ${tbl}: no overlapping columns, skipping`);
        continue;
      }

      const colList = finalCols.map((c) => `"${c}"`).join(', ');
      const BATCH = 1000;

      // Pre-stream the source rows OUTSIDE the dest transaction so the
      // transaction only covers the dest mutations. Cursor-stream into a
      // single dest transaction per table: TRUNCATE + bulk INSERTs commit
      // atomically; if any batch fails the table is rolled back to its
      // pre-migration state and other tables are unaffected.
      let copied = 0;
      try {
        await dest.begin(async (tx) => {
          // Defer FK + triggers for the lifetime of this transaction only.
          await tx`SET LOCAL session_replication_role = replica`;
          await tx.unsafe(`TRUNCATE TABLE "${tbl}" RESTART IDENTITY CASCADE`);

          const cursor = source.unsafe<any[]>(`SELECT ${colList} FROM "${tbl}"`).cursor(BATCH);
          for await (const rows of cursor) {
            if (!rows.length) continue;
            await tx`INSERT INTO ${tx(tbl)} ${tx(rows, ...finalCols)}`;
            copied += rows.length;
          }
        });
        console.log(`  ✓ ${tbl}: copied ${copied} rows`);
        totalCopied += copied;
      } catch (err: any) {
        failed++;
        console.error(`  ✗ ${tbl}: FAILED after ${copied} rows — rolled back. ${err?.message || err}`);
      }
    }

    // Reset all SERIAL/IDENTITY sequences in dest based on max(id).
    console.log('\n▶ Resetting sequences on dest to MAX(id) per table.');
    const seqRows = await dest<
      { table_name: string; column_name: string; sequence_name: string }[]
    >`
      SELECT
        c.table_name,
        c.column_name,
        pg_get_serial_sequence(c.table_schema || '.' || c.table_name, c.column_name) AS sequence_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND pg_get_serial_sequence(c.table_schema || '.' || c.table_name, c.column_name) IS NOT NULL
    `;
    for (const r of seqRows) {
      if (!r.sequence_name) continue;
      try {
        await dest.unsafe(
          `SELECT setval('${r.sequence_name}', COALESCE((SELECT MAX("${r.column_name}") FROM "${r.table_name}"), 0) + 1, false)`,
        );
      } catch (err: any) {
        console.log(`  ⚠ sequence reset failed for ${r.table_name}.${r.column_name}: ${err?.message || err}`);
      }
    }
    console.log(`  ✓ reset ${seqRows.length} sequences`);

    // Final per-table count diff.
    console.log('\n▶ Verification (source vs dest after copy):');
    let mismatched = 0;
    for (const tbl of tablesToMigrate) {
      const [{ c: sc }] = await source<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM ${source(tbl)}`;
      const [{ c: dc }] = await dest<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM ${dest(tbl)}`;
      const ok = sc === dc;
      if (!ok) mismatched++;
      console.log(`  ${ok ? '✓' : '✗'} ${tbl.padEnd(35)} src=${String(sc).padStart(7)}  dest=${String(dc).padStart(7)}`);
    }
    console.log(
      `\nMigration complete. ${totalCopied} rows copied. ` +
        `${failed} table failures (rolled back). ${mismatched} table count mismatches.`,
    );
    if (failed > 0 || mismatched > 0) process.exit(2);
  } finally {
    await source.end({ timeout: 5 });
    await dest.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
