import { test, expect } from "@playwright/test";
import { postSetupCartScenario, type SetupCartScenarioResponse } from "./helpers/testSeed";
import { loginSchoolAdmin, openParentFamilyTab } from "./helpers/schoolAdminAuth";

/**
 * School-admin Parent Profile → delete child without enrollments.
 * Guards FK-safe order (school_students before children).
 *
 * Requires Postgres + Supabase (`linkSupabaseAuthAdmin`).
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });

type SeedData = NonNullable<SetupCartScenarioResponse["data"]> & {
  deletableChild?: { id: number; firstName: string; lastName: string };
};

async function seedDeleteChildScenario(
  request: import("@playwright/test").APIRequestContext,
): Promise<SeedData> {
  const { response, json } = await postSetupCartScenario(request, {
    paymentPlan: "full_payment",
    linkSupabaseAuth: true,
    linkSupabaseAuthAdmin: true,
    withDeletableChild: true,
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
  const data = json.data as SeedData;
  test.skip(!data.deletableChild?.id, "seed did not return deletableChild (withDeletableChild)");
  return data;
}

test.describe("parent profile delete child", () => {
  const adminPassword = "TestPassword123!";

  test("deletes orphan child with school_students link", async ({ page, request }) => {
    const seed = await seedDeleteChildScenario(request);
    const orphan = seed.deletableChild!;

    await loginSchoolAdmin(page, seed.admin!.email, adminPassword);
    await openParentFamilyTab(page, seed.parent.id);
    await page.getByRole("tab", { name: /^Children$/i }).click();

    const deleteBtn = page.getByTestId(`button-delete-child-${orphan.id}`);
    await expect(deleteBtn).toBeVisible({ timeout: 60_000 });

    await deleteBtn.click();
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /Delete Child/i })).toBeVisible();

    const del = page.waitForResponse(
      (r) =>
        r.request().method() === "DELETE" &&
        r.url().includes(`/api/school-admin/children/${orphan.id}`) &&
        r.ok(),
      { timeout: 60_000 },
    );
    await page.getByTestId("confirm-delete-child").click();
    await del;

    await expect(page.getByRole("alertdialog")).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId(`button-delete-child-${orphan.id}`)).toHaveCount(0, {
      timeout: 30_000,
    });
    // Enrolled sibling must remain
    await expect(page.getByText(seed.child.firstName, { exact: false }).first()).toBeVisible();
  });

  test("blocks delete when child has enrollments", async ({ page, request }) => {
    const seed = await seedDeleteChildScenario(request);

    await loginSchoolAdmin(page, seed.admin!.email, adminPassword);
    await openParentFamilyTab(page, seed.parent.id);
    await page.getByRole("tab", { name: /^Children$/i }).click();

    const deleteBtn = page.getByTestId(`button-delete-child-${seed.child.id}`);
    await expect(deleteBtn).toBeVisible({ timeout: 60_000 });
    await deleteBtn.click();
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 10_000 });

    const del = page.waitForResponse(
      (r) =>
        r.request().method() === "DELETE" &&
        r.url().includes(`/api/school-admin/children/${seed.child.id}`) &&
        r.status() === 400,
      { timeout: 60_000 },
    );
    await page.getByTestId("confirm-delete-child").click();
    await del;

    await expect(page.getByText(/Cannot delete child with enrollments/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId(`button-delete-child-${seed.child.id}`)).toBeVisible();
  });
});
