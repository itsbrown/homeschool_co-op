import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { fillStripePaymentElement } from "./stripePlaywright";
import {
  dismissStaffGuideIfVisible,
  preventStaffGuideModal,
  waitForSupabaseToken,
  bearerAuthHeaders,
} from "./parentCheckoutHelpers";
import { testApiToken } from "./testSeed";

export type OpenSessionSeed = { id: number; name: string; enrollmentOpen: boolean };

/** Complete school-code registration with N children (1–10). */
export async function registerParentWithChildren(
  page: Page,
  opts: {
    registrationCode: string;
    schoolName: string;
    campusName: string;
    parentEmail: string;
    password: string;
    children: Array<{ firstName: string; lastName: string; birthdate: string; grade: string }>;
  },
) {
  const { registrationCode, schoolName, campusName, parentEmail, password, children } = opts;

  const locationsPromise = page.waitForResponse(
    (r) =>
      r.url().includes("/api/public/registration/locations") && r.ok(),
    { timeout: 45_000 },
  );

  await page.goto(`/register/${registrationCode}`, { waitUntil: "domcontentloaded" });
  await locationsPromise;

  await expect(page.getByText(schoolName, { exact: false })).toBeVisible({ timeout: 20_000 });

  const locationSelect = page.getByTestId("registration-location-select");
  await expect(locationSelect).toBeVisible({ timeout: 15_000 });
  await locationSelect.click();
  await page.getByRole("option", { name: campusName }).click();

  await page.getByTestId("registration-parent-first-name").fill("E2E");
  await page.getByLabel("Last Name").first().fill("Journey");
  await page.getByTestId("registration-email").fill(parentEmail);
  await page.getByTestId("registration-password").fill(password);
  await page.getByLabel("Confirm Password").fill(password);
  await page.getByLabel("Phone Number").fill("5555550199");

  for (let i = 1; i < children.length; i++) {
    await page.getByRole("button", { name: "Add another student" }).click();
  }

  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if (i === 0) {
      await page.getByTestId("registration-child-0-first-name").fill(child.firstName);
    } else {
      await page.getByLabel("First name").nth(i).fill(child.firstName);
    }
    await page.getByLabel("Last name").nth(i).fill(child.lastName);
    await page.locator('input[type="date"]').nth(i).fill(child.birthdate);
    const gradeTrigger =
      i === 0
        ? page.getByTestId("registration-child-0-grade")
        : page.getByRole("button", { name: "Select grade" }).nth(i);
    await gradeTrigger.click();
    await page.getByRole("option", { name: child.grade }).click();
  }

  const registerResponse = page.waitForResponse(
    (r) => r.url().includes("/api/auth/register") && r.request().method() === "POST",
    { timeout: 90_000 },
  );
  await page.getByTestId("registration-submit").click();
  const regRes = await registerResponse;
  expect(regRes.ok(), `register failed: ${regRes.status()}`).toBeTruthy();

  await expect(page).toHaveURL(/\/(dashboard|login)/, { timeout: 90_000 });
}

/** Session enrollment wizard: multiple children, 1–3 sessions, full day, add to cart. */
export async function enrollSessionsInWizard(
  page: Page,
  opts: {
    childIds: number[];
    sessionIds: number[];
  },
) {
  const { childIds, sessionIds } = opts;
  await preventStaffGuideModal(page);
  await page.goto("/enroll", { waitUntil: "domcontentloaded" });
  await dismissStaffGuideIfVisible(page);

  await page.waitForResponse(
    (r) => r.url().includes("/api/admin/sessions/open") && r.ok(),
    { timeout: 60_000 },
  );

  const wizard = page.getByTestId("session-enrollment-wizard");
  await expect(wizard.getByTestId("session-enroll-step-1")).toBeVisible({ timeout: 30_000 });

  for (const childId of childIds) {
    await wizard.getByTestId(`enroll-child-${childId}`).click();
  }

  const nextBtn = wizard.getByRole("button", { name: /^next$/i });
  await expect(nextBtn).toBeEnabled();
  await nextBtn.click();
  await expect(wizard.getByTestId("session-enroll-step-2")).toBeVisible();

  for (const sessionId of sessionIds) {
    await wizard.getByTestId(`session-option-${sessionId}`).click();
  }
  await expect(nextBtn).toBeEnabled();
  await nextBtn.click();
  await expect(wizard.getByTestId("session-enroll-step-3")).toBeVisible();

  await wizard.getByRole("heading", { name: "Full Day" }).click();
  await expect(nextBtn).toBeEnabled();
  await nextBtn.click();
  await expect(wizard.getByTestId("session-enroll-step-4")).toBeVisible();

  const enrollResponse = page.waitForResponse(
    (r) => r.url().includes("/api/session-enrollments") && r.request().method() === "POST",
    { timeout: 90_000 },
  );
  await wizard.getByRole("button", { name: /add to cart/i }).click();
  const enrollRes = await enrollResponse;
  expect(enrollRes.ok(), `session-enrollments failed: ${enrollRes.status()}`).toBeTruthy();

  await expect(page).toHaveURL(/\/cart/, { timeout: 60_000 });
}

export async function checkoutBiweeklyWithAutopay(page: Page) {
  await expect(page.getByText("Payment Information")).toBeVisible({ timeout: 120_000 });
  await page.locator("#biweekly").click({ timeout: 20_000 });

  const autoPaySwitch = page.getByRole("switch", { name: "Enable automatic payments" });
  if (!(await autoPaySwitch.isChecked())) {
    await autoPaySwitch.click();
  }
  await expect(autoPaySwitch).toBeChecked();

  await fillStripePaymentElement(page);
  await page.getByTestId("button-checkout-submit").click();
  await page.waitForURL(/\/cart\/success/, { timeout: 180_000 });
}

export async function fetchParentChildren(page: Page): Promise<Array<{ id: number; firstName: string; lastName: string }>> {
  const token = await waitForSupabaseToken(page);
  const res = await page.request.get("/api/parent/children", {
    headers: bearerAuthHeaders(token),
  });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const list = Array.isArray(data) ? data : data?.children ?? [];
  return list.map((c: { id: number; firstName: string; lastName: string }) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
  }));
}

export async function fetchUpcomingScheduledPayments(page: Page) {
  const token = await waitForSupabaseToken(page);
  const res = await page.request.get("/api/scheduled-payments/upcoming", {
    headers: bearerAuthHeaders(token),
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as {
    scheduledPayments?: Array<{
      id: number;
      installmentNumber?: number;
      status?: string;
      amount?: number;
    }>;
  };
  return body.scheduledPayments ?? [];
}

export async function runAutoPayForScheduledPayment(
  request: APIRequestContext,
  scheduledPaymentId: number,
): Promise<{ result: string }> {
  const res = await request.post(`/api/test/run-auto-pay-for/${scheduledPaymentId}`, {
    headers: { "X-Test-Token": testApiToken() },
  });
  const text = await res.text();
  expect(res.ok(), `run-auto-pay-for failed (${res.status()}): ${text}`).toBeTruthy();
  return JSON.parse(text) as { result: string };
}

export async function getScheduledPaymentStatus(
  request: APIRequestContext,
  scheduledPaymentId: number,
) {
  const res = await request.get(`/api/test/scheduled-payment/${scheduledPaymentId}`, {
    headers: { "X-Test-Token": testApiToken() },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { payment: { status: string; installmentNumber?: number } };
  return body.payment;
}
