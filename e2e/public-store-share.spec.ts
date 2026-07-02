import { test, expect } from "@playwright/test";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";
import {
  bearerAuthHeaders,
  waitForSupabaseToken,
} from "./helpers/parentCheckoutHelpers";
import {
  postEnsurePublicStoreSchema,
  postSetupPublicStoreScenario,
} from "./helpers/testSeed";
import {
  completeStoreMerchGuestContactAndDelivery,
  installStoreCheckoutFulfillInterceptor,
} from "./helpers/publicStoreCheckout";
import { seedPublicStoreWithLinkedParent, loginFromStoreHeader } from "./helpers/publicStoreAuth";
import {
  expectShareClipboardContainsItem,
  installShareClipboardCapture,
  readStoreShareReferralUserId,
  waitForSessionUserId,
} from "./helpers/publicStoreShare";

test.describe.configure({ mode: "serial" });

test.describe("public store share and referral attribution", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async ({ request }) => {
    const { response, json } = await postEnsurePublicStoreSchema(request);
    test.skip(
      !response.ok(),
      `public store schema ensure failed (${response.status()}): ${json?.error ?? "unknown"}`,
    );
  });

  test("share buttons appear on catalog card and item detail page", async ({ page, request }) => {
    const { response, json } = await postSetupPublicStoreScenario(request, {
      productImageUrl: "/uploads/store-products/e2e-share-ui.png",
    });
    test.skip(!response.ok(), `seed failed (${response.status()})`);

    const slug = json!.data!.storeSlug;
    const productName = json!.data!.product.name;

    const catalogRes = await request.get(`/api/public/store/${slug}/catalog`);
    expect(catalogRes.ok()).toBeTruthy();
    const catalog = (await catalogRes.json()) as {
      items: { listingType: string; listingId: number; slug: string; title: string }[];
    };
    const product = catalog.items.find((i) => i.listingType === "product");
    test.skip(!product, "product listing missing from catalog");

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId(`store-share-${product.listingId}`)).toBeVisible();

    await page.getByTestId(`store-item-link-${product.listingId}`).click();
    await expect(page).toHaveURL(new RegExp(`/store/${slug}/${product.slug}`));
    await expect(page.getByTestId(`store-share-${product.listingId}`)).toBeVisible();
    await expect(page.getByTestId("store-item-title")).toHaveText(productName);
  });

  test("guest share copies description and link without userId param", async ({ page, request }) => {
    await installShareClipboardCapture(page);

    const { response, json } = await postSetupPublicStoreScenario(request, {
      productImageUrl: "/uploads/store-products/e2e-share-guest.png",
    });
    test.skip(!response.ok(), `seed failed (${response.status()})`);

    const slug = json!.data!.storeSlug;
    const catalogRes = await request.get(`/api/public/store/${slug}/catalog`);
    const catalog = (await catalogRes.json()) as {
      items: { listingType: string; listingId: number; slug: string; title: string; description?: string }[];
    };
    const product = catalog.items.find((i) => i.listingType === "product")!;

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId(`store-share-${product.listingId}`).click();

    await expectShareClipboardContainsItem(page, {
      title: product.title,
      slug: product.slug,
      storeSlug: slug,
      sharerUserId: null,
      descriptionSnippet: "Playwright seeded",
    });
  });

  test("?userId= on store URL persists referral in sessionStorage", async ({ page, request }) => {
    const { response, json } = await postSetupPublicStoreScenario(request);
    test.skip(!response.ok(), `seed failed (${response.status()})`);

    const slug = json!.data!.storeSlug;
    const referrerId = json!.data!.admin.id;

    await page.goto(`/store/${slug}?userId=${referrerId}`, { waitUntil: "domcontentloaded" });
    await expect.poll(async () => readStoreShareReferralUserId(page, slug)).toBe(referrerId);
  });

  test("guest merch checkout sends referredByUserId and records referral on order", async ({
    page,
    request,
  }) => {
    const unique = Date.now();
    const guestEmail = `store_ref_${unique}@test.com`;

    const { response, json } = await postSetupPublicStoreScenario(request, {
      linkSupabaseAuthAdmin: true,
      productImageUrl: "/uploads/store-products/e2e-share-ref.png",
    });
    test.skip(
      !response.ok() || json?.data?.adminSupabaseLinked !== true,
      "seed or Supabase admin link unavailable",
    );

    const slug = json!.data!.storeSlug;
    const referrerId = json!.data!.admin.id;
    const { admin } = json!.data!;

    let checkoutBody: Record<string, unknown> | null = null;
    await installStoreCheckoutFulfillInterceptor(page, request, slug, {
      onCheckoutPost: (body) => {
        checkoutBody = body;
      },
    });

    await page.goto(`/store/${slug}?userId=${referrerId}`, { waitUntil: "domcontentloaded" });
    await expect.poll(async () => readStoreShareReferralUserId(page, slug)).toBe(referrerId);

    await page.getByRole("button", { name: "Add to cart" }).click();
    await page.getByTestId("store-cart-button").click();

    await completeStoreMerchGuestContactAndDelivery(
      page,
      {
        firstName: "Referral",
        lastName: "Guest",
        email: guestEmail,
        phone: "5555550100",
      },
      { method: "pickup" },
    );

    await page.getByTestId("store-checkout-submit").click();
    await page.waitForURL(new RegExp(`/store/${slug}/success`), { timeout: 60_000 });

    expect(checkoutBody).not.toBeNull();
    expect(checkoutBody!.referredByUserId).toBe(referrerId);
    expect(typeof checkoutBody!.referralCapturedAt).toBe("string");

    await loginSchoolAdmin(page, admin.email, admin.password);
    await page.evaluate(() => localStorage.setItem("activeRole", "schoolAdmin"));
    const token = await waitForSupabaseToken(page);
    const signupsRes = await request.get("/api/school-admin/public-store/signups", {
      headers: {
        ...bearerAuthHeaders(token),
        "X-Active-Role": "schoolAdmin",
      },
    });
    expect(signupsRes.ok()).toBeTruthy();
    const signups = (await signupsRes.json()) as {
      parentEmail: string;
      referralUserId: number | null;
      referralName: string | null;
    }[];
    const row = signups.find((s) => s.parentEmail === guestEmail);
    expect(row).toBeTruthy();
    expect(row!.referralUserId).toBe(referrerId);
    expect(row!.referralName).toBeTruthy();
  });

  test("logged-in parent share link includes their userId", async ({ page, request }) => {
    await installShareClipboardCapture(page);

    const seeded = await seedPublicStoreWithLinkedParent(request);
    test.skip(!seeded.ok, seeded.reason);

    const { slug, parent } = seeded.seed;
    const catalogRes = await request.get(`/api/public/store/${slug}/catalog`);
    const catalog = (await catalogRes.json()) as {
      items: { listingType: string; listingId: number; slug: string; title: string; description?: string }[];
    };
    const product = catalog.items.find((i) => i.listingType === "product");
    test.skip(!product, "product listing missing");

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await loginFromStoreHeader(page, `/store/${slug}`, parent.email, parent.password);
    await waitForSessionUserId(page, parent.id);

    await page.getByTestId(`store-share-${product!.listingId}`).click();

    await expectShareClipboardContainsItem(page, {
      title: product!.title,
      slug: product!.slug,
      storeSlug: slug,
      sharerUserId: parent.id,
      descriptionSnippet: "Playwright seeded",
    });
  });
});
