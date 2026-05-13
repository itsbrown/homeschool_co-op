import { expect, type Page } from "@playwright/test";

export async function loginParent(page: Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/login\/?$/, { timeout: 45_000 });
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
