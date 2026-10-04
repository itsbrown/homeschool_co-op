#!/usr/bin/env node
/**
 * Hard stop for drizzle-kit push / npm run db:push / schema sync.
 *
 * Refuses when any production indicator is present. ALLOW_DB_PUSH=1 does not
 * override those. For a disposable local or CI database, ALLOW_DB_PUSH must
 * be exactly "1" or the push is refused.
 *
 * Never include DATABASE_URL, passwords, or keys in the refusal text.
 */
import { fileURLToPath } from 'node:url';

/** Supabase project ref for "Adaptive Learning Program" (moivwjuglwwfrhqeewju). */
export const KNOWN_PRODUCTION_MARKERS = ['moivwjuglwwfrhqeewju'];

const HOST_ENV_KEYS = ['PROD_DATABASE_HOST', 'PRODUCTION_DATABASE_HOST'];
const URL_ENV_KEYS = ['PROD_DATABASE_URL', 'PRODUCTION_DATABASE_URL'];

function hostnameFrom(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const normalized = raw.replace(/^postgres(ql)?:\/\//i, 'http://');
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    const match = raw.match(/@([^/:?#\s]+)/);
    return match ? match[1].toLowerCase() : null;
  }
}

function productionMarkers(env) {
  const markers = [...KNOWN_PRODUCTION_MARKERS];
  for (const key of HOST_ENV_KEYS) {
    for (const part of String(env[key] || '').split(',')) {
      const trimmed = part.trim().toLowerCase();
      if (trimmed) markers.push(trimmed);
    }
  }
  for (const key of URL_ENV_KEYS) {
    const host = hostnameFrom(env[key]);
    if (host) markers.push(host);
  }
  return markers;
}

function urlMatchesProduction(databaseUrl, env) {
  const haystack = String(databaseUrl).toLowerCase();
  return productionMarkers(env).some((marker) => marker && haystack.includes(marker.toLowerCase()));
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ allowed: boolean, reasons: string[] }}
 */
export function evaluateDbPush(env = process.env) {
  const reasons = [];

  if (String(env.NODE_ENV || '').toLowerCase() === 'production') {
    reasons.push('NODE_ENV=production');
  }

  if (String(env.REPLIT_DEPLOYMENT || '').trim() !== '') {
    reasons.push('REPLIT_DEPLOYMENT is set');
  }

  const databaseUrl = String(env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    reasons.push('DATABASE_URL is not set');
  } else if (urlMatchesProduction(databaseUrl, env)) {
    reasons.push('DATABASE_URL points at a known production host');
  }

  if (reasons.length === 0 && String(env.ALLOW_DB_PUSH || '') !== '1') {
    reasons.push('ALLOW_DB_PUSH=1 is required (disposable local or CI databases only)');
  }

  return { allowed: reasons.length === 0, reasons };
}

export function refusalMessage(reasons) {
  return [
    'Refusing schema push (drizzle-kit push / db:push).',
    ...reasons.map((reason) => `- ${reason}`),
    'Production schema changes are additive SQL files in server/migrations/ only.',
    'ALLOW_DB_PUSH=1 does not override NODE_ENV=production, REPLIT_DEPLOYMENT, or a production DATABASE_URL.',
  ].join('\n');
}

export function assertDbPushAllowed(env = process.env) {
  const result = evaluateDbPush(env);
  if (!result.allowed) {
    const error = new Error(refusalMessage(result.reasons));
    error.reasons = result.reasons;
    throw error;
  }
  return result;
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === entry;
}

if (isDirectRun()) {
  try {
    assertDbPushAllowed();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
