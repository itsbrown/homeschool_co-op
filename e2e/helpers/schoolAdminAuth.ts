import { expect, type Page } from "@playwright/test";

/** Sign in as a school admin (Supabase email/password at /login). */
export async function loginSchoolAdmin(page: Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/login\/?$/, { timeout: 45_000 });
}

export async function openParentCreditsTab(page: Page, parentId: number) {
  const profilePath = `/schools/users/${parentId}?tab=family`;
  await page.evaluate(() => localStorage.setItem("activeRole", "schoolAdmin"));
  const profileResponse = page.waitForResponse(
    (r) =>
      (r.url().includes(`/api/parent-profile/${parentId}`) ||
        r.url().includes(`/api/parent-profile/${parentId}/`)) &&
      r.request().method() === "GET",
    { timeout: 60_000 },
  );
  await page.goto(profilePath, { waitUntil: "domcontentloaded" });
  const res = await profileResponse;
  expect(res.ok(), `parent-profile GET failed: ${res.status()}`).toBeTruthy();
  await page.getByRole("tab", { name: "Credits" }).click();
  await expect(page.getByTestId("button-award-credit")).toBeVisible({ timeout: 30_000 });
}

export async function expectCreditsAvailableBalance(page: Page, amountDollars: string) {
  await expect(page.getByTestId("text-credits-available-balance")).toHaveText(amountDollars, {
    timeout: 30_000,
  });
}

export async function awardCreditOnProfile(
  page: Page,
  parentId: number,
  input: { amountDollars: string; title: string },
) {
  await page.getByTestId("button-award-credit").click();
  await page.getByTestId("input-award-credit-amount").fill(input.amountDollars);
  await page.getByTestId("input-award-credit-title").fill(input.title);
  const refresh = page.waitForResponse(
    (r) => r.url().includes(`/api/parent-profile/${parentId}`) && r.ok(),
    { timeout: 60_000 },
  );
  await page.getByTestId("button-submit-award-credit").click();
  await refresh;
  await expect(page.getByText(input.title, { exact: false })).toBeVisible({ timeout: 30_000 });
}
