/**
 * Plain-JS copy for Node scripts that cannot import the TypeScript module.
 * Keep the project ref, host, and error text aligned with
 * server/lib/e2e-supabase-project-guard.ts.
 */

export const LIVE_ASA_SUPABASE_PROJECT_REF = "moivwjuglwwfrhqeewju";
export const LIVE_ASA_SUPABASE_HOST = "moivwjuglwwfrhqeewju.supabase.co";

export const E2E_LIVE_SUPABASE_PROJECT_MESSAGE =
  "Refusing to create Supabase auth users: SUPABASE_URL or VITE_SUPABASE_URL points at the live Adaptive Learning Program project " +
  `(${LIVE_ASA_SUPABASE_PROJECT_REF} / https://${LIVE_ASA_SUPABASE_HOST}). ` +
  "Point E2E secrets (E2E_SUPABASE_URL, E2E_VITE_SUPABASE_URL, and the matching anon and service-role keys) at a dedicated Supabase project. " +
  "Never use Adaptive Learning Program for E2E or test seeds.";

export function supabaseUrlTargetsLiveAsaProject(url) {
  if (!url) return false;
  const normalized = String(url).trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes(LIVE_ASA_SUPABASE_PROJECT_REF) ||
    normalized.includes(LIVE_ASA_SUPABASE_HOST)
  );
}

export function assertE2eSupabaseProjectIsDedicated(env = process.env) {
  if (
    supabaseUrlTargetsLiveAsaProject(env.SUPABASE_URL) ||
    supabaseUrlTargetsLiveAsaProject(env.VITE_SUPABASE_URL)
  ) {
    throw new Error(E2E_LIVE_SUPABASE_PROJECT_MESSAGE);
  }
}
