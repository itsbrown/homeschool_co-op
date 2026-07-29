import { test, expect } from "@playwright/test";
import { postSetupCartScenario, type SetupCartScenarioResponse } from "./helpers/testSeed";
import { loginSchoolAdmin, openParentFamilyTab } from "./helpers/schoolAdminAuth";

/**
 * School-admin Parent Profile campus Select → confirm → soft family transfer.
 * Guards the Radix Select + AlertDialog race (confirm must stay open after pick).
 *
 * Requires Postgres + Supabase (`linkSupabaseAuthAdmin`).
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });

type SeedData = NonNullable<SetupCartScenarioResponse["data"]>;

async function seedCampusChangeScenario(
  request: import("@playwright/test").APIRequestContext,
): Promise<SeedData> {
  const { response, json } = await postSetupCartScenario(request, {
    paymentPlan: "full_payment",
    linkSupabaseAuth: true,
    linkSupabaseAuthAdmin: true,
    withCampuses: true,
  });
  test.skip(
    !response.ok(),
    `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
  );
  test.skip(!json?.success || !json.data?.parent?.id, "seed returned no parent");
  test.skip(
    json.data?.adminSupabaseLinked !== true,
    "Supabase auth was not linked for seeded admin (configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
  );
  test.skip(
    !json.data?.locationsOnSchool || json.data.locationsOnSchool.length < 2,
    "seed did not return two campuses (withCampuses)",
  );
  return json.data!;
}

test.describe("parent profile campus change", () => {
  const adminPassword = "TestPassword123!";

  test("selecting campus opens confirm and Move family persists", async ({ page, request }) => {
    const seed = await seedCampusChangeScenario(request);
    const target = seed.locationsOnSchool!.find((l) => l.name === "Greece") ?? seed.locationsOnSchool![1];

    await loginSchoolAdmin(page, seed.admin!.email, adminPassword);
    await openParentFamilyTab(page, seed.parent.id);

    await expect(page.getByTestId("parent-campus-label")).toHaveText(/No campus set/i);

    await page.getByTestId("parent-campus-select").click();
    await page.getByRole("option", { name: target.name, exact: true }).click();

    const confirmBtn = page.getByTestId("confirm-campus-change");
    await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Change family campus/i })).toBeVisible();

    const patch = page.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" &&
        r.url().includes(`/api/locations/parent/${seed.parent.id}/location`) &&
        r.ok(),
      { timeout: 60_000 },
    );
    await confirmBtn.click();
    await patch;

    await expect(confirmBtn).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId("parent-campus-label")).toHaveText(target.name, {
      timeout: 30_000,
    });
  });
});
