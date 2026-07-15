import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { postSetupScheduleScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

const IMPORT_CSV = [
  "day_of_week,start_time,end_time,block_type,default_title,subject_area,sort_order",
  "Monday,09:00,10:00,curriculum,E2E CSV Science Lab,Science,1",
  "Wednesday,10:00,11:00,anchor,E2E CSV Morning Meeting,Homeroom,0",
].join("\n");

test.describe("schedule template CSV import", () => {
  test("admin maps columns, confirms import, sees new blocks", async ({ page, request }) => {
    const { response, json } = await postSetupScheduleScenario(request, { linkSupabaseAuth: true });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.admin?.email, "seed returned no admin credentials");
    test.skip(
      json.data?.supabaseLinked !== true,
      "Supabase auth was not linked (configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
    );

    const seed = json!.data!;
    const skeletonId = seed.skeletons.seekersId;

    await preventStaffGuideModal(page);
    await loginParent(page, seed.admin.email, seed.admin.password);
    await dismissStaffGuideIfVisible(page);

    const skeletonsApi = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/schedule-builder/skeletons") &&
        !r.url().includes("/blocks") &&
        r.ok(),
      { timeout: 60_000 },
    );
    await page.goto("/schools/schedule-builder", { waitUntil: "domcontentloaded" });
    await skeletonsApi;

    await expect(page.getByTestId(`schedule-template-card-${skeletonId}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`schedule-csv-file-input-${skeletonId}`)).toBeAttached();

    // File input is always on the card (no expand required).
    await page.getByTestId(`schedule-csv-file-input-${skeletonId}`).setInputFiles({
      name: "e2e-schedule-blocks.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(IMPORT_CSV, "utf-8"),
    });

    await expect(page.getByTestId("schedule-csv-import-dialog")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("schedule-csv-mapping-step")).toBeVisible();
    await expect(page.getByTestId("schedule-csv-mapping-next")).toBeEnabled();

    await page.getByTestId("schedule-csv-mapping-next").click();
    await expect(page.getByTestId("schedule-csv-preview-step")).toBeVisible();

    const importApi = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().includes(`/api/schedule-builder/skeletons/${skeletonId}/blocks/import-csv`) &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId("schedule-csv-confirm-import").click();
    await importApi;

    await expect(page.getByTestId("schedule-csv-import-success")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("schedule-csv-done").click();

    // Ensure expanded so imported block titles are visible
    const expand = page.getByTestId(`schedule-template-expand-${skeletonId}`);
    if (!(await page.getByTestId(`schedule-day-column-${skeletonId}-1`).isVisible().catch(() => false))) {
      await expand.click();
    }

    await expect(page.getByTestId("schedule-block-title-E2E CSV Science Lab")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("schedule-block-title-E2E CSV Morning Meeting")).toBeVisible();
  });
});
