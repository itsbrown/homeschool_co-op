import { test, expect, type Page } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import {
  postSetupPublicStoreScenario,
  postSetupSupplyListScenario,
} from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

function visibleSupplyListNav(page: Page) {
  return page.getByRole("link", { name: "Supply list", exact: true }).filter({ visible: true });
}

test.describe("parent household supply list", () => {
  test("sidebar from dashboard opens merged list, Amazon CTA is sponsored, check persists, class detail is subset", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupSupplyListScenario(request, {
      linkSupabaseAuthParent: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(
      json?.data?.parentSupabaseLinked !== true && json?.data?.supabaseLinked !== true,
      "Supabase auth was not linked for parent",
    );

    const seed = json!.data!;
    await preventStaffGuideModal(page);
    await loginParent(page, seed.parent.email, seed.parent.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto("/parent/home", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("dashboard-supply-list-card")).toBeVisible({ timeout: 30_000 });
    await expect(visibleSupplyListNav(page).first()).toBeVisible({ timeout: 15_000 });
    await visibleSupplyListNav(page).first().click();
    await expect(page).toHaveURL(/\/parent\/supplies/, { timeout: 15_000 });

    await expect(page.getByTestId("parent-supply-list")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("dimensions-math-placement")).toBeVisible();
    await expect(page.getByTestId("dimensions-math-placement-link")).toHaveAttribute(
      "href",
      "https://www.singaporemath.com/pages/placement-tests",
    );
    await page.getByTestId("dimensions-math-placement-howto").click();
    await expect(page.getByTestId("dimensions-math-placement-howto-step-1")).toBeVisible();
    await expect(page.getByTestId("dimensions-math-placement-howto-step-1")).toHaveText(
      /Start lower than you think/i,
    );
    await expect(page.getByText(/Water bottle ×2/i)).toBeVisible();
    await expect(page.getByText(/Glue sticks ×2/i)).toBeVisible();
    await expect(page.getByText(/Maya/i).first()).toBeVisible();
    await expect(page.getByText(/Liam/i).first()).toBeVisible();
    await expect(page.getByText(/Trailblazers/i).first()).toBeVisible();
    await expect(page.getByText(/Tycoons/i).first()).toBeVisible();

    const amazon = page.getByRole("link", { name: /Buy on Amazon/i }).first();
    await expect(amazon).toBeVisible();
    await expect(amazon).toHaveAttribute("href", seed.affiliateProduct.affiliateUrl);
    await expect(amazon).toHaveAttribute("rel", /sponsored/);
    await expect(page.getByRole("button", { name: /Add to cart/i })).toHaveCount(0);

    const check = page.locator("[data-testid^='supply-check-']").first();
    await check.click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("parent-supply-list")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-testid^='supply-check-']").first()).toBeChecked();

    await page.goto(`/parent/classes/${seed.classA.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("class-supply-list")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("dimensions-math-placement")).toBeVisible();
    await expect(page.getByTestId("class-supply-list").getByText(/Tissues/i)).toBeVisible();
    await expect(page.getByTestId("class-supply-list").getByText(/Water bottle/i)).toHaveCount(0);
  });

  test("empty household still shows sidebar and dashboard card", async ({ page, request }) => {
    const { response, json } = await postSetupPublicStoreScenario(request, {
      withParent: true,
      linkSupabaseAuthParent: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(
      json?.data?.parentSupabaseLinked !== true || !json?.data?.parent,
      "Supabase auth was not linked for parent",
    );

    const parent = json!.data!.parent!;
    await preventStaffGuideModal(page);
    await loginParent(page, parent.email, parent.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto("/parent/home", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("dashboard-supply-list-card")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("dashboard-supply-list-card")).toContainText(
      /Lists from your classes will show up here/i,
    );
    await expect(visibleSupplyListNav(page).first()).toBeVisible();
    await expect(page.getByTestId("btn-supply-list")).toBeVisible();

    await page.getByTestId("btn-view-supply-list").click();
    await expect(page).toHaveURL(/\/parent\/supplies/, { timeout: 15_000 });
    await expect(page.getByTestId("parent-supply-list-empty")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/No supplies yet/i)).toBeVisible();
    await expect(page.getByTestId("dimensions-math-placement")).toHaveCount(0);
  });
});
