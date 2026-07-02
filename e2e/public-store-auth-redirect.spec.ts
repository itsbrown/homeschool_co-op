import { test, expect } from "@playwright/test";
import {
  addStoreProgramToCartAsGuest,
  openStoreCheckoutFromCart,
} from "./helpers/publicStoreCheckout";
import {
  expectAuthReturnToStored,
  expectStoreCartLineCount,
  loginFromStoreCheckoutChildrenStep,
  loginFromStoreCheckoutContact,
  loginFromStoreHeader,
  seedPublicStoreWithLinkedParent,
  storePathRegex,
} from "./helpers/publicStoreAuth";
import { postEnsurePublicStoreSchema } from "./helpers/testSeed";

test.describe.configure({ mode: "serial" });

test.describe("public store auth redirects", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async ({ request }) => {
    const { response, json } = await postEnsurePublicStoreSchema(request);
    test.skip(
      !response.ok(),
      `public store schema ensure failed (${response.status()}): ${json?.error ?? "unknown"}`,
    );
  });

  test("login from store browse returns to storefront", async ({ page, request }) => {
    const seeded = await seedPublicStoreWithLinkedParent(request);
    test.skip(!seeded.ok, seeded.reason);

    const { slug, parent } = seeded.seed;
    const storePath = `/store/${slug}`;

    await page.goto(storePath, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("store-header-sign-in")).toBeVisible();
    await loginFromStoreHeader(page, storePath, parent.email, parent.password);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("store-header-sign-in")).toHaveCount(0);
  });

  test("login from item detail returns to the same program page", async ({ page, request }) => {
    const seeded = await seedPublicStoreWithLinkedParent(request, {
      withPublishedProduct: false,
      withClass: true,
      withPublishedClassListing: true,
      classPriceCents: 5000,
    });
    test.skip(!seeded.ok, seeded.reason);
    test.skip(!seeded.seed.itemSlug, "class slug unavailable");

    const { slug, parent, itemSlug, classListingId } = seeded.seed;
    const detailPath = `/store/${slug}/${itemSlug}`;

    await page.goto(detailPath, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("store-item-detail")).toBeVisible();
    await loginFromStoreHeader(page, detailPath, parent.email, parent.password);
    await expect(page).toHaveURL(storePathRegex(detailPath));
    await expect(page.getByTestId("store-item-title")).toBeVisible();
    if (classListingId) {
      await expect(page.getByTestId(`store-add-class-${classListingId}`)).toBeVisible();
    }
  });

  test("login from merch checkout contact step returns with cart preserved", async ({
    page,
    request,
  }) => {
    const seeded = await seedPublicStoreWithLinkedParent(request);
    test.skip(!seeded.ok, seeded.reason);

    const { slug, parent } = seeded.seed;
    const checkoutPath = `/store/${slug}/checkout`;

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByTestId("store-cart-button")).toContainText("Cart (1)");
    await openStoreCheckoutFromCart(page);
    await expect(page).toHaveURL(storePathRegex(checkoutPath));

    await page.getByTestId("store-checkout-step1-continue").click();
    await expect(page.getByTestId("store-checkout-sign-in")).toBeVisible();
    await loginFromStoreCheckoutContact(page, checkoutPath, parent.email, parent.password);

    await expectStoreCartLineCount(page, 1);
    await expect(page.getByTestId("store-cart-review")).toBeVisible();
    await expect(page.getByTestId("store-checkout-sign-in")).toHaveCount(0);
  });

  test("login from program checkout children step returns with cart preserved", async ({
    page,
    request,
  }) => {
    const seeded = await seedPublicStoreWithLinkedParent(request, {
      withPublishedProduct: false,
      withClass: true,
      withPublishedClassListing: true,
      classPriceCents: 5000,
    });
    test.skip(!seeded.ok, seeded.reason);

    const { slug, parent } = seeded.seed;
    const checkoutPath = `/store/${slug}/checkout`;

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await addStoreProgramToCartAsGuest(page, /Add — \$50\.00/);
    await openStoreCheckoutFromCart(page);
    await expect(page).toHaveURL(storePathRegex(checkoutPath));

    await page.getByTestId("store-checkout-step1-continue").click();
    await page.getByTestId("store-checkout-parent-first-name").fill("Store");
    await page.getByTestId("store-checkout-parent-last-name").fill("Parent");
    await page.getByTestId("store-checkout-parent-email").fill(parent.email);
    await page.getByTestId("store-checkout-parent-phone").fill("5555550100");
    await page.getByTestId("store-checkout-emergency-first-name").fill("Emergency");
    await page.getByTestId("store-checkout-emergency-last-name").fill("Contact");
    await page.getByTestId("store-checkout-emergency-phone").fill("5555550199");
    await page.getByTestId("store-checkout-emergency-relationship").fill("Aunt");
    await page.getByTestId("store-checkout-step2-continue").click();

    await expect(page.getByTestId("store-checkout-sign-in-children")).toBeVisible();
    await loginFromStoreCheckoutChildrenStep(page, checkoutPath, parent.email, parent.password);

    await expectStoreCartLineCount(page, 1);
    await expect(page.getByTestId("store-cart-review")).toBeVisible();
  });

  test("login link stores returnTo in sessionStorage before auth completes", async ({
    page,
    request,
  }) => {
    const seeded = await seedPublicStoreWithLinkedParent(request);
    test.skip(!seeded.ok, seeded.reason);

    const { slug, parent } = seeded.seed;
    const checkoutPath = `/store/${slug}/checkout`;

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Add to cart" }).click();
    await openStoreCheckoutFromCart(page);
    await page.getByTestId("store-checkout-step1-continue").click();

    await page.getByTestId("store-checkout-sign-in").click();
    await expect(page).toHaveURL(/\/login\?.*returnTo=/);
    await expectAuthReturnToStored(page, checkoutPath);

    await page.getByLabel("Email").fill(parent.email);
    await page.getByLabel("Password").fill(parent.password);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(storePathRegex(checkoutPath), { timeout: 45_000 });
    await expectStoreCartLineCount(page, 1);
  });

  test("member logging in from store sees member banner", async ({ page, request }) => {
    const seeded = await seedPublicStoreWithLinkedParent(request, {
      withPublishedProduct: false,
      withClass: true,
      withPublishedClassListing: true,
      classPriceCents: 5000,
    });
    test.skip(!seeded.ok, seeded.reason);

    const { slug, parent } = seeded.seed;
    const storePath = `/store/${slug}`;

    await page.goto(storePath, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("store-header-sign-in")).toBeVisible();
    await loginFromStoreHeader(page, storePath, parent.email, parent.password);
    await expect(page.getByTestId("public-store-member-banner")).toBeVisible();
  });
});
