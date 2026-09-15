import { expect, test } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { postSetupMembershipAgreementScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("parent membership agreement dashboard reminder", () => {
  test("unsigned parent sees a persistent Home reminder, can still use the dashboard, then the banner clears after sign", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupMembershipAgreementScenario(request, {
      linkSupabaseAuthParent: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data?.parentSupabaseLinked === true,
      need: "Supabase parent",
    });

    await preventStaffGuideModal(page);
    await loginParent(page, seed.parent.email, seed.parent.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto("/parent/home", { waitUntil: "domcontentloaded" });
    const banner = page.getByTestId("dashboard-membership-agreement");
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner).toBeInViewport();
    await expect(banner).toContainText(/membership agreement/i);
    await expect(banner.getByRole("button", { name: /got it|dismiss/i })).toHaveCount(0);
    await expect(page.getByTestId("btn-browse-classes")).toBeVisible();
    await expect(page.getByTestId("btn-register-child")).toBeVisible();

    await page.getByTestId("dashboard-membership-agreement-sign").click();
    await expect(page).toHaveURL(/\/membership-agreement/, { timeout: 20_000 });

    await page.getByTestId("checkbox-has-read").click();
    await page.getByTestId("checkbox-agrees-terms").click();
    await page.getByTestId("input-signatory-name").fill("Unsigned Parent");
    await page.getByTestId("button-sign-agreement").click();

    await expect(page).toHaveURL(/\/parent\/home/, { timeout: 30_000 });
    await expect(page.getByTestId("dashboard-membership-agreement")).toHaveCount(0);
    await expect(page.getByTestId("btn-browse-classes")).toBeVisible({ timeout: 20_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("btn-browse-classes")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("dashboard-membership-agreement")).toHaveCount(0);
  });

  test("already-signed parent does not see the reminder", async ({ page, request }) => {
    const { response, json } = await postSetupMembershipAgreementScenario(request, {
      linkSupabaseAuthParent: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked:
        json?.data?.parentSupabaseLinked === true &&
        json?.data?.signedParentSupabaseLinked === true,
      need: "Supabase unsigned + signed parents",
    });

    await preventStaffGuideModal(page);
    await loginParent(page, seed.signedParent.email, seed.signedParent.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto("/parent/home", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("btn-browse-classes")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("dashboard-membership-agreement")).toHaveCount(0);
  });
});
