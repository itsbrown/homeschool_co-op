import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { postSetupGradePlacementScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("grade placement auto-place", () => {
  test("roster shows paid match with Placed by grade; preview blocks unpaid", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupGradePlacementScenario(request, {
      linkSupabaseAuth: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.admin?.email, "seed returned no admin");
    test.skip(
      json.data?.adminSupabaseLinked !== true,
      "Supabase auth was not linked for admin",
    );

    const seed = json!.data!;
    await preventStaffGuideModal(page);
    await loginParent(page, seed.admin.email, seed.admin.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto(`/schools/classes/${seed.class.id}/roster`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(seed.children.paid.firstName)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("badge-placed-by-grade").first()).toBeVisible();
    await expect(page.getByText(seed.children.unpaid.firstName)).toHaveCount(0);

    await page.goto(`/schools/classes/${seed.class.id}/edit`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("switch-auto-place-by-grade")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("text-placement-preview")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("text-placement-preview")).toContainText(/blocked|unpaid|placed/i);
  });
});
