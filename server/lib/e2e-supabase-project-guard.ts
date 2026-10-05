/**
 * E2E and test seeds must never create Supabase Auth users on the live
 * Adaptive Learning Program project. GitHub Actions E2E reads
 * E2E_SUPABASE_URL / E2E_VITE_SUPABASE_URL into SUPABASE_URL / VITE_SUPABASE_URL.
 * Those secrets previously pointed at this project, and each run left
 * hundreds of @test.com auth users behind.
 *
 * Production signup (NODE_ENV=production, no Playwright web server) still
 * uses this project. This guard is for seed/E2E writers only.
 */

/** Supabase project ref for Adaptive Learning Program. */
export const LIVE_ASA_SUPABASE_PROJECT_REF = "moivwjuglwwfrhqeewju";

/** Adaptive Learning Program host (`https://<ref>.supabase.co`). */
export const LIVE_ASA_SUPABASE_HOST = "moivwjuglwwfrhqeewju.supabase.co";

export const E2E_LIVE_SUPABASE_PROJECT_CODE = "E2E_SUPABASE_LIVE_PROJECT";

export const E2E_LIVE_SUPABASE_PROJECT_MESSAGE =
  "Refusing to create Supabase auth users: SUPABASE_URL or VITE_SUPABASE_URL points at the live Adaptive Learning Program project " +
  `(${LIVE_ASA_SUPABASE_PROJECT_REF} / https://${LIVE_ASA_SUPABASE_HOST}). ` +
  "Point E2E secrets (E2E_SUPABASE_URL, E2E_VITE_SUPABASE_URL, and the matching anon and service-role keys) at a dedicated Supabase project. " +
  "Never use Adaptive Learning Program for E2E or test seeds.";

export class E2eLiveSupabaseProjectError extends Error {
  readonly code = E2E_LIVE_SUPABASE_PROJECT_CODE;

  constructor(message: string = E2E_LIVE_SUPABASE_PROJECT_MESSAGE) {
    super(message);
    this.name = "E2eLiveSupabaseProjectError";
  }
}

export function supabaseUrlTargetsLiveAsaProject(url: string | undefined | null): boolean {
  if (!url) return false;
  const normalized = url.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes(LIVE_ASA_SUPABASE_PROJECT_REF) ||
    normalized.includes(LIVE_ASA_SUPABASE_HOST)
  );
}

/** True when either server or browser Supabase URL is Adaptive Learning Program. */
export function envTargetsLiveAsaSupabase(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    supabaseUrlTargetsLiveAsaProject(env.SUPABASE_URL) ||
    supabaseUrlTargetsLiveAsaProject(env.VITE_SUPABASE_URL)
  );
}

/**
 * Always throws when this process would write E2E/test auth users to the live project.
 * Call this from seed helpers and test-account scripts before any Auth admin call.
 */
export function assertE2eSupabaseProjectIsDedicated(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (envTargetsLiveAsaSupabase(env)) {
    throw new E2eLiveSupabaseProjectError();
  }
}

/**
 * Playwright's webServer sets PLAYWRIGHT_WEB_SERVER=true (see playwright.config.ts).
 * Shared signup/invite routes also create Auth users during E2E. Refuse the live
 * project only in that process so production registration on Adaptive Learning
 * Program keeps working. Jest does not set this flag.
 */
export function assertPlaywrightServerUsesDedicatedSupabase(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.PLAYWRIGHT_WEB_SERVER !== "true") return;
  assertE2eSupabaseProjectIsDedicated(env);
}

export function liveAsaSupabaseHttpError(
  error: unknown,
): { status: 403; message: string; code: string } | null {
  if (!(error instanceof E2eLiveSupabaseProjectError)) return null;
  return { status: 403, message: error.message, code: error.code };
}

/** Body flags such as linkSupabaseAuth, linkSupabaseAuthAdmin, linkSupabaseAuthParentB. */
export function requestLinksSupabaseAuth(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return Object.entries(body as Record<string, unknown>).some(
    ([key, value]) => key.startsWith("linkSupabaseAuth") && value === true,
  );
}
