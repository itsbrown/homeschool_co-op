/**
 * Merge repo `.env` / `.env.local` into `process.env`.
 *
 * Default: never overwrite a variable already set (CI, Replit, `with-prod-env`).
 * Exception: a leftover login-shell URL for the retired Neon `asa_test` database
 * is ignored in favor of the file value so local `npm run dev` uses the project
 * `.env` (Railway clone). Production Neon URLs are not `asa_test` and are kept.
 */

export const RETIRED_NEON_TEST_DB = "asa_test";

const FILE_WINS_WHEN_RETIRED_NEON = new Set(["DATABASE_URL", "TEST_DATABASE_URL"]);

export function postgresUrlParts(raw: string | undefined): {
  hostname: string | null;
  database: string | null;
} {
  if (!raw) return { hostname: null, database: null };
  try {
    const u = new URL(raw);
    const database = decodeURIComponent(u.pathname.replace(/^\//, "")).split("?")[0] || null;
    return { hostname: u.hostname || null, database };
  } catch {
    const hostMatch = raw.match(/@([^/:?]+)(?::\d+)?\//);
    const dbMatch = raw.match(/\/([^/?]+)(?:\?|$)/);
    return {
      hostname: hostMatch?.[1] ?? null,
      database: dbMatch?.[1] ?? null,
    };
  }
}

export function isRetiredNeonTestUrl(raw: string | undefined): boolean {
  const { hostname, database } = postgresUrlParts(raw);
  if (!hostname || !database) return false;
  return hostname.toLowerCase().endsWith(".neon.tech") && database.toLowerCase() === RETIRED_NEON_TEST_DB;
}

export function isInjectedDatabaseEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.CI === "true" ||
    env.NODE_ENV === "production" ||
    Boolean(env.REPL_ID)
  );
}

export function applyLocalEnv(options: {
  processEnv: NodeJS.ProcessEnv;
  fileVars: Record<string, string>;
  injectedEnv: boolean;
  log?: (message: string) => void;
}): void {
  const log = options.log ?? console.log;
  for (const [key, value] of Object.entries(options.fileVars)) {
    const existing = options.processEnv[key];
    if (existing === undefined || existing === "") {
      options.processEnv[key] = value;
      continue;
    }
    if (options.injectedEnv || !FILE_WINS_WHEN_RETIRED_NEON.has(key) || existing === value) {
      continue;
    }
    const shellParts = postgresUrlParts(existing);
    const fileParts = postgresUrlParts(value);
    if (
      isRetiredNeonTestUrl(existing) &&
      fileParts.hostname &&
      fileParts.hostname !== shellParts.hostname
    ) {
      log(
        `[local-env] Ignoring retired Neon ${key} host=${shellParts.hostname} db=${shellParts.database}; using .env host=${fileParts.hostname}`,
      );
      options.processEnv[key] = value;
    } else if (shellParts.hostname && fileParts.hostname && shellParts.hostname !== fileParts.hostname) {
      log(
        `[local-env] Keeping shell ${key} host=${shellParts.hostname} (does not match .env host=${fileParts.hostname}). One-off DB: put it in .env.local. Prod scripts: use with-prod-env.mjs.`,
      );
    }
  }
}
