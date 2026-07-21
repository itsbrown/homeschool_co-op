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
  await preventStaffGuideModal(page);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/login\/?$/, { timeout: 45_000 });
  await waitForSupabaseToken(page);
  await dismissStaffGuideIfVisible(page);
  await dismissParentOnboardingTourIfVisible(page);
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
  await preventStaffGuideModal(page);
  await page.goto("/children/register", { waitUntil: "domcontentloaded" });
  await dismissStaffGuideIfVisible(page);
  await dismissParentOnboardingTourIfVisible(page);
  await page.getByLabel("First Name*").fill("E2E");
  await page.getByLabel("Last Name*").fill(`Playwright${Date.now() % 100000}`);
  await page.getByLabel("Birthdate*").fill("2016-01-15");
  // Radix SelectTrigger is role=combobox (not button); label is FormLabel text.
  await page.getByLabel("Grade Level*").click();
  await page.getByRole("option", { name: "2nd Grade", exact: true }).click();
  await page.getByLabel("Gender*").click();
  // exact: true — "Female" also matches name "Male" otherwise
  await page.getByRole("option", { name: "Male", exact: true }).click();
  await page.getByRole("button", { name: "Register Child" }).click();
  await expect(page).toHaveURL(/\/children/, { timeout: 30_000 });
}

/**
 * Open cart checkout and wait until Stripe Payment Element is ready.
 * Sets postSessionEnrollmentCheckout so empty-cart debounce is longer (2.5s)
 * while enrollments hydrate — avoids racing to /payments?tab=upcoming.
 */
export async function goCheckoutAndWaitForPaymentCard(page: Page) {
  const token = await waitForSupabaseToken(page);

  // Ensure parent enrollments API already returns a payable row before navigating.
  await expect
    .poll(
      async () => {
        const res = await page.request.get("/api/parent/enrollments", {
          headers: bearerAuthHeaders(token),
        });
        if (!res.ok()) return 0;
        const rows = (await res.json()) as Array<{
          status?: string;
          remainingBalance?: number;
          effectiveBalance?: number;
          totalCost?: number;
          totalPaid?: number;
        }>;
        if (!Array.isArray(rows)) return 0;
        return rows.filter((e) => {
          const status = String(e.status ?? "").toLowerCase();
          if (status === "cancelled" || status === "canceled" || status === "withdrawn") {
            return false;
          }
          const bal =
            typeof e.effectiveBalance === "number"
              ? e.effectiveBalance
              : typeof e.remainingBalance === "number"
                ? e.remainingBalance
                : Math.max(0, (e.totalCost ?? 0) - (e.totalPaid ?? 0));
          return bal > 0 || status === "pending_payment";
        }).length;
      },
      { timeout: 60_000, intervals: [500, 1000, 2000] },
    )
    .toBeGreaterThan(0);

  await page.evaluate(() => {
    sessionStorage.setItem("postSessionEnrollmentCheckout", "1");
  });

  await page.goto("/cart/checkout", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page).toHaveURL(/\/cart\/checkout/, { timeout: 30_000 });
  await expect(page.getByText("Payment Information", { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  // Wait until Payment Element is ready (not stuck on "Loading Payment Form...")
  await expect(page.getByTestId("button-checkout-submit")).toContainText(/Pay \$/, {
    timeout: 120_000,
  });
  await expect(page.getByTestId("button-checkout-submit")).toBeEnabled({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/cart\/checkout/);
}
