/**
 * Shared database connection helpers.
 *
 * SSL is required by our managed production database but is NOT supported
 * by the Replit-managed local development database (Helium), which speaks
 * plain TCP on the same machine as the app. Anything that opens a Postgres
 * connection should consult `getDbSslConfig()` so we keep a single source
 * of truth for that decision.
 *
 * The implementation lives in the sibling `database-url.mjs` file so that
 * plain ESM scripts (`*.mjs`) can share the exact same logic without a
 * TypeScript build step. This file just re-exports it with TS types.
 */

import {
  getDbSslConfig as getDbSslConfigImpl,
  getPostgresJsSslOption as getPostgresJsSslOptionImpl,
} from './database-url.mjs';

type PgSslConfig = { rejectUnauthorized: false } | false;

export const getDbSslConfig: () => PgSslConfig = getDbSslConfigImpl;
export const getPostgresJsSslOption: () => PgSslConfig = getPostgresJsSslOptionImpl;
