import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const authParentStorage = path.join("playwright", ".auth", "parent.json");

/** When set, Playwright adds a setup project + `chromium-authenticated` (avoids loading a missing storageState file). */
const e2eParentAuthEnabled = !!(
  process.env.E2E_PARENT_EMAIL?.trim() && process.env.E2E_PARENT_PASSWORD?.trim()
);

/** Placeholder values so `npm run dev` can boot when CI has no `.env` (Supabase JS only validates shape at init). */
const defaultSupabaseUrl = "http://127.0.0.1:54321";
const defaultSupabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
/** Local Supabase CLI default service_role JWT (E2E placeholder only). */
const defaultSupabaseServiceRoleKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/** GitHub Actions sets missing secrets to "" — treat empty like unset. */
function envOr(key: string, fallback: string): string {
  const v = process.env[key]?.trim();
  return v || fallback;
}

const supabaseUrl = envOr("SUPABASE_URL", defaultSupabaseUrl);
const supabaseAnonKey = envOr("SUPABASE_ANON_KEY", defaultSupabaseAnonKey);

const webServerEnv = {
  ...process.env,
  SUPABASE_URL: supabaseUrl,
  SUPABASE_ANON_KEY: supabaseAnonKey,
  SUPABASE_SERVICE_ROLE_KEY: envOr(
    "SUPABASE_SERVICE_ROLE_KEY",
    defaultSupabaseServiceRoleKey,
  ),
  VITE_SUPABASE_URL: envOr("VITE_SUPABASE_URL", supabaseUrl),
  VITE_SUPABASE_ANON_KEY: envOr("VITE_SUPABASE_ANON_KEY", supabaseAnonKey),
  /** Required at import time by `server/services/openai.ts` (value is not used by smoke tests). */
  OPENAI_API_KEY: envOr("OPENAI_API_KEY", "sk-e2e-placeholder-not-used-in-smoke-tests"),
  /**
   * So `server/test-env-loader.ts` + `/api/stripe/config` succeed without a local `.env`.
   * Stripe sample test keys (not live); override with real test keys for checkout E2E.
   */
  TESTING_STRIPE_SECRET_KEY: envOr(
    "TESTING_STRIPE_SECRET_KEY",
    "sk_test_4eC39HqLyjWDarjtT1ColDPY",
  ),
  VITE_TESTING_STRIPE_PUBLIC_KEY: envOr(
    "VITE_TESTING_STRIPE_PUBLIC_KEY",
    "pk_test_TYooMQauvdEDq54MiTPhN7XR",
  ),
  /** Avoid SO_REUSEPORT where unsupported (Playwright / some macOS sandboxes). */
  DISABLE_LISTEN_REUSE_PORT: envOr("DISABLE_LISTEN_REUSE_PORT", "true"),
  /** Skip interval jobs when the dev server is started by Playwright's webServer. */
  PLAYWRIGHT_WEB_SERVER: envOr("PLAYWRIGHT_WEB_SERVER", "true"),
  /** Expose `window.__E2E_CART__.refreshDiscounts` for Playwright membership regression tests. */
  VITE_E2E_EXPOSE_CART: envOr("VITE_E2E_EXPOSE_CART", "true"),
};

/**
 * E2E tests assume the same dev stack as `npm run dev` (Express + Vite on port 5000).
 * Override `SUPABASE_*` / `VITE_SUPABASE_*` in the environment for real auth flows.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter:
    process.env.GITHUB_ACTIONS === "true"
      ? "github"
      : process.env.CI
        ? "list"
        : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    ...(e2eParentAuthEnabled
      ? ([
          /** Saves `playwright/.auth/parent.json` for logged-in specs. */
          { name: "setup", testMatch: /auth\.setup\.ts/ },
        ] as const)
      : []),
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [/auth\.setup\.ts$/, /authenticated\//],
    },
    ...(e2eParentAuthEnabled
      ? ([
          {
            name: "chromium-authenticated",
            use: {
              ...devices["Desktop Chrome"],
              storageState: authParentStorage,
            },
            dependencies: ["setup" as const],
            testMatch: /authenticated\/.*\.spec\.ts/,
          },
        ] as const)
      : []),
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5000/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: webServerEnv,
  },
});
