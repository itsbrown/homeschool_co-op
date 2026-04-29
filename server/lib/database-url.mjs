/**
 * Hostname suffixes for managed Postgres providers that require TLS even when
 * the app is running in development. SSL is forced on for these hosts even
 * when `NODE_ENV !== 'production'` so any cloud Postgres URL configured in
 * dev (e.g. a one-off Supabase/Neon/RDS connection a developer points at
 * locally) does not fail with `connection is insecure (try using
 * sslmode=require)`.
 */
const MANAGED_POSTGRES_SUFFIXES = [
  '.neon.tech',
  '.supabase.co',
  '.pooler.supabase.com',
  '.rds.amazonaws.com',
  '.aivencloud.com',
  '.azure.com',
  '.digitalocean.com',
  '.cockroachlabs.cloud',
];

function urlRequiresSsl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(normalizeDatabaseUrl(rawUrl));
  } catch (_err) {
    return false;
  }
  const sslmode = parsed.searchParams.get('sslmode');
  if (sslmode && sslmode !== 'disable' && sslmode !== 'allow') {
    return true;
  }
  const host = (parsed.hostname || '').toLowerCase();
  return MANAGED_POSTGRES_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Configuration for `pg.Pool` / `pg.Client` SSL. Defaults to "disabled" in
 * non-production so the local Replit Helium dev DB (plain TCP) can connect.
 * If a URL is supplied and it points at a managed cloud Postgres host (Neon,
 * Supabase, RDS, etc.) or carries `sslmode=require|verify-*`, SSL is forced
 * on regardless of `NODE_ENV` so dev fallbacks to those providers don't fail
 * with `connection is insecure (try using sslmode=require)`.
 */
export function getDbSslConfig(connectionString) {
  if (process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: false };
  }
  if (urlRequiresSsl(connectionString)) {
    return { rejectUnauthorized: false };
  }
  return false;
}

/**
 * Same logic as `getDbSslConfig()` but for the `postgres-js` (`postgres()`)
 * client, which accepts the same shape.
 */
export function getPostgresJsSslOption(connectionString) {
  if (process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: false };
  }
  if (urlRequiresSsl(connectionString)) {
    return { rejectUnauthorized: false };
  }
  return false;
}

/**
 * Normalize a Postgres connection URL so that a password containing characters
 * that are reserved in URLs (e.g. `+`, `?`, `)`, `(`, `#`, `&`, `/`, `@`, `:`)
 * is properly percent-encoded.
 *
 * Both `pg` (via `pg-connection-string`) and `postgres-js` rely on the WHATWG
 * URL parser, which throws on un-encoded special characters in the userinfo
 * section. Supabase-style passwords frequently include `+`, `?`, and `)`, so
 * an unmodified URL like:
 *
 *     postgresql://postgres:abc+d?ef)gh@host:5432/postgres
 *
 * fails with "Invalid URL". This helper detects such cases by attempting to
 * parse the URL with `new URL()` and, on failure, falls back to a regex-based
 * extraction that re-encodes only the password component before reassembling
 * the connection string.
 *
 * If the URL parses cleanly it is returned unchanged. If the URL is empty or
 * cannot be repaired (e.g. completely malformed input), the original input is
 * returned so the caller can surface its own connection error rather than
 * receiving a silently mangled value.
 *
 * @param {string | undefined | null} rawUrl
 * @returns {string | undefined | null}
 */
export function normalizeDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;

  try {
    new URL(rawUrl);
    return rawUrl;
  } catch {
    // Fall through to manual repair.
  }

  const match = rawUrl.match(/^(postgres(?:ql)?:\/\/)([^:@/]+):([\s\S]*)@([^@/]+)(\/[\s\S]*)?$/);
  if (!match) return rawUrl;

  const [, scheme, user, password, hostAndPort, pathAndQuery = ''] = match;
  const encodedPassword = encodeURIComponent(password);
  const repaired = `${scheme}${user}:${encodedPassword}@${hostAndPort}${pathAndQuery}`;

  try {
    new URL(repaired);
    return repaired;
  } catch {
    return rawUrl;
  }
}

/**
 * Convenience wrapper that returns the single Postgres connection URL the
 * app should use, normalized for the WHATWG URL parser.
 *
 * `DATABASE_URL` is the single source of truth in every environment — the
 * Reserved VM injects it in production and Replit injects it in dev when
 * the project is linked to a managed Postgres database (Helium). There is
 * no `PG*` fallback and no `NEON_DATABASE_URL` fallback.
 *
 * Returns `undefined` when `DATABASE_URL` is not set so callers can decide
 * whether to throw or run in a no-DB mode.
 *
 * @returns {string | undefined}
 */
export function getNormalizedDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  return normalizeDatabaseUrl(raw) ?? undefined;
}
