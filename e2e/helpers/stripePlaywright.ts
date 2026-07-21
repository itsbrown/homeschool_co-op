import type { Locator, Page } from "@playwright/test";

/**
 * Fills Stripe Payment Element test card fields (test mode).
 * Works for checkout and in-dialog scheduled payments (same Elements pattern).
 *
 * Stripe occasionally nests fields one or two iframes deep; try both.
 * Accordion layouts may need an explicit "Card" selection first.
 */
export async function fillStripePaymentElement(page: Page, opts?: { within?: Locator }): Promise<void> {
  const root = opts?.within ?? page.locator("body");
  await root.locator('iframe[src*="js.stripe.com"]').first().waitFor({ state: "attached", timeout: 90_000 });

  // Accordion / tabs: expand Card if Link/other method is selected by default
  const cardTab = root.getByRole("button", { name: /^card$/i }).or(root.getByText(/^card$/i));
  if ((await cardTab.count()) > 0) {
    await cardTab.first().click({ timeout: 5_000 }).catch(() => {});
  }

  const numberSelectors =
    'input[name="number"], input[name="cardnumber"], input[data-elements-stable-field-name="cardNumber"], input[autocomplete="cc-number"]';
  const expSelectors =
    'input[name="expiry"], input[name="exp-date"], input[data-elements-stable-field-name="cardExpiry"], input[autocomplete="cc-exp"]';
  const cvcSelectors =
    'input[name="cvc"], input[name="cc-csc"], input[data-elements-stable-field-name="cardCvc"], input[autocomplete="cc-csc"]';
  const zipSelectors =
    'input[name="postal"], input[name="postalCode"], input[autocomplete="postal-code"]';

  const outer = root.frameLocator('iframe[src*="js.stripe.com"]').first();

  // Prefer nested Payment Element frame; fall back to fields on the outer frame.
  const candidates = [outer.frameLocator("iframe").first(), outer];

  let filled = false;
  let lastError: unknown;
  for (const frame of candidates) {
    try {
      const numberInput = frame.locator(numberSelectors).first();
      await numberInput.waitFor({ state: "visible", timeout: 45_000 });
      await numberInput.fill("4242424242424242");

      const exp = frame.locator(expSelectors);
      if ((await exp.count()) > 0) {
        await exp.first().fill("1234");
      }

      const cvc = frame.locator(cvcSelectors);
      if ((await cvc.count()) > 0) {
        await cvc.first().fill("123");
      }

      const zip = frame.locator(zipSelectors);
      if ((await zip.count()) > 0) {
        await zip.first().fill("94107");
      }

      filled = true;
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!filled) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Could not fill Stripe Payment Element card fields");
  }
}
