import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { postSetupScheduleScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("parent progress scheduled lessons", () => {
  test("shows Scheduled lessons with completion pills after seed", async ({ page, request }) => {
    const { response, json } = await postSetupScheduleScenario(request, { linkSupabaseAuth: true });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.parent?.email, "seed returned no parent credentials");
    test.skip(
      json.data?.supabaseLinked !== true,
      "Supabase auth was not linked (configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
    );

    const seed = json!.data!;
    await preventStaffGuideModal(page);
    await loginParent(page, seed.parent.email, seed.parent.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto("/parent/progress", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Progress/i })).toBeVisible({ timeout: 30_000 });

    // Prefer Seekers child (has a completed scheduled lesson)
    const childTrigger = page.getByRole("combobox").first();
    if (await childTrigger.isVisible().catch(() => false)) {
      await childTrigger.click();
      await page.getByRole("option", { name: /Seeker/i }).click();
    }

    await page.getByTestId("parent-progress-tab-session").click();
    await expect(page.getByTestId("parent-scheduled-lessons-card")).toBeVisible({ timeout: 30_000 });

    const completedId = seed.blocks.seekersCompletedId;
    await expect(page.getByTestId(`scheduled-lesson-${completedId}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`scheduled-lesson-${completedId}`)).toContainText(/Completed/i);
  });
});
