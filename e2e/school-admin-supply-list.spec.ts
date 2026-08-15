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
    await expect(page.getByText("Supply list saved", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
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
    await expect(page.getByText("Supply list saved", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("class Supplies tab can import a CSV with an Amazon product URL", async ({
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
    await expect(page.getByTestId("button-import-supply-csv")).toBeVisible({ timeout: 30_000 });

    const csv = [
      "Yankee Doodles – Parent Supply List",
      "",
      "Supply Item,Qty / Notes,Amazon Link (or Search),Additional Notes,Affiliate Link",
      "E2E CSV Water bottle,1,https://www.amazon.com/dp/B08WATER01,Labeled,",
      "E2E CSV Crayons,1 box,,Crayola,",
    ].join("\n");

    await page.getByTestId("input-supply-csv-file").setInputFiles({
      name: "e2e-supply-list.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });

    await expect(page.getByTestId("supply-csv-import-dialog")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("supply-csv-mapping-step")).toBeVisible();

    const previewApi = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().includes(`/api/supply-lists/class/${seed.classA.id}/import-csv`) &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId("supply-csv-mapping-next").click();
    await previewApi;
    await expect(page.getByTestId("supply-csv-preview-step")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("supply-csv-amazon-status-0")).toContainText(/Create Amazon product/);

    const importApi = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().includes(`/api/supply-lists/class/${seed.classA.id}/import-csv`) &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId("supply-csv-confirm-import").click();
    await importApi;

    await expect(page.getByText("Supply list imported", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("input-supply-name-0")).toHaveValue("E2E CSV Water bottle", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("select-supply-product-0")).toContainText(/Amazon product B08WATER01/, {
      timeout: 15_000,
    });
    await expect(page.getByTestId("input-supply-unit-1")).toHaveValue("box");
  });
});
