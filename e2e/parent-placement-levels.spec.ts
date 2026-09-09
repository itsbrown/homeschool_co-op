import { expect, test } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { postSetupProgressScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("parent placement levels", () => {
  test("parent sees read-only Lexile and math levels", async ({ page, request }) => {
    const { response, json } = await postSetupProgressScenario(request, {
      linkSupabaseAuth: true,
      withPlacementLevels: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data?.parentSupabaseLinked === true,
      need: "Supabase parent",
    });

    await preventStaffGuideModal(page);
    await loginParent(page, seed.parent.email, seed.parent.password);

    await page.goto("/parent/progress", { waitUntil: "domcontentloaded" });
    await dismissStaffGuideIfVisible(page);
    await expect(page.getByTestId("parent-placement-levels")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("badge-parent-lexile")).toContainText("600L-700L");
    await expect(page.getByTestId("badge-parent-lexile")).toContainText("3.5");
    await expect(page.getByTestId("badge-parent-math-level")).toContainText("3A");
    await expect(page.getByTestId("button-save-lexile")).toHaveCount(0);
    await expect(page.getByTestId("button-save-math-level")).toHaveCount(0);

    await page.goto("/parent/assessments", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("parent-placement-levels")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("badge-parent-lexile")).toContainText("600L-700L");
    await expect(page.getByTestId("badge-parent-math-level")).toContainText("3A");
    await expect(page.getByTestId("button-save-lexile")).toHaveCount(0);
    await expect(page.getByTestId("button-save-math-level")).toHaveCount(0);
  });
});
