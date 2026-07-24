import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { postSetupGradePlacementScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("grade placement parent card", () => {
  test("admin parent profile child card shows placed class title", async ({ page, request }) => {
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

    await page.goto(`/schools/users/${seed.parent.id}?tab=children`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByTestId(`text-child-placed-class-${seed.children.paid.id}`),
    ).toBeVisible({ timeout: 45_000 });
    await expect(
      page.getByTestId(`text-child-placed-class-${seed.children.paid.id}`),
    ).toContainText(seed.class.title);
  });

  test("parent children page shows class title on card", async ({ page, request }) => {
    const { response, json } = await postSetupGradePlacementScenario(request, {
      linkSupabaseAuth: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(
      json.data?.supabaseLinked !== true,
      "Supabase auth was not linked for parent",
    );

    const seed = json!.data!;
    await loginParent(page, seed.parent.email, seed.parent.password);
    await page.goto("/children", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId(`text-child-placed-class-${seed.children.paid.id}`),
    ).toBeVisible({ timeout: 45_000 });
    await expect(
      page.getByTestId(`text-child-placed-class-${seed.children.paid.id}`),
    ).toContainText(seed.class.title);
  });
});
