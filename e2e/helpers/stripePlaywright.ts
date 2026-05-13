import type { Locator, Page } from "@playwright/test";

/**
 * Fills Stripe Payment Element test card fields (test mode).
 * Works for checkout and in-dialog scheduled payments (same Elements pattern).
 */
export async function fillStripePaymentElement(page: Page, opts?: { within?: Locator }): Promise<void> {
  const root = opts?.within ?? page.locator("body");
  await root.locator('iframe[src*="js.stripe.com"]').first().waitFor({ state: "attached", timeout: 90_000 });

  const outer = root.frameLocator('iframe[src*="js.stripe.com"]').first();
  const inner = outer.frameLocator("iframe").first();

  const numberInput = inner.locator('input[name="number"], input[name="cardnumber"], input[data-elements-stable-field-name="cardNumber"]');
  await numberInput.first().waitFor({ state: "visible", timeout: 60_000 });
  await numberInput.first().fill("4242424242424242");

  const exp = inner.locator('input[name="expiry"], input[name="exp-date"], input[data-elements-stable-field-name="cardExpiry"]');
  if ((await exp.count()) > 0) {
    await exp.first().fill("1234");
  }

  const cvc = inner.locator('input[name="cvc"], input[name="cc-csc"], input[data-elements-stable-field-name="cardCvc"]');
  if ((await cvc.count()) > 0) {
    await cvc.first().fill("123");
  }

  const zip = inner.locator('input[name="postal"], input[name="postalCode"], input[autocomplete="postal-code"]');
  if ((await zip.count()) > 0) {
    await zip.first().fill("94107");
  }
}
