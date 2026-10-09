#!/usr/bin/env node
/**
 * One-way prod → dev mask.
 *
 * Opens MASK_SOURCE_DATABASE_URL read-only, masks PII, and writes only to
 * MASK_TARGET_DATABASE_URL after the target passes assertSafeMaskTarget().
 *
 * Default is --check: validate the two URLs and exit. No connection.
 * --execute copies. Do not point the target at production.
 *
 * This script does not change schema and does not run db:push.
 */
import {
  COPY_TABLES,
  SOURCE_STARTUP_OPTIONS,
  assertConnectedEndpoints,
  assertSafeMaskTarget,
  assertSourceReadOnlySetting,
  describeIdentity,
  planCopy,
  selectAllSql,
  truncateSql,
} from "./lib/prod-to-dev-mask.mjs";

const CHUNK = 200;

function chunk(rows) {
  const batches = [];
  for (let i = 0; i < rows.length; i += CHUNK) batches.push(rows.slice(i, i + CHUNK));
  return batches;
}

async function readSource(source) {
  const sourceRowsByTable = {};
  for (const table of COPY_TABLES) {
    const sqlText = selectAllSql(table);
    sourceRowsByTable[table] = await source.unsafe(sqlText);
  }
  return sourceRowsByTable;
}

async function writeTarget(target, plan) {
  const statement = truncateSql(plan.tables.map((entry) => entry.table));
  await target.begin(async (tx) => {
    await tx.unsafe(statement);
    for (const entry of plan.tables) {
      if (!entry.rows.length) continue;
      const columns = Object.keys(entry.rows[0]);
      for (const batch of chunk(entry.rows)) {
        await tx`insert into ${tx(entry.table)} ${tx(batch, ...columns)}`;
      }
      await tx.unsafe(
        `select setval(pg_get_serial_sequence('${entry.table}', 'id'), coalesce((select max(id) from ${entry.table}), 1), true)`,
      );
    }
    for (const update of plan.activeRoleUpdates) {
      await tx`
        update users
        set active_role_id = ${update.active_role_id}
        where id = ${update.id}
          and exists (select 1 from user_roles where id = ${update.active_role_id})
      `;
    }
  });
}

async function executeCopy(sourceUrl, targetUrl, verdict) {
  const [{ default: postgres }, { getPostgresJsSslOption, normalizeDatabaseUrl }] = await Promise.all([
    import("postgres"),
    import("../server/lib/database-url.mjs"),
  ]);
  const source = postgres(normalizeDatabaseUrl(sourceUrl), {
    max: 1,
    ssl: getPostgresJsSslOption(sourceUrl),
    connection: { options: SOURCE_STARTUP_OPTIONS },
  });
  const target = postgres(normalizeDatabaseUrl(targetUrl), {
    max: 1,
    ssl: getPostgresJsSslOption(targetUrl),
  });

  try {
    const [sourceSetting] = await source`select current_setting('default_transaction_read_only') as v`;
    assertSourceReadOnlySetting(sourceSetting?.v);
    const [sourceDb] = await source`select current_database() as name`;
    const [targetDb] = await target`select current_database() as name`;
    assertConnectedEndpoints({
      sourceDatabase: sourceDb?.name,
      targetDatabase: targetDb?.name,
      verdict,
    });
    const sourceRows = await readSource(source);
    const counts = Object.fromEntries(
      COPY_TABLES.map((table) => [table, sourceRows[table]?.length ?? 0]),
    );
    console.log(`read source counts ${JSON.stringify(counts)}`);
    const plan = planCopy(sourceRows, new Date());
    await writeTarget(target, plan);
    console.log(`wrote ${plan.tables.length} tables to ${describeIdentity(verdict.target)}`);
  } finally {
    await source.end({ timeout: 5 });
    await target.end({ timeout: 5 });
  }
}

async function main() {
  const execute = process.argv.includes("--execute");
  const sourceUrl = process.env.MASK_SOURCE_DATABASE_URL;
  const targetUrl = process.env.MASK_TARGET_DATABASE_URL;
  const verdict = assertSafeMaskTarget({ sourceUrl, targetUrl });
  console.log(
    `mask check ok source=${describeIdentity(verdict.source)} target=${describeIdentity(verdict.target)}`,
  );
  if (!execute) {
    console.log("Check only. No connection opened. Pass --execute to copy into the dev target.");
    return;
  }
  await executeCopy(sourceUrl, targetUrl, verdict);
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("mask-prod-to-dev.mjs");
if (invokedDirectly) {
  main().catch((error) => {
    const code = error?.code ? ` (${error.code})` : "";
    console.error(`mask refused${code}: ${error?.message || error}`);
    process.exit(1);
  });
}
