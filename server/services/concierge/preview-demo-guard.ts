export class PreviewDemoRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewDemoRefused";
  }
}

const TRUTHY = new Set(["1", "true", "yes", "on"]);

/** True when the operator asked for the no-database preview. Does not mean it is safe. */
export function isPreviewDemoRequested(): boolean {
  return TRUTHY.has((process.env.PREVIEW_DEMO_MODE || "").trim().toLowerCase());
}

function envSet(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

/**
 * Replit marks a process with REPL_ID, REPL_OWNER, REPL_SLUG, or any REPLIT_* variable.
 * Returns the first name that is set, or null.
 */
export function replitStyleEnvName(): string | null {
  if (envSet("REPL_ID")) return "REPL_ID";
  if (envSet("REPL_OWNER")) return "REPL_OWNER";
  if (envSet("REPL_SLUG")) return "REPL_SLUG";
  const replitKey = Object.keys(process.env)
    .filter((key) => key.startsWith("REPLIT_") && envSet(key))
    .sort()[0];
  return replitKey ?? null;
}

/**
 * A URL looks like production when it points at a hosted app database
 * or the database name contains "prod". An empty URL does not.
 */
export function databaseUrlLooksLikeProd(url: string | undefined): boolean {
  if (!url || !url.trim()) return false;
  const lower = url.toLowerCase();
  if (
    lower.includes("supabase") ||
    lower.includes("neon.tech") ||
    lower.includes("neon.database") ||
    lower.includes("rlwy.net") ||
    lower.includes("replit")
  ) {
    return true;
  }
  try {
    const parsed = new URL(lower.replace(/^postgres(ql)?:\/\//, "https://"));
    const dbName = decodeURIComponent((parsed.pathname || "").replace(/^\//, "").split("/")[0] || "");
    if (dbName.includes("prod")) return true;
  } catch {
    return true;
  }
  return false;
}

/**
 * Demo mode runs only on the Vercel project that serves this preview.
 * That project uses its Vercel production alias, so VERCEL_ENV is not checked.
 * When the flag is unset, this returns without throwing.
 */
export function assertPreviewDemoAllowed(): void {
  if (!isPreviewDemoRequested()) return;

  if (process.env.VERCEL !== "1") {
    throw new PreviewDemoRefused(
      "Refusing PREVIEW_DEMO_MODE because VERCEL=1 is required",
    );
  }
  if (envSet("REPLIT_DEPLOYMENT")) {
    throw new PreviewDemoRefused(
      "Refusing PREVIEW_DEMO_MODE because REPLIT_DEPLOYMENT is set",
    );
  }
  const replitEnv = replitStyleEnvName();
  if (replitEnv) {
    throw new PreviewDemoRefused(
      `Refusing PREVIEW_DEMO_MODE because a Replit environment variable is set (${replitEnv})`,
    );
  }
  if (databaseUrlLooksLikeProd(process.env.DATABASE_URL)) {
    throw new PreviewDemoRefused(
      "Refusing PREVIEW_DEMO_MODE because DATABASE_URL looks like production",
    );
  }
}

/** Vercel entry: demo mode is required, and it must pass the guard. */
export function requirePreviewDemo(): void {
  if (!isPreviewDemoRequested()) {
    throw new PreviewDemoRefused(
      "PREVIEW_DEMO_MODE must be set. This preview does not connect to a database.",
    );
  }
  assertPreviewDemoAllowed();
}
