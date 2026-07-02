import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { testApiToken } from "./testSeed";

export type StoreGuestCheckoutContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
};

export type StoreGuestEmergencyContact = {
  firstName: string;
  lastName: string;
  phone: string;
  relationship: string;
};

export type StoreGuestChildDraft = {
  firstName: string;
  lastName: string;
  birthdate: string;
  gradeLevel: string;
};

/** Add a session/class line as an unauthenticated visitor. */
export async function addStoreProgramToCartAsGuest(
  page: Page,
  addButtonLabel: string | RegExp,
): Promise<void> {
  await page.getByRole("button", { name: addButtonLabel }).click();
  await expect(page.getByTestId("store-cart-button")).toContainText("Cart (1)");
}

/** Sign in from checkout Step 3 link; expects return to checkout with cart intact. */
export async function loginFromStoreCheckoutAndReturn(
  page: Page,
  checkoutPath: string,
  email: string,
  password: string,
): Promise<void> {
  await page.getByTestId("store-checkout-step1-continue").click();
  await page.getByTestId("store-checkout-parent-first-name").fill("Store");
  await page.getByTestId("store-checkout-parent-last-name").fill("Parent");
  await page.getByTestId("store-checkout-parent-email").fill(email);
  await page.getByTestId("store-checkout-parent-phone").fill("5555550100");
  await page.getByTestId("store-checkout-emergency-first-name").fill("Emergency");
  await page.getByTestId("store-checkout-emergency-last-name").fill("Contact");
  await page.getByTestId("store-checkout-emergency-phone").fill("5555550199");
  await page.getByTestId("store-checkout-emergency-relationship").fill("Aunt");
  await page.getByTestId("store-checkout-step2-continue").click();
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(new RegExp(`${checkoutPath.replace(/\//g, "\\/")}(\\?|$)`), {
    timeout: 45_000,
  });
}

export async function expectStoreCartLineCount(page: Page, expectedLines: number): Promise<void> {
  const count = await page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem("public_store_cart_v1");
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as { lines?: unknown[] };
      return parsed.lines?.length ?? 0;
    } catch {
      return 0;
    }
  });
  expect(count).toBe(expectedLines);
}

export async function openStoreCheckoutFromCart(page: Page): Promise<void> {
  await page.getByTestId("store-cart-button").click();
}

/** Walk guest checkout for a cart that includes at least one program line. */
export async function completeStoreGuestCheckout(
  page: Page,
  contact: StoreGuestCheckoutContact,
  child: StoreGuestChildDraft,
  emergency: StoreGuestEmergencyContact = {
    firstName: "Emergency",
    lastName: "Contact",
    phone: "5555550199",
    relationship: "Aunt",
  },
): Promise<void> {
  await page.getByTestId("store-checkout-step1-continue").click();
  await page.getByTestId("store-checkout-parent-first-name").fill(contact.firstName);
  await page.getByTestId("store-checkout-parent-last-name").fill(contact.lastName);
  await page.getByTestId("store-checkout-parent-email").fill(contact.email);
  await page.getByTestId("store-checkout-parent-phone").fill(contact.phone ?? "5555550100");
  await page.getByTestId("store-checkout-emergency-first-name").fill(emergency.firstName);
  await page.getByTestId("store-checkout-emergency-last-name").fill(emergency.lastName);
  await page.getByTestId("store-checkout-emergency-phone").fill(emergency.phone);
  await page.getByTestId("store-checkout-emergency-relationship").fill(emergency.relationship);
  await page.getByTestId("store-checkout-step2-continue").click();

  await page.getByTestId("store-checkout-child-first-name").first().fill(child.firstName);
  await page.getByTestId("store-checkout-child-last-name").first().fill(child.lastName);
  await page.getByTestId("store-checkout-child-birthdate").first().fill(child.birthdate);
  await page.getByTestId("store-checkout-child-grade").first().click();
  await page.getByRole("option", { name: child.gradeLevel }).click();
  await page.getByTestId("store-checkout-step3-continue").click();
}

export async function postFulfillStoreCheckout(
  request: APIRequestContext,
  body: { snapshotId?: string; accessToken?: string },
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null }> {
  const response = await request.post("/api/test/fulfill-store-checkout", {
    headers: {
      "X-Test-Token": testApiToken(),
      "Content-Type": "application/json",
    },
    data: body,
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { ok: response.ok(), status: response.status(), json };
}

/**
 * Intercept store checkout POST, fulfill via test API, and return success URL without Stripe redirect.
 */
export async function installStoreCheckoutFulfillInterceptor(
  page: Page,
  request: APIRequestContext,
  storeSlug: string,
): Promise<void> {
  await page.route("**/api/public/store/**/checkout", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    const json = (await response.json()) as {
      checkoutUrl?: string | null;
      accessToken?: string;
      snapshotId?: string;
      successUrl?: string;
      message?: string;
    };

    if (!response.ok() || !json.snapshotId || !json.accessToken) {
      await route.fulfill({ response });
      return;
    }

    const fulfill = await postFulfillStoreCheckout(request, { snapshotId: json.snapshotId });
    if (!fulfill.ok) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Test fulfill failed",
          details: fulfill.json,
        }),
      });
      return;
    }

    await route.fulfill({
      status: response.status(),
      contentType: "application/json",
      body: JSON.stringify({
        ...json,
        checkoutUrl: null,
        successUrl: `/store/${storeSlug}/success?token=${json.accessToken}`,
      }),
    });
  });
}
