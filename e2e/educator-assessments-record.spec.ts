import { test, expect } from "@playwright/test";
import { loginEducatorFromSeed, educatorSupabaseLinked } from "./helpers/educatorAuth";
import { postSetupProgressScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("educator assessments record tab", () => {
  test("my-students populate record tab; save score; progress tab visible", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupProgressScenario(request, {
      linkSupabaseAuth: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.educator?.email, "seed returned no educator credentials");
    test.skip(!educatorSupabaseLinked(json.data!), "Supabase auth was not linked");

    const seed = json.data!;
    await loginEducatorFromSeed(page, seed.educator.email, seed.educator.password);

    const studentsApi = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/educator/my-students") &&
        r.ok(),
      { timeout: 30_000 },
    );
    const typesApi = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/assessments/types") &&
        !r.url().includes("/books") &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.goto("/educator/assessments", { waitUntil: "domcontentloaded" });
    await studentsApi;
    await typesApi;
    await expect(page.getByTestId("tab-record")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("tab-record").click();
    await expect(page.getByTestId(`card-student-${seed.child.id}`)).toBeVisible({ timeout: 15_000 });

    await page.getByTestId(`button-record-${seed.child.id}`).click();
    await expect(page.getByTestId("select-assessment-type")).toBeVisible();
    await page.getByTestId("select-assessment-type").click();
    const typeName = seed.assessmentType?.name;
    if (typeName) {
      await page.getByRole("option", { name: typeName }).click();
    } else {
      await page.getByRole("option").first().click();
    }
    await page.getByTestId("input-score-value").fill("85");
    const saveApi = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().includes("/api/assessments/students"),
      { timeout: 30_000 },
    );
    await page.getByTestId("button-save-assessment").click();
    const saveRes = await saveApi;
    expect(saveRes.ok(), `save assessment ${saveRes.status()}: ${await saveRes.text()}`).toBeTruthy();
    await page.getByTestId("tab-recent").click();
    await expect(page.getByText("85").first()).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("tab-progress").click();
    await expect(page.getByTestId("select-progress-subject")).toBeVisible({ timeout: 15_000 });
  });
});
