/**
 * Phase 1 additive parent+staff nav (Chelsey / parent+Mentor).
 * Do not use playwright/.auth/parent.json — that fixture is single-role.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginParent } from "./helpers/parentCheckoutHelpers";
import {
  postSetupAdditiveNavScenario,
  type SetupAdditiveNavScenarioResponse,
} from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

function visible(page: Page, testId: string) {
  return page.getByTestId(testId).locator("visible=true");
}

test.describe("Phase 1 additive parent+staff nav", () => {
  let seed: NonNullable<SetupAdditiveNavScenarioResponse["data"]>;

  test.beforeAll(async ({ request }) => {
    const { response, json } = await postSetupAdditiveNavScenario(request, {
      linkSupabaseAuth: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.parentMentor?.email, "seed returned no parentMentor credentials");
    test.skip(
      json.data?.supabaseLinked !== true,
      "Supabase auth was not linked (configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
    );
    seed = json.data!;
  });

  test("UC-01 parent-only keeps a flat family sidebar (no Teaching)", async ({ page }) => {
    await loginParent(page, seed.parentOnly.email, seed.parentOnly.password);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("shell-parent")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("nav-group-teaching")).toHaveCount(0);
    await expect(page.getByTestId("nav-group-family")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "My Children" }).first()).toBeVisible();
    await expect(page.getByTestId("role-switcher")).toHaveCount(0);
  });

  test("UC-02 educator-only stays in educator chrome (no Family)", async ({ page }) => {
    await loginParent(page, seed.educatorOnly.email, seed.educatorOnly.password);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("shell-educator")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("shell-parent")).toHaveCount(0);
    await expect(page.getByTestId("nav-group-family")).toHaveCount(0);
    await expect(page.getByTestId("role-switcher")).toHaveCount(0);
  });

  test("UC-03 parent+Mentor (active parent) gets Family + Teaching in parent chrome", async ({ page }) => {
    await loginParent(page, seed.parentMentor.email, seed.parentMentor.password);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("shell-parent")).toBeVisible({ timeout: 30_000 });
    await expect(visible(page, "nav-group-family")).toBeVisible();
    await expect(visible(page, "nav-group-teaching")).toBeVisible();
    await expect(page.getByTestId("btn-register-child").or(page.getByTestId("btn-browse-classes")).first()).toBeVisible();
    await expect(page.getByTestId("role-switcher")).toHaveCount(0);
  });

  test("UC-04 / UC-20 parent+Mentor with active_role Mentor still lands on the family hub", async ({ page }) => {
    await loginParent(page, seed.parentMentorStaffActive.email, seed.parentMentorStaffActive.password);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("shell-parent")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("shell-educator")).toHaveCount(0);
    await expect(visible(page, "nav-group-family")).toBeVisible();
    await expect(visible(page, "nav-group-teaching")).toBeVisible();
    await expect(page.getByTestId("btn-register-child").or(page.getByTestId("btn-browse-classes")).first()).toBeVisible();
  });

  test("UC-14–16 Teaching → My Classes stays in parent chrome; Family remains", async ({ page }) => {
    await loginParent(page, seed.parentMentor.email, seed.parentMentor.password);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("shell-parent")).toBeVisible({ timeout: 30_000 });

    await visible(page, "nav-group-teaching").click();
    await visible(page, "nav-educator-my-classes").click();
    await expect(page).toHaveURL(/\/educator\/my-classes/, { timeout: 30_000 });
    await expect(page.getByTestId("shell-parent")).toBeVisible();
    await expect(page.getByTestId("shell-educator")).toHaveCount(0);
    await expect(visible(page, "nav-group-family")).toBeVisible();
    await expect(visible(page, "nav-group-teaching")).toBeVisible();
  });
});
