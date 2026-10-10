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

export function isReplitRuntime(): boolean {
  return Boolean(
    process.env.REPL_ID ||
      process.env.REPLIT_DEPLOYMENT ||
      process.env.REPL_OWNER ||
      process.env.REPLIT_DEV_DOMAIN,
  );
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
 * Demo mode may run on a Vercel preview (NODE_ENV is production there).
 * It must not run when this process is Replit production, or when DATABASE_URL
 * points at a hosted or production-named database.
 * When the flag is unset, this returns without throwing.
 */
export function assertPreviewDemoAllowed(): void {
  if (!isPreviewDemoRequested()) return;
  if (process.env.NODE_ENV === "production" && isReplitRuntime()) {
    throw new PreviewDemoRefused(
      "Refusing PREVIEW_DEMO_MODE because NODE_ENV=production on Replit",
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
