export class PreviewDemoRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewDemoRefused";
  }
}

const TRUTHY = new Set(["1", "true", "yes", "on"]);

/** Vercel project `asa-concierge-preview`. Production alias is allowed only for this project. */
export const CONCIERGE_PREVIEW_PROJECT_ID = "prj_CAJuC46Z8ur1WKWqgdr1VnHkVUZj";
export const CONCIERGE_PREVIEW_PRODUCTION_HOST = "asa-concierge-preview.vercel.app";

/** Any non-empty value blocks demo mode. Presence is enough; the value is not inspected. */
export const DEMO_BLOCKED_ENV = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
] as const;

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

function isConciergePreviewProductionUrl(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase().replace(/\/$/, "");
  return (
    trimmed === CONCIERGE_PREVIEW_PRODUCTION_HOST ||
    trimmed === `https://${CONCIERGE_PREVIEW_PRODUCTION_HOST}`
  );
}

/** True only for the concierge preview Vercel project, by id or by its production hostname. */
export function isConciergePreviewProject(): boolean {
  if (process.env.VERCEL_PROJECT_ID === CONCIERGE_PREVIEW_PROJECT_ID) return true;
  return isConciergePreviewProductionUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL);
}

/**
 * Demo mode runs only on Vercel, and only with no database or Supabase configuration.
 * VERCEL_ENV=production is allowed only for the concierge preview project.
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
  if ((process.env.VERCEL_ENV || "").trim() === "production" && !isConciergePreviewProject()) {
    throw new PreviewDemoRefused(
      "Refusing PREVIEW_DEMO_MODE because VERCEL_ENV=production is only allowed for the concierge preview project",
    );
  }
  for (const name of DEMO_BLOCKED_ENV) {
    if (envSet(name)) {
      throw new PreviewDemoRefused(
        `Refusing PREVIEW_DEMO_MODE because ${name} is set`,
      );
    }
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
