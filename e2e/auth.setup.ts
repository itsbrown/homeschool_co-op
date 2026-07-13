import { test as setup } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const authFile = path.join(process.cwd(), "playwright", ".auth", "parent.json");

/**
 * Runs once before `chromium-authenticated` tests (see playwright.config.ts).
 * Requires real Supabase env in the webServer + browser (not the demo JWT placeholders).
 *
 *   E2E_PARENT_EMAIL=...
 *   E2E_PARENT_PASSWORD=...
 */
setup("authenticate parent", async ({ page }) => {
  const email = process.env.E2E_PARENT_EMAIL;
  const password = process.env.E2E_PARENT_PASSWORD;
  if (!email || !password) {
    throw new Error("E2E_PARENT_EMAIL and E2E_PARENT_PASSWORD must be set when the setup project runs");
  }

  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto("/login", { waitUntil: "load" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();

  // Parent users redirect to /dashboard; multi-role accounts may stay on /login until they pick a role — use a single-role parent for E2E.
  // CI uses an ephemeral Postgres: Supabase may accept the login while the app returns REGISTRATION_REQUIRED.
  const leftLogin = await page
    .waitForURL((url) => !/\/login\/?$/.test(url.pathname), { timeout: 45_000 })
    .then(() => true)
    .catch(() => false);

  if (!leftLogin) {
    setup.skip(
      true,
      `E2E_PARENT_* could not leave /login (app user missing in test DB — seed that parent or unset E2E_PARENT_EMAIL)`,
    );
  }

  await page.context().storageState({ path: authFile });
});
