const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export class ConciergeSeedRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConciergeSeedRefused";
  }
}

/**
 * The concierge seed writes only to a local Postgres database.
 * It does not read DATABASE_URL unless that URL is the same local URL.
 */
export function assertLocalPostgresUrl(url: string | undefined): void {
  if (process.env.NODE_ENV === "production") {
    throw new ConciergeSeedRefused("Refusing to seed when NODE_ENV=production");
  }
  if (!url || !url.trim()) {
    throw new ConciergeSeedRefused("Set CONCIERGE_LOCAL_DATABASE_URL to a local Postgres URL");
  }
  let parsed: URL;
  try {
    parsed = new URL(url.replace(/^postgres(ql)?:\/\//, "postgresql://"));
  } catch {
    throw new ConciergeSeedRefused("Concierge seed URL is not a Postgres URL");
  }
  if (parsed.protocol !== "postgresql:") {
    throw new ConciergeSeedRefused("Concierge seed URL must be postgres");
  }
  const host = parsed.hostname.toLowerCase();
  if (!LOCAL_HOSTS.has(host)) {
    throw new ConciergeSeedRefused("Refusing concierge seed: database host is not local");
  }
  const haystack = `${host} ${parsed.pathname}`.toLowerCase();
  if (haystack.includes("supabase") || haystack.includes("neon.tech") || haystack.includes("rlwy.net") || haystack.includes("replit")) {
    throw new ConciergeSeedRefused("Refusing concierge seed: hosted database");
  }
  const dbName = decodeURIComponent((parsed.pathname || "").replace(/^\//, "").split("/")[0] || "").toLowerCase();
  if (!dbName) throw new ConciergeSeedRefused("Concierge seed URL is missing a database name");
  if (dbName.includes("prod")) {
    throw new ConciergeSeedRefused("Refusing concierge seed: database name looks like production");
  }
  if (!dbName.includes("local") && !dbName.includes("test")) {
    throw new ConciergeSeedRefused("Concierge seed database name must include local or test");
  }
}

export function resolveConciergeLocalUrl(): string {
  const explicit = process.env.CONCIERGE_LOCAL_DATABASE_URL?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (explicit && databaseUrl && explicit !== databaseUrl) {
    throw new ConciergeSeedRefused("CONCIERGE_LOCAL_DATABASE_URL and DATABASE_URL must be the same local URL");
  }
  const url = explicit || databaseUrl;
  assertLocalPostgresUrl(url);
  return url as string;
}
