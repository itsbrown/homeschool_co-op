import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { postSetupScheduleScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("schedule builder publish", () => {
  test("admin edits draft block and publishes week plan", async ({ page, request }) => {
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
    await page.goto("/schools/week-planner", { waitUntil: "domcontentloaded" });
    const skeletonsRes = await skeletonsApi;
    expect(skeletonsRes.headers()["content-type"] || "").toMatch(/json/i);

    await page.getByTestId("week-planner-template-select").click();
    await page.getByRole("option", { name: new RegExp(seed.classes.seekers.title.split(" ")[0]) }).click();

    await page.getByTestId(`week-plan-chip-${seed.weekPlans.seekersDraftId}`).click();
    await expect(page.getByText("Draft: Pending Publish")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId(`week-block-edit-${seed.blocks.seekersDraftBlockId}`).click();
    await page.getByPlaceholder("Block title").fill("E2E Published Lesson");
    const patchApi = page.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" &&
        r.url().includes("/api/schedule-builder/week-plan-blocks/") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId("week-block-save").click();
    await patchApi;

    const publishApi = page.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" &&
        r.url().includes(`/api/schedule-builder/week-plans/${seed.weekPlans.seekersDraftId}`) &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId("week-planner-publish").click();
    await publishApi;
    await expect(page.getByText("published").first()).toBeVisible({ timeout: 15_000 });
  });
});
