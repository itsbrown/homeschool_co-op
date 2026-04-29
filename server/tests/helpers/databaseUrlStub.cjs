'use strict';

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
  if (sslmode && sslmode !== 'disable' && sslmode !== 'allow') return true;
  const host = (parsed.hostname || '').toLowerCase();
  return MANAGED_POSTGRES_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function getDbSslConfig(connectionString) {
  if (process.env.NODE_ENV === 'production') return { rejectUnauthorized: false };
  if (urlRequiresSsl(connectionString)) return { rejectUnauthorized: false };
  return false;
}

function getPostgresJsSslOption(connectionString) {
  if (process.env.NODE_ENV === 'production') return { rejectUnauthorized: false };
  if (urlRequiresSsl(connectionString)) return { rejectUnauthorized: false };
  return false;
}

function normalizeDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;

  try {
    new URL(rawUrl);
    return rawUrl;
  } catch (_err) {
    // Fall through to manual repair.
  }

  const match = rawUrl.match(/^(postgres(?:ql)?:\/\/)([^:@/]+):([\s\S]*)@([^@/]+)(\/[\s\S]*)?$/);
  if (!match) return rawUrl;

  const scheme = match[1];
  const user = match[2];
  const password = match[3];
  const hostAndPort = match[4];
  const pathAndQuery = match[5] || '';
  const repaired =
    scheme + user + ':' + encodeURIComponent(password) + '@' + hostAndPort + pathAndQuery;

  try {
    new URL(repaired);
    return repaired;
  } catch (_err2) {
    return rawUrl;
  }
}

function getNormalizedDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  return normalizeDatabaseUrl(raw) || undefined;
}

module.exports = {
  getDbSslConfig,
  getPostgresJsSslOption,
  normalizeDatabaseUrl,
  getNormalizedDatabaseUrl,
};
