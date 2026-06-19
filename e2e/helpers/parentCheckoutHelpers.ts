import { expect, type Page } from "@playwright/test";

/** Staff guide auto-opens on ParentAppShell; block it so wizard clicks are not intercepted. */
export async function preventStaffGuideModal(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("staff_guide_dismissed", "true");
    sessionStorage.setItem("staff_guide_shown_this_session", "true");
  });
}

/** Close the staff guide if it is already open (e.g. init script ran after first paint). */
export async function dismissStaffGuideIfVisible(page: Page) {
  const modal = page.getByTestId("staff-guide-modal");
  const close = page.getByTestId("staff-guide-close");
  try {
    await modal.waitFor({ state: "visible", timeout: 3000 });
    await close.click();
    await expect(modal).toBeHidden({ timeout: 5000 });
  } catch {
    // Modal not shown — nothing to dismiss.
  }
}

/** Skip the first-run parent dashboard onboarding tour if it appears. */
export async function dismissParentOnboardingTourIfVisible(page: Page) {
  const skip = page.getByTestId("tour-skip");
  try {
    await skip.waitFor({ state: "visible", timeout: 5000 });
    await skip.click();
    await expect(skip).toBeHidden({ timeout: 5000 });
  } catch {
    // Tour not shown.
  }
}

export async function loginParent(page: Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/login\/?$/, { timeout: 45_000 });
  await waitForSupabaseToken(page);
}

/** Bearer token for page.request — Playwright API context does not send localStorage automatically. */
export async function waitForSupabaseToken(page: Page, timeoutMs = 45_000): Promise<string> {
  await page.waitForFunction(
    () => !!localStorage.getItem("supabase_token"),
    null,
    { timeout: timeoutMs },
  );
  const token = await page.evaluate(() => localStorage.getItem("supabase_token"));
  if (!token) {
    throw new Error("supabase_token missing from localStorage after login");
  }
  return token;
}

export function bearerAuthHeaders(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export async function registerAnotherChild(page: Page) {
  await page.goto("/children/register", { waitUntil: "domcontentloaded" });
  await page.getByLabel("First Name*").fill("E2E");
  await page.getByLabel("Last Name*").fill(`Playwright${Date.now() % 100000}`);
  await page.getByLabel("Birthdate*").fill("2016-01-15");
  await page.getByRole("button", { name: "Select grade level" }).click();
  await page.getByRole("option", { name: "2nd Grade" }).click();
  await page.getByRole("button", { name: "Select gender" }).click();
  await page.getByRole("option", { name: "Male" }).click();
  await page.getByRole("button", { name: "Register Child" }).click();
  await expect(page).toHaveURL(/\/children/, { timeout: 30_000 });
}

export async function goCheckoutAndWaitForPaymentCard(page: Page) {
  await page.goto("/cart/checkout", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByText("Payment Information")).toBeVisible({ timeout: 120_000 });
}
