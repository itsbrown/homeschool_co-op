import { test, expect } from "@playwright/test";
import { postSetupProgressScenario } from "./helpers/testSeed";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("school admin student lexile profile", () => {
  test("admin can enter and see Lexile on student profile", async ({ page, request }) => {
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

    await expect(page.getByTestId("lexile-profile-section")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/No Lexile reading data has been recorded/i)).toBeVisible();

    await page.getByTestId("button-toggle-lexile-entry").click();
    await page.getByTestId("input-lexile-grade").fill("2.5");
    await page.getByTestId("input-lexile-range").fill("420L–650L");
    await page.getByTestId("input-lexile-notes").fill("Profile entry E2E");

    const saveResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/lexile/entry") &&
        r.request().method() === "POST" &&
        r.ok(),
      { timeout: 60_000 },
    );
    await page.getByTestId("button-save-lexile").click();
    await saveResponse;

    await expect(page.getByTestId("badge-current-lexile-range")).toContainText("420L", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("badge-current-reading-grade")).toContainText("2.5");
    await expect(page.getByTestId("lexile-history-list")).toBeVisible();
    await expect(page.getByTestId("lexile-history-list")).toContainText("2.5");
  });
});
