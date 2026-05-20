import { test, expect } from "@playwright/test";
import {
  postSetupCreditLookupScenario,
  type SetupCreditLookupScenarioResponse,
} from "./helpers/testSeed";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";
import { bearerAuthHeaders, waitForSupabaseToken } from "./helpers/parentCheckoutHelpers";

/**
 * Credit Management → Add Manual Credit must find parents via the same search
 * semantics as notifications/documents (/api/user-search/search), including
 * legacy parents with users.school_id only (no user_roles row).
 *
 * Requires Postgres (`DATABASE_URL`) and Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
 * for `/api/test/setup-credit-lookup-scenario` and school-admin login.
 */
test.describe.configure({ mode: "serial", timeout: 60_000 });

type SeedData = NonNullable<SetupCreditLookupScenarioResponse["data"]>;

const adminPassword = "TestPassword123!";

async function seedCreditLookupScenario(
  request: import("@playwright/test").APIRequestContext,
): Promise<SeedData> {
  const { response, json } = await postSetupCreditLookupScenario(request, {
    linkSupabaseAuthAdmin: true,
  });
  test.skip(
    !response.ok(),
    `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
  );
  test.skip(!json?.success || !json.data?.legacyParent?.id, "seed returned no legacy parent");
  test.skip(
    json.data?.adminSupabaseLinked !== true,
    "Supabase auth was not linked for seeded admin (configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
  );
  return json.data!;
}

function userIdsFromSearchPayload(body: { users?: { id: number }[] }): number[] {
  return (body.users ?? []).map((u) => u.id);
}

/** Credits shell refetches my-school after paint; opening the dialog before that remounts the page and closes it. */
async function gotoCreditsPageSettled(page: import("@playwright/test").Page) {
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/credits/summary") && r.ok(), {
      timeout: 45_000,
    }),
    page.waitForResponse((r) => r.url().includes("/api/school-admin/my-school") && r.ok(), {
      timeout: 45_000,
    }),
    page.goto("/school-admin/credits", { waitUntil: "domcontentloaded" }),
  ]);
  await expect(page.getByTestId("button-add-credit")).toBeVisible({ timeout: 15_000 });
}

async function selectParentInAddCreditDialog(
  page: import("@playwright/test").Page,
  parent: { id: number; email: string },
) {
  const dialog = page.getByRole("dialog", { name: "Add Manual Credit" });
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  const searchTerm = parent.email.split("@")[0];
  const input = dialog.getByTestId("user-autocomplete-input");

  await input.fill(searchTerm);
  const searchResponse = await page.waitForResponse((r) => {
    if (!r.ok() || !r.url().includes("/api/user-search/search")) return false;
    return new URL(r.url()).searchParams.get("query") === searchTerm;
  }, { timeout: 45_000 });

  const body = (await searchResponse.json()) as { users?: { id: number }[] };
  expect(userIdsFromSearchPayload(body)).toContain(parent.id);

  const option = dialog.getByTestId(`user-autocomplete-option-${parent.id}`);
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
}

test.describe("credit management parent lookup", () => {
  test("user-search and credits/parents both return legacy school_id-only parent", async ({
    page,
    request,
  }) => {
    const seed = await seedCreditLookupScenario(request);
    await loginSchoolAdmin(page, seed.admin.email, adminPassword);
    const auth = bearerAuthHeaders(await waitForSupabaseToken(page));

    const query = seed.legacyParent.email.split("@")[0];
    const userSearch = await request.get(
      `/api/user-search/search?query=${encodeURIComponent(query)}&role=parent&limit=20`,
      { headers: auth },
    );
    expect(userSearch.ok()).toBeTruthy();
    const userSearchBody = (await userSearch.json()) as { users?: { id: number }[] };
    expect(userIdsFromSearchPayload(userSearchBody)).toContain(seed.legacyParent.id);

    const creditsParents = await request.get(
      `/api/credits/parents?query=${encodeURIComponent(query)}`,
      { headers: auth },
    );
    expect(creditsParents.ok()).toBeTruthy();
    const creditsBody = (await creditsParents.json()) as { users?: { id: number }[] };
    expect(userIdsFromSearchPayload(creditsBody)).toContain(seed.legacyParent.id);
  });

  test("Add Manual Credit autocomplete finds legacy parent by email", async ({ page, request }) => {
    const seed = await seedCreditLookupScenario(request);
    await loginSchoolAdmin(page, seed.admin.email, adminPassword);
    await waitForSupabaseToken(page);

    await gotoCreditsPageSettled(page);
    await page.getByTestId("button-add-credit").click();
    await selectParentInAddCreditDialog(page, seed.legacyParent);

    const dialog = page.getByRole("dialog", { name: "Add Manual Credit" });
    await expect(dialog.getByText(seed.legacyParent.email, { exact: false })).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByTestId("user-autocomplete-input")).toHaveCount(0);
  });

  test("Add Manual Credit autocomplete finds role-linked parent", async ({ page, request }) => {
    const seed = await seedCreditLookupScenario(request);
    await loginSchoolAdmin(page, seed.admin.email, adminPassword);
    await waitForSupabaseToken(page);

    await gotoCreditsPageSettled(page);
    await page.getByTestId("button-add-credit").click();
    await selectParentInAddCreditDialog(page, seed.roleLinkedParent);

    const dialog = page.getByRole("dialog", { name: "Add Manual Credit" });
    await expect(dialog.getByText(seed.roleLinkedParent.email, { exact: false })).toBeVisible({
      timeout: 15_000,
    });
  });
});
