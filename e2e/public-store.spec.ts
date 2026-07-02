import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";
import {
  bearerAuthHeaders,
  waitForSupabaseToken,
} from "./helpers/parentCheckoutHelpers";
import {
  postEnsurePublicStoreSchema,
  postSetupPublicStoreScenario,
  postSetupCartScenario,
} from "./helpers/testSeed";
import { runPresignedUpload } from "./helpers/presignedUploadFlow";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const merchFixturePath = path.join(__dirname, "fixtures", "merch-sample.png");

test.describe.configure({ mode: "serial" });

test.describe("public store", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async ({ request }) => {
    const { response, json } = await postEnsurePublicStoreSchema(request);
    test.skip(
      !response.ok(),
      `public store schema ensure failed (${response.status()}): ${json?.error ?? "unknown"}`,
    );
  });

  test("POST /api/unified-uploads/request-url for storeProducts requires auth", async ({
    request,
  }) => {
    const res = await request.post("/api/unified-uploads/request-url", {
      data: {
        name: "merch-sample.png",
        size: 1024,
        contentType: "image/png",
        category: "storeProducts",
      },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/authorization/i);
  });

  test("POST /api/unified-uploads/request-url for storePrograms requires auth", async ({
    request,
  }) => {
    const res = await request.post("/api/unified-uploads/request-url", {
      data: {
        name: "merch-sample.png",
        size: 1024,
        contentType: "image/png",
        category: "storePrograms",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/public/store/:slug/catalog returns imageUrl for merch", async ({
    request,
  }) => {
    const imageUrl = "/uploads/store-products/e2e-catalog-probe.png";
    const { response, json } = await postSetupPublicStoreScenario(request, {
      productImageUrl: imageUrl,
    });
    test.skip(!response.ok(), `seed failed (${response.status()}): ${json?.error ?? json?.details}`);

    const catalogRes = await request.get(
      `/api/public/store/${json!.data!.storeSlug}/catalog`,
    );
    expect(catalogRes.ok()).toBeTruthy();
    const catalog = (await catalogRes.json()) as {
      items: { listingType: string; title: string; imageUrl?: string }[];
    };
    const product = catalog.items.find((i) => i.listingType === "product");
    expect(product?.imageUrl).toBe(imageUrl);
  });

  test("guest browses store and sees merch card with cropped image", async ({
    page,
    request,
  }) => {
    const imageUrl = "/uploads/store-products/e2e-guest-display.png";
    const { response, json } = await postSetupPublicStoreScenario(request, {
      productImageUrl: imageUrl,
    });
    test.skip(!response.ok(), `seed failed (${response.status()})`);

    const slug = json!.data!.storeSlug;
    const productName = json!.data!.product.name;

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      json!.data!.school.name,
    );
    await expect(page.getByText(productName)).toBeVisible();
    const img = page.getByTestId("store-product-image").first();
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("src", imageUrl);
    await expect(img).toHaveClass(/object-cover/);
  });

  test("guest opens item detail page with full description and add to cart", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupPublicStoreScenario(request, {
      withPublishedProduct: false,
      withClass: true,
      withPublishedClassListing: true,
      classPriceCents: 37500,
    });
    test.skip(!response.ok(), `seed failed (${response.status()})`);

    const slug = json!.data!.storeSlug;
    const classData = json!.data!.class!;
    const listingId = classData.listingId!;
    test.skip(!listingId, "class listing not seeded");

    const itemRes = await request.get(`/api/public/store/${slug}/catalog/${listingId}`);
    expect(itemRes.ok()).toBeTruthy();
    const itemBody = (await itemRes.json()) as { item: { description: string; title: string } };
    expect(itemBody.item.title).toBe(classData.title);
    expect(itemBody.item.description).toContain("Playwright seeded store class");

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId(`store-item-link-${listingId}`).click();
    await expect(page).toHaveURL(new RegExp(`/store/${slug}/item/${listingId}`));
    await expect(page.getByTestId("store-item-detail")).toBeVisible();
    await expect(page.getByTestId("store-item-title")).toHaveText(classData.title);
    await expect(page.getByTestId("store-item-description")).toContainText(
      "Playwright seeded store class",
    );
    await expect(page.getByTestId("store-item-description")).not.toHaveClass(/line-clamp/);

    await page.getByTestId(`store-add-class-${listingId}`).click();
    await expect(page.getByText("Added to cart")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("store-cart-button")).toContainText("Cart (1)");
  });

  test("admin uploads image via API and product displays cropped photo on store", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupPublicStoreScenario(request, {
      linkSupabaseAuthAdmin: true,
      withPublishedProduct: false,
    });
    test.skip(
      !response.ok() || json?.data?.adminSupabaseLinked !== true,
      "seed or Supabase admin link unavailable",
    );

    const { admin, storeSlug, school } = json!.data!;
    const uniqueName = `E2E Upload Hoodie ${Date.now()}`;

    await loginSchoolAdmin(page, admin.email, admin.password);
    await page.evaluate(() => localStorage.setItem("activeRole", "schoolAdmin"));
    const token = await waitForSupabaseToken(page);
    const authHeaders = {
      ...bearerAuthHeaders(token),
      "X-Active-Role": "schoolAdmin",
    };

    const imageUrl = await runPresignedUpload(
      request,
      authHeaders,
      "storeProducts",
      merchFixturePath,
      school.id,
    );
    expect(imageUrl).toMatch(/^\/public\/store-products\//);

    const createRes = await request.post("/api/school-admin/public-store/products", {
      headers: { ...authHeaders, "Content-Type": "application/json" },
      data: {
        name: uniqueName,
        description: "E2E merch with photo",
        priceCents: 2499,
        imageUrl,
      },
    });
    expect(createRes.ok(), `create product failed: ${createRes.status()}`).toBeTruthy();
    const product = (await createRes.json()) as { id: number };

    const listingRes = await request.post("/api/school-admin/public-store/listings", {
      headers: { ...authHeaders, "Content-Type": "application/json" },
      data: {
        listingType: "product",
        sourceId: product.id,
        isPublished: true,
        membersOnly: false,
      },
    });
    expect(listingRes.ok(), `publish listing failed: ${listingRes.status()}`).toBeTruthy();

    await page.goto(`/store/${storeSlug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 30_000 });
    const img = page.getByTestId("store-product-image").first();
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("src", imageUrl);
    await expect(img).toHaveClass(/object-cover/);
  });

  test("school admin products tab shows image upload control", async ({ page, request }) => {
    const { response, json } = await postSetupPublicStoreScenario(request, {
      linkSupabaseAuthAdmin: true,
    });
    test.skip(
      !response.ok() || json?.data?.adminSupabaseLinked !== true,
      "seed or Supabase admin link unavailable",
    );

    const { admin } = json!.data!;
    await loginSchoolAdmin(page, admin.email, admin.password);
    await page.evaluate(() => localStorage.setItem("activeRole", "schoolAdmin"));
    await page.goto("/school-admin/public-store", { waitUntil: "domcontentloaded" });
    await page.getByTestId("store-tab-products").click();
    await expect(page.getByTestId("image-upload-dropzone")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("button-create-store-product")).toBeVisible();
  });

  test("school admin programs tab uploads image through browser ImageUpload", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupPublicStoreScenario(request, {
      linkSupabaseAuthAdmin: true,
      withPublishedProduct: false,
      withClass: true,
      withPublishedClassListing: true,
    });
    test.skip(
      !response.ok() || json?.data?.adminSupabaseLinked !== true,
      "seed or Supabase admin link unavailable",
    );

    const { admin } = json!.data!;
    await loginSchoolAdmin(page, admin.email, admin.password);
    await page.evaluate(() => localStorage.setItem("activeRole", "schoolAdmin"));
    await page.goto("/school-admin/public-store?tab=programs", {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("store-tab-programs").click();

    const uploadResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/unified-uploads/request-url") &&
        r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByTestId("image-upload-input").first().setInputFiles(merchFixturePath);
    const uploadRes = await uploadResponse;
    expect(uploadRes.ok(), `upload request-url failed: ${uploadRes.status()}`).toBeTruthy();

    await expect(page.getByText("Image uploaded")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Store image saved")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("image-upload-preview").first()).toHaveAttribute(
      "src",
      /^\/public\/store-programs\//,
    );
  });

  test("authenticated admin can upload store product image via presigned flow", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupPublicStoreScenario(request, {
      linkSupabaseAuthAdmin: true,
      withPublishedProduct: false,
    });
    test.skip(
      !response.ok() || json?.data?.adminSupabaseLinked !== true,
      "seed or Supabase admin link unavailable",
    );

    const { admin, school } = json!.data!;
    await loginSchoolAdmin(page, admin.email, admin.password);
    const token = await waitForSupabaseToken(page);

    const imageUrl = await runPresignedUpload(
      request,
      bearerAuthHeaders(token),
      "storeProducts",
      merchFixturePath,
      school.id,
    );
    expect(imageUrl).toMatch(/^\/public\/store-products\//);
  });

  test("guest adds merch to cart from public store", async ({ page, request }) => {
    const { response, json } = await postSetupPublicStoreScenario(request, {
      productImageUrl: "/uploads/store-products/e2e-cart.png",
    });
    test.skip(!response.ok(), `seed failed (${response.status()})`);

    const slug = json!.data!.storeSlug;
    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByTestId("store-cart-button")).toContainText("Cart (1)");
    await page.getByTestId("store-cart-button").click();
    await expect(page).toHaveURL(new RegExp(`/store/${slug}/checkout`));
  });

  test("guest sees add-to-cart feedback and can edit merch quantity in checkout", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupPublicStoreScenario(request, {
      productImageUrl: "/uploads/store-products/e2e-cart-qty.png",
    });
    test.skip(!response.ok(), `seed failed (${response.status()})`);

    const slug = json!.data!.storeSlug;
    const priceCents = json!.data!.product.priceCents;

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByText("Added to cart", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("store-cart-button")).toContainText("Cart (1)");
    await expect(page.getByTestId("store-cart-button")).toContainText("$19.99");

    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByTestId("store-cart-button")).toContainText("Cart (2)");

    await page.getByTestId("store-cart-button").click();
    await expect(page.getByTestId("store-cart-review")).toBeVisible();

    const line = page.locator('[data-testid^="store-cart-line-"]').first();
    const lineTestId = await line.getAttribute("data-testid");
    const lineId = lineTestId!.replace("store-cart-line-", "");

    await page.getByTestId(`store-cart-qty-increase-${lineId}`).click();
    await expect(page.getByTestId(`store-cart-qty-${lineId}`)).toHaveText("3");
    await expect(page.getByTestId("store-cart-subtotal")).toHaveText(
      `$${((priceCents * 3) / 100).toFixed(2)}`,
    );

    await page.getByTestId(`store-cart-qty-decrease-${lineId}`).click();
    await page.getByTestId(`store-cart-qty-decrease-${lineId}`).click();
    await page.getByTestId(`store-cart-qty-decrease-${lineId}`).click();
    await expect(page.getByText("Your cart is empty.")).toBeVisible();
  });

  test("guest can remove a program line from checkout cart", async ({ page, request }) => {
    const { addStoreProgramToCartAsGuest, openStoreCheckoutFromCart } = await import(
      "./helpers/publicStoreCheckout"
    );

    const { response, json } = await postSetupPublicStoreScenario(request, {
      withPublishedProduct: false,
      withClass: true,
      withPublishedClassListing: true,
      classPriceCents: 5000,
    });
    test.skip(!response.ok(), `seed failed (${response.status()})`);

    const slug = json!.data!.storeSlug;

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await addStoreProgramToCartAsGuest(page, /Add — \$50\.00/);
    await openStoreCheckoutFromCart(page);
    await expect(page.getByTestId("store-cart-review")).toBeVisible();

    const line = page.locator('[data-testid^="store-cart-line-"]').first();
    const lineTestId = await line.getAttribute("data-testid");
    const lineId = lineTestId!.replace("store-cart-line-", "");

    await page.getByTestId(`store-cart-remove-${lineId}`).click();
    await expect(page.getByText("Your cart is empty.")).toBeVisible();
  });
});

test.describe("public store programs", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async ({ request }) => {
    const { response, json } = await postEnsurePublicStoreSchema(request);
    test.skip(
      !response.ok(),
      `public store schema ensure failed (${response.status()}): ${json?.error ?? "unknown"}`,
    );
  });

  test("GET catalog returns imageUrl for published class", async ({ request }) => {
    const classImage = "/uploads/store-programs/e2e-class-catalog.png";
    const { response, json } = await postSetupPublicStoreScenario(request, {
      withPublishedProduct: false,
      withClass: true,
      withPublishedClassListing: true,
      classCoverImage: classImage,
      classPriceCents: 8900,
    });
    test.skip(!response.ok(), `seed failed (${response.status()}): ${json?.error ?? json?.details}`);

    const catalogRes = await request.get(
      `/api/public/store/${json!.data!.storeSlug}/catalog`,
    );
    expect(catalogRes.ok()).toBeTruthy();
    const catalog = (await catalogRes.json()) as {
      items: { listingType: string; title: string; imageUrl?: string; priceCents?: number }[];
    };
    const cls = catalog.items.find((i) => i.listingType === "class");
    expect(cls?.imageUrl).toBe(classImage);
    expect(cls?.priceCents).toBe(8900);
  });

  test("guest sees published class with cropped image on storefront", async ({ page, request }) => {
    const classImage = "/uploads/store-programs/e2e-class-guest.png";
    const { response, json } = await postSetupPublicStoreScenario(request, {
      withPublishedProduct: false,
      withClass: true,
      withPublishedClassListing: true,
      classCoverImage: classImage,
    });
    test.skip(!response.ok(), `seed failed (${response.status()})`);

    const slug = json!.data!.storeSlug;
    const classTitle = json!.data!.class!.title;

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(classTitle)).toBeVisible();
    const img = page.getByTestId("store-class-image").first();
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("src", classImage);
    await expect(img).toHaveClass(/object-cover/);
  });

  test("admin lists class on store from Classes & programs tab", async ({ page, request }) => {
    const { response, json } = await postSetupPublicStoreScenario(request, {
      linkSupabaseAuthAdmin: true,
      withPublishedProduct: false,
      withClass: true,
      withPublishedClassListing: false,
    });
    test.skip(
      !response.ok() || json?.data?.adminSupabaseLinked !== true,
      "seed or Supabase admin link unavailable",
    );

    const { admin, storeSlug, class: seededClass } = json!.data!;
    expect(seededClass?.listingPublished).toBe(false);

    await loginSchoolAdmin(page, admin.email, admin.password);
    await page.evaluate(() => localStorage.setItem("activeRole", "schoolAdmin"));
    await page.goto("/school-admin/public-store?tab=programs", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("store-tab-programs")).toBeVisible();
    await expect(page.getByText(seededClass!.title)).toBeVisible();

    const publishSwitch = page.getByTestId(
      `store-program-publish-class-${seededClass!.id}`,
    );
    await expect(publishSwitch).toBeEnabled({ timeout: 30_000 });
    await publishSwitch.click();

    await expect.poll(async () => {
      const catalogRes = await request.get(`/api/public/store/${storeSlug}/catalog`);
      if (!catalogRes.ok()) return false;
      const catalog = (await catalogRes.json()) as {
        items: { listingType: string; sourceId: number }[];
      };
      return catalog.items.some(
        (i) => i.listingType === "class" && i.sourceId === seededClass!.id,
      );
    }).toBeTruthy();
  });

  test("admin uploads program image and saves cover on class", async ({ page, request }) => {
    const { response, json } = await postSetupPublicStoreScenario(request, {
      linkSupabaseAuthAdmin: true,
      withPublishedProduct: false,
      withClass: true,
      withPublishedClassListing: true,
    });
    test.skip(
      !response.ok() || json?.data?.adminSupabaseLinked !== true,
      "seed or Supabase admin link unavailable",
    );

    const { admin, storeSlug, class: seededClass, school } = json!.data!;
    await loginSchoolAdmin(page, admin.email, admin.password);
    await page.evaluate(() => localStorage.setItem("activeRole", "schoolAdmin"));
    const token = await waitForSupabaseToken(page);
    const authHeaders = {
      ...bearerAuthHeaders(token),
      "X-Active-Role": "schoolAdmin",
    };

    const imageUrl = await runPresignedUpload(
      request,
      authHeaders,
      "storePrograms",
      merchFixturePath,
      school.id,
    );
    expect(imageUrl).toMatch(/^\/public\/store-programs\//);

    const patchRes = await request.patch(
      `/api/school-admin/public-store/programs/class/${seededClass!.id}`,
      {
        headers: { ...authHeaders, "Content-Type": "application/json" },
        data: { coverImage: imageUrl },
      },
    );
    expect(patchRes.ok()).toBeTruthy();

    const catalogRes = await request.get(`/api/public/store/${storeSlug}/catalog`);
    const catalog = (await catalogRes.json()) as {
      items: { listingType: string; sourceId: number; imageUrl?: string }[];
    };
    const row = catalog.items.find(
      (i) => i.listingType === "class" && i.sourceId === seededClass!.id,
    );
    expect(row?.imageUrl).toBe(imageUrl);

    await page.goto(`/store/${storeSlug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("store-class-image").first()).toHaveAttribute(
      "src",
      imageUrl,
    );
  });

  test("guest checkout and payment completes for published class", async ({ page, request }) => {
    const {
      addStoreProgramToCartAsGuest,
      completeStoreGuestCheckout,
      installStoreCheckoutFulfillInterceptor,
      openStoreCheckoutFromCart,
    } = await import("./helpers/publicStoreCheckout");

    const unique = Date.now();
    const guestEmail = `store_guest_${unique}@test.com`;
    const { response, json } = await postSetupPublicStoreScenario(request, {
      withPublishedProduct: false,
      withClass: true,
      withPublishedClassListing: true,
      classPriceCents: 5000,
    });
    test.skip(!response.ok(), `seed failed (${response.status()}): ${json?.error ?? json?.details}`);

    const slug = json!.data!.storeSlug;
    const classTitle = json!.data!.class!.title;

    await installStoreCheckoutFulfillInterceptor(page, request, slug);

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(classTitle)).toBeVisible();
    await addStoreProgramToCartAsGuest(page, /Add — \$50\.00/);
    await openStoreCheckoutFromCart(page);
    await expect(page).toHaveURL(new RegExp(`/store/${slug}/checkout`));

    await completeStoreGuestCheckout(page, {
      firstName: "Guest",
      lastName: "Parent",
      email: guestEmail,
      phone: "5555550100",
    }, {
      firstName: "Camp",
      lastName: "Kid",
      birthdate: "2015-06-01",
      gradeLevel: "4th Grade",
    });

    await page.getByTestId("store-checkout-submit").click();
    await page.waitForURL(new RegExp(`/store/${slug}/success`), { timeout: 60_000 });
    await expect(page.getByTestId("store-success-order")).toBeVisible();
    await expect(page.getByText(guestEmail)).toBeVisible();
    await expect(page.getByTestId("store-success-total")).toBeVisible();

    const orderRes = await request.get(
      `/api/public/store/${slug}/order/${new URL(page.url()).searchParams.get("token")}`,
    );
    expect(orderRes.ok()).toBeTruthy();
    const orderJson = (await orderRes.json()) as {
      order: { status: string; orderNumber: string };
      lines: { title: string; child?: { firstName: string } | null }[];
    };
    expect(orderJson.order.status).toBe("paid");
    expect(orderJson.order.orderNumber).toMatch(/^\d{8}-\d{5}$/);
    expect(orderJson.lines.some((l) => l.child?.firstName === "Camp")).toBeTruthy();
  });

  test("login from checkout returns to checkout with cart items preserved", async ({
    page,
    request,
  }) => {
    const {
      addStoreProgramToCartAsGuest,
      expectStoreCartLineCount,
      loginFromStoreCheckoutAndReturn,
      openStoreCheckoutFromCart,
    } = await import("./helpers/publicStoreCheckout");

    const { response, json } = await postSetupPublicStoreScenario(request, {
      withPublishedProduct: false,
      withClass: true,
      withPublishedClassListing: true,
      classPriceCents: 5000,
    });
    test.skip(!response.ok(), `seed failed (${response.status()})`);

    const cartSeed = await postSetupCartScenario(request, { linkSupabaseAuth: true });
    test.skip(
      !cartSeed.response.ok() || cartSeed.json?.data?.supabaseLinked !== true,
      "parent Supabase link unavailable",
    );

    const slug = json!.data!.storeSlug;
    const checkoutPath = `/store/${slug}/checkout`;
    const parent = cartSeed.json!.data!.parent;

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await addStoreProgramToCartAsGuest(page, /Add — \$50\.00/);
    await openStoreCheckoutFromCart(page);
    await expect(page).toHaveURL(new RegExp(checkoutPath.replace(/\//g, "\\/")));

    await loginFromStoreCheckoutAndReturn(
      page,
      checkoutPath,
      parent.email,
      parent.password,
    );
    await expectStoreCartLineCount(page, 1);
    await expect(page.getByTestId("store-cart-review")).toBeVisible();
  });
});
