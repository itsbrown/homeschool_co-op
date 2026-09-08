import { test, expect } from "@playwright/test";
import { postSetupProgressScenario } from "./helpers/testSeed";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("school admin student math level", () => {
  test("admin can enter and see math level on student profile", async ({ page, request }) => {
    const { response, json } = await postSetupProgressScenario(request, {
      linkSupabaseAuthAdmin: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: json?.data?.adminSupabaseLinked === true,
      need: "Supabase school admin",
    });
    if (!seed.admin?.email || !seed.child?.id) {
      throw new Error("seed returned no admin or child");
    }

    await loginSchoolAdmin(page, seed.admin.email, seed.admin.password);
    await page.goto(`/schools/students/${seed.child.id}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("math-level-profile-section")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/No math level has been recorded/i)).toBeVisible();

    await page.getByTestId("button-toggle-math-level-entry").click();
    await page.getByTestId("input-math-level").fill("3A");
    await page.getByTestId("input-math-level-notes").fill("Dimensions placement");

    const saveResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/math-level/entry") &&
        r.request().method() === "POST" &&
        r.ok(),
      { timeout: 60_000 },
    );
    await page.getByTestId("button-save-math-level").click();
    await saveResponse;

    await expect(page.getByTestId("badge-current-math-level")).toContainText("3A", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("math-level-history-list")).toBeVisible();
    await expect(page.getByTestId("math-level-history-list")).toContainText("3A");
  });
});
