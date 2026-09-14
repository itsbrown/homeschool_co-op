import { expect, test } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { postSetupClassAllergyScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("class allergy alerts for parents", () => {
  test("classmate parent sees dashboard reminder and inbox notice, never the student name", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupClassAllergyScenario(request, {
      linkSupabaseAuthParent: true,
      notify: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data?.supabaseLinked === true,
      need: "Supabase parent B",
    });

    await preventStaffGuideModal(page);
    await loginParent(page, seed.parentB.email, seed.parentB.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto("/parent/home", { waitUntil: "domcontentloaded" });
    const banner = page.getByTestId("dashboard-class-allergy-alerts");
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner).toContainText(/Classroom food restrictions/i);
    await expect(banner).toContainText(/peanut/i);
    await expect(banner).toContainText(seed.class.title);
    await expect(banner).toContainText(seed.childB.firstName);
    await expect(banner).not.toContainText(seed.childA.firstName);
    await expect(banner).not.toContainText(seed.childA.lastName);

    await banner.getByTestId("button-dismiss-class-allergy").click();
    await expect(banner).toHaveCount(0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("btn-browse-classes")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("dashboard-class-allergy-alerts")).toHaveCount(0);

    await page.goto("/notifications", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Allergy reminder/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/peanut/i).first()).toBeVisible();
    await expect(page.getByText(seed.childA.firstName)).toHaveCount(0);
  });
});
