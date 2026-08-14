import { test, expect } from "@playwright/test";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";
import { postSetupSupplyListScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("school admin supply lists", () => {
  test("class Supplies tab can add an item linked to an affiliate product", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupSupplyListScenario(request, {
      linkSupabaseAuthAdmin: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(
      json?.data?.adminSupabaseLinked !== true,
      "Supabase auth was not linked for admin",
    );

    const seed = json!.data!;
    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);

    await page.goto(`/schools/classes/${seed.classA.id}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("tab-class-supplies").click();
    await expect(page.getByTestId("admin-supply-editor")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("button-add-supply-item").click();
    const rows = page.locator("[data-testid^='admin-supply-row-']");
    const lastIndex = (await rows.count()) - 1;
    await page.getByTestId(`input-supply-name-${lastIndex}`).fill("E2E Pencil");
    await page.getByTestId(`select-supply-product-${lastIndex}`).click();
    await page.getByRole("option", { name: /E2E Supply Tissues/ }).click();
    await page.getByTestId("button-save-supply-list").click();
    await expect(page.getByText("Supply list saved")).toBeVisible({ timeout: 15_000 });
  });

  test("session Supplies dialog can add an item", async ({ page, request }) => {
    const { response, json } = await postSetupSupplyListScenario(request, {
      linkSupabaseAuthAdmin: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(
      json?.data?.adminSupabaseLinked !== true,
      "Supabase auth was not linked for admin",
    );

    const seed = json!.data!;
    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);

    await page.goto("/schools/sessions", { waitUntil: "domcontentloaded" });
    await page.getByTestId(`button-session-supplies-${seed.session.id}`).click();
    await expect(page.getByTestId("admin-supply-editor")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("button-add-supply-item").click();
    const rows = page.locator("[data-testid^='admin-supply-row-']");
    const lastIndex = (await rows.count()) - 1;
    await page.getByTestId(`input-supply-name-${lastIndex}`).fill("Extra socks");
    await page.getByTestId("button-save-supply-list").click();
    await expect(page.getByText("Supply list saved")).toBeVisible({ timeout: 15_000 });
  });
});
