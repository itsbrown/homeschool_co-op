import { expect, test } from "@playwright/test";
import { educatorSupabaseLinked, loginEducatorFromSeed } from "./helpers/educatorAuth";
import { requireLinkedSeed } from "./helpers/requireLinkedSeed";
import { postSetupProgressScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("educator student levels sheet", () => {
  test("saves reading and math levels from My Students", async ({ page, request }) => {
    const { response, json } = await postSetupProgressScenario(request, {
      linkSupabaseAuth: true,
    });
    const seed = requireLinkedSeed(response, json, {
      linked: educatorSupabaseLinked(json?.data ?? {}),
      need: "Educator Supabase auth",
    });

    await loginEducatorFromSeed(page, seed.educator.email, seed.educator.password);

    const studentsApi = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "GET" &&
        candidate.url().includes("/api/educator/my-students") &&
        candidate.ok(),
      { timeout: 30_000 },
    );
    await page.goto("/educator/students", { waitUntil: "domcontentloaded" });
    await studentsApi;

    const studentRow = page.getByTestId(`student-row-${seed.child.id}`);
    await expect(studentRow).toBeVisible({ timeout: 15_000 });
    await studentRow.getByTestId("button-open-student-levels").click();
    await expect(page.getByTestId("student-levels-sheet")).toBeVisible();

    await page.getByTestId("input-sheet-math-level").fill("3A");
    await page.getByTestId("input-sheet-lexile-range").fill("600L–700L");

    const lexileSave = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        candidate.url().includes("/api/lexile/entry"),
      { timeout: 30_000 },
    );
    const mathSave = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        candidate.url().includes("/api/math-level/entry"),
      { timeout: 30_000 },
    );
    await page.getByTestId("button-save-student-levels").click();

    const [lexileResponse, mathResponse] = await Promise.all([lexileSave, mathSave]);
    expect(
      lexileResponse.ok(),
      `save Lexile ${lexileResponse.status()}: ${await lexileResponse.text()}`,
    ).toBeTruthy();
    expect(
      mathResponse.ok(),
      `save math level ${mathResponse.status()}: ${await mathResponse.text()}`,
    ).toBeTruthy();

    await expect(page.getByText("Student levels saved", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(studentRow.getByText("Math: 3A")).toBeVisible({ timeout: 15_000 });
    await expect(studentRow.getByText("600L–700L")).toBeVisible({ timeout: 15_000 });
  });
});
