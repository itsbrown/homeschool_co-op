import { test, expect } from "@playwright/test";
import { postSetupFamilyAccessCodeScenario } from "./helpers/testSeed";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { loginSchoolAdmin, openParentFamilyTab } from "./helpers/schoolAdminAuth";
import { preventStaffGuideModal, dismissStaffGuideIfVisible } from "./helpers/parentCheckoutHelpers";

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("school admin door codes", () => {
  test("admin assigns a code on Parent Profile and imports CSV", async ({ page, request }) => {
    const { response, json } = await postSetupFamilyAccessCodeScenario(request, {
      linkSupabaseAuthAdmin: true,
      assignCode: false,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data?.adminSupabaseLinked === true,
      need: "Supabase school admin",
    });

    await preventStaffGuideModal(page);
    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);
    await dismissStaffGuideIfVisible(page);

    await openParentFamilyTab(page, seed.parent.id);
    await expect(page.getByTestId("parent-door-code-input")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("parent-door-code-input").fill("4821");
    await page.getByTestId("parent-door-code-save").click();
    await expect(page.getByText("Door code saved", { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.goto("/schools/locations", { waitUntil: "domcontentloaded" });
    await page.getByTestId("tab-door-codes").click();
    await page.getByTestId("select-door-code-location").click();
    await page.getByRole("option", { name: seed.keyedCampus.name, exact: true }).click();
    await page.getByTestId("button-import-door-codes").click();
    await page.getByTestId("textarea-door-code-csv").fill(
      `Email,Door code\n${seed.parentB.email},7788\n`,
    );
    await page.getByTestId("button-door-code-csv-import").click();
    await expect(page.getByTestId(`door-code-row-${seed.parentB.id}`)).toBeVisible({
      timeout: 20_000,
    });
  });
});
