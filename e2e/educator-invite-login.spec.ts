import { test, expect } from "@playwright/test";
import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./helpers/parentCheckoutHelpers";
import { postSetupEducatorInviteScenario } from "./helpers/testSeed";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("educator invite login", () => {
  test("staff invite, accept, auto-land on Today with assigned class", async ({ page, request }) => {
    const { response, json } = await postSetupEducatorInviteScenario(request, {
      linkSupabaseAuth: true,
    });
    test.skip(
      !response.ok(),
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
    test.skip(!json?.success || !json.data?.admin?.email, "seed returned no admin credentials");
    test.skip(
      json.data?.adminSupabaseLinked !== true && json.data?.supabaseLinked !== true,
      "Supabase auth was not linked",
    );

    const seed = json.data!;
    await preventStaffGuideModal(page);
    await loginParent(page, seed.admin.email, seed.admin.password);
    await dismissStaffGuideIfVisible(page);

    await page.goto("/schools/staff/invite", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("input-invite-first-name")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("input-invite-first-name").fill(seed.invitee.firstName);
    await page.getByTestId("input-invite-last-name").fill(seed.invitee.lastName);
    await page.getByTestId("input-invite-email").fill(seed.invitee.email);

    await page.getByTestId("select-invite-campus").click();
    await expect(page.getByRole("option", { name: seed.location.name })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("option", { name: seed.location.name }).click();

    await page.getByTestId("select-invite-class").click();
    await expect(page.getByRole("option", { name: seed.class.title })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("option", { name: seed.class.title }).click();

    const invitePost = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().includes("/api/school-admin/staff/invite") &&
        r.status() < 500,
      { timeout: 30_000 },
    );
    await page.getByTestId("button-send-invitation").click();
    const inviteRes = await invitePost;
    expect(inviteRes.ok()).toBeTruthy();
    const inviteJson = (await inviteRes.json()) as { invitePath?: string; inviteUrl?: string };
    const invitePath =
      inviteJson.invitePath ||
      (inviteJson.inviteUrl ? new URL(inviteJson.inviteUrl).pathname + new URL(inviteJson.inviteUrl).search : "");
    expect(invitePath).toContain("/accept-educator-invitation?token=");

    await expect(page.getByTestId("card-invite-success")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("input-invite-url")).toBeVisible();

    await page.goto("/logout", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login\/?$/, { timeout: 20_000 });

    await preventStaffGuideModal(page);
    await page.goto(invitePath, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("card-accept-invite")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("input-invite-email-readonly")).toHaveValue(seed.invitee.email);

    await page.getByTestId("input-invite-password").fill(seed.invitee.password);
    await page.getByTestId("input-invite-password-confirm").fill(seed.invitee.password);
    await page.getByTestId("button-join-school").click();

    await expect(page).toHaveURL(/\/educator\/dashboard/, { timeout: 45_000 });
    await dismissStaffGuideIfVisible(page);
    await expect(page.getByTestId("text-educator-dashboard-title")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(seed.class.title, { exact: false })).toBeVisible({ timeout: 20_000 });
  });
});
