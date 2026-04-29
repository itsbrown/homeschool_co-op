/**
 * Shared database connection helpers.
 *
 * SSL is required by our managed production database but is NOT supported
 * by the Replit-managed local development database (Helium), which speaks
 * plain TCP on the same machine as the app. Anything that opens a Postgres
 * connection should consult `getDbSslConfig()` so we keep a single source
 * of truth for that decision. Both SSL helpers also accept an optional
 * connection string and will force SSL on for managed cloud Postgres hosts
 * (Neon, Supabase, RDS, etc.) regardless of `NODE_ENV`, so the dev
 * `NEON_DATABASE_URL` fallback in `server/db.ts` doesn't fail with
 * `connection is insecure (try using sslmode=require)`.
 *
 * `normalizeDatabaseUrl()` ensures that a raw `DATABASE_URL` whose password
 * contains URL-reserved characters (such as `+`, `?`, `)`) is percent-encoded
 * before it is handed to `pg` or `postgres-js`, both of which rely on the
 * WHATWG URL parser and otherwise fail with "Invalid URL" at startup.
 *
 * The implementation lives in the sibling `database-url.mjs` file so that
 * plain ESM scripts (`*.mjs`) can share the exact same logic without a
 * TypeScript build step. This file just re-exports it with TS types.
 */

import {
  getDbSslConfig as getDbSslConfigImpl,
  getPostgresJsSslOption as getPostgresJsSslOptionImpl,
  normalizeDatabaseUrl as normalizeDatabaseUrlImpl,
  getNormalizedDatabaseUrl as getNormalizedDatabaseUrlImpl,
} from './database-url.mjs';

export type PgSslConfig = { rejectUnauthorized: false } | false;

export const getDbSslConfig: (connectionString?: string) => PgSslConfig =
  getDbSslConfigImpl;
export const getPostgresJsSslOption: (connectionString?: string) => PgSslConfig =
  getPostgresJsSslOptionImpl;

/**
 * Percent-encode a Postgres URL's password if needed and return a value the
 * WHATWG URL parser will accept. Returns `undefined` / `null` / `''` /
 * non-string inputs unchanged so callers can keep their existing handling
 * for unset secrets.
 */
export function normalizeDatabaseUrl(rawUrl: string): string;
export function normalizeDatabaseUrl(rawUrl: undefined): undefined;
export function normalizeDatabaseUrl(rawUrl: null): null;
export function normalizeDatabaseUrl(
  rawUrl: string | undefined | null,
): string | undefined | null {
  return normalizeDatabaseUrlImpl(rawUrl);
}

export const getNormalizedDatabaseUrl: () => string | undefined = getNormalizedDatabaseUrlImpl;
