import { test, expect } from "@playwright/test";
import { postSetupRegistrationScenario } from "./helpers/testSeed";
import { isRealSupabaseConfigured } from "./helpers/supabaseEnv";

/**
 * Full UI path: /register/:code → public locations → POST /api/auth/register → sign-in → dashboard.
 * Requires Postgres (DATABASE_URL) and a real Supabase test project (nightly / secrets).
 * Skips in default CI when only placeholder Supabase keys are present.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

const parentPassword = "SecurePass123!";

test.describe("school-code parent registration", () => {
  test.beforeEach(() => {
    test.skip(
      !isRealSupabaseConfigured(),
      "Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to a real test project (not placeholders)",
    );
  });

  test("registration page shows seeded campuses and completes signup", async ({
    page,
    request,
  }) => {
    const unique = Date.now();
    const parentEmail = `e2e_parent_${unique}@test.com`;

    const { response, json } = await postSetupRegistrationScenario(request);
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.registrationCode, "seed returned no registration code");

    const { registrationCode, school, locationsOnSchool } = json.data!;

    const locationsPromise = page.waitForResponse(
      (r) =>
        r.url().includes("/api/public/registration/locations") &&
        (r.url().includes(`code=${encodeURIComponent(registrationCode)}`) ||
          r.url().includes(`schoolId=${school.id}`)) &&
        r.ok(),
      { timeout: 45_000 },
    );

    await page.goto(`/register/${registrationCode}`, { waitUntil: "domcontentloaded" });
    await locationsPromise;

    await expect(page.getByText(school.name, { exact: false })).toBeVisible({ timeout: 20_000 });

    const locationSelect = page.getByTestId("registration-location-select");
    await expect(locationSelect).toBeVisible({ timeout: 15_000 });
    const firstCampus = locationsOnSchool[0]?.name ?? "Brighton";
    // Playwright selectOption label must be a string (not RegExp).
    const optionLabels = await locationSelect.locator("option").allTextContents();
    const campusLabel =
      optionLabels.find((label) => label.toLowerCase().includes(firstCampus.toLowerCase())) ??
      firstCampus;
    await locationSelect.selectOption({ label: campusLabel });

    await page.getByTestId("registration-parent-first-name").fill("E2E");
    await page.getByLabel("Last Name").first().fill("Parent");
    await page.getByTestId("registration-email").fill(parentEmail);
    await page.getByTestId("registration-password").fill(parentPassword);
    await page.getByLabel("Confirm Password").fill(parentPassword);
    await page.getByLabel("Phone Number").fill("5555550100");

    await page.getByTestId("registration-child-0-first-name").fill("Student");
    await page.getByLabel("Last name", { exact: true }).fill("One");
    await page.locator('input[type="date"]').first().fill("2016-01-15");
    await page.getByTestId("registration-child-0-grade").click();
    await page.getByRole("option", { name: "2nd Grade" }).click();

    const registerResponse = page.waitForResponse(
      (r) => r.url().includes("/api/auth/register") && r.request().method() === "POST",
      { timeout: 60_000 },
    );
    await page.getByTestId("registration-submit").click();
    const regRes = await registerResponse;
    expect(regRes.ok()).toBeTruthy();

    await expect(page).toHaveURL(/\/(dashboard|login)/, { timeout: 60_000 });
  });
});
