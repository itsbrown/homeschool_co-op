import { test, expect } from "@playwright/test";
import { postSetupSessionDayTypeAdminScenario } from "./helpers/testSeed";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("school admin session half/full day signup view", () => {
  test("sessions fill summary + enrollments day-type filters + CSV", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupSessionDayTypeAdminScenario(request, {
      linkSupabaseAuthAdmin: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.admin?.email, "seed returned no admin credentials");
    test.skip(
      json.data?.adminSupabaseLinked !== true,
      "Supabase auth was not linked for admin",
    );

    const data = json!.data!;
    const admin = data.admin;
    const session = data.session;
    const expectedFill = data.expectedFillSummary;

    await loginSchoolAdmin(page, admin.email, admin.password);

    await page.goto("/schools/sessions", { waitUntil: "domcontentloaded" });
    const fillSummary = page.getByTestId(`session-fill-summary-${session.id}`);
    await expect(fillSummary).toBeVisible({ timeout: 30_000 });
    await expect(fillSummary).toContainText(expectedFill);

    const enrollmentsApi = page.waitForResponse(
      (r) => r.url().includes("/api/school-admin/enrollments") && r.ok(),
      { timeout: 60_000 },
    );
    await page.goto("/schools/enrollments", { waitUntil: "domcontentloaded" });
    await enrollmentsApi;

    await expect(page.getByTestId("column-day-type")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`badge-day-type-${data.halfEnrollment.id}`)).toHaveText(
      "Half Day",
    );
    await expect(page.getByTestId(`badge-day-type-${data.fullEnrollment.id}`)).toHaveText(
      "Full Day",
    );

    await page.getByTestId("select-day-type-filter").click();
    await page.getByRole("option", { name: "Half Day" }).click();
    await expect(page.getByTestId(`enrollment-row-${data.halfEnrollment.id}`)).toBeVisible();
    await expect(page.getByTestId(`enrollment-row-${data.fullEnrollment.id}`)).toHaveCount(0);

    await page.getByTestId("select-day-type-filter").click();
    await page.getByRole("option", { name: "Full Day" }).click();
    await expect(page.getByTestId(`enrollment-row-${data.fullEnrollment.id}`)).toBeVisible();
    await expect(page.getByTestId(`enrollment-row-${data.halfEnrollment.id}`)).toHaveCount(0);

    await page.getByTestId("select-day-type-filter").click();
    await page.getByRole("option", { name: "All day types" }).click();

    await page.getByTestId("select-session-filter").click();
    await page.getByRole("option", { name: session.name }).click();
    await expect(page.getByTestId("enrollments-session-fill-summary")).toContainText(expectedFill);
    await expect(page.getByTestId(`enrollment-row-${data.halfEnrollment.id}`)).toBeVisible();
    await expect(page.getByTestId(`enrollment-row-${data.fullEnrollment.id}`)).toBeVisible();

    const exportBtn = page.getByTestId("button-export-enrollments-csv");
    await expect(exportBtn).toBeEnabled();
    await exportBtn.click();
  });
});
