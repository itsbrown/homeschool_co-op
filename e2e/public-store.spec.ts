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
} from "./helpers/testSeed";

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

  test("POST /api/school-admin/public-store/upload/product-image requires auth", async ({
    request,
  }) => {
    const res = await request.post("/api/school-admin/public-store/upload/product-image", {
      multipart: {
        image: {
          name: "merch-sample.png",
          mimeType: "image/png",
          buffer: await import("node:fs").then((fs) =>
            fs.promises.readFile(merchFixturePath),
          ),
        },
      },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/authorization/i);
  });

  test("POST /api/school-admin/public-store/upload/program-image requires auth", async ({
    request,
  }) => {
    const res = await request.post("/api/school-admin/public-store/upload/program-image", {
      multipart: {
        image: {
          name: "merch-sample.png",
          mimeType: "image/png",
          buffer: await import("node:fs").then((fs) =>
            fs.promises.readFile(merchFixturePath),
          ),
        },
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

    const { admin, storeSlug } = json!.data!;
    const uniqueName = `E2E Upload Hoodie ${Date.now()}`;

    await loginSchoolAdmin(page, admin.email, admin.password);
    await page.evaluate(() => localStorage.setItem("activeRole", "schoolAdmin"));
    const token = await waitForSupabaseToken(page);
    const authHeaders = {
      ...bearerAuthHeaders(token),
      "X-Active-Role": "schoolAdmin",
    };

    const uploadRes = await request.post(
      "/api/school-admin/public-store/upload/product-image",
      {
        headers: authHeaders,
        multipart: {
          image: {
            name: "merch-sample.png",
            mimeType: "image/png",
            buffer: await import("node:fs").then((fs) =>
              fs.promises.readFile(merchFixturePath),
            ),
          },
        },
      },
    );
    expect(uploadRes.ok(), `upload failed: ${uploadRes.status()}`).toBeTruthy();
    const uploadJson = (await uploadRes.json()) as { success: boolean; imageUrl: string };
    expect(uploadJson.imageUrl).toMatch(/^\/uploads\/store-products\//);

    const createRes = await request.post("/api/school-admin/public-store/products", {
      headers: { ...authHeaders, "Content-Type": "application/json" },
      data: {
        name: uniqueName,
        description: "E2E merch with photo",
        priceCents: 2499,
        imageUrl: uploadJson.imageUrl,
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
    await expect(img).toHaveAttribute("src", uploadJson.imageUrl);
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

  test("authenticated admin can upload via API with bearer token", async ({
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

    const { admin } = json!.data!;
    await loginSchoolAdmin(page, admin.email, admin.password);
    const token = await waitForSupabaseToken(page);

    const uploadRes = await request.post(
      "/api/school-admin/public-store/upload/product-image",
      {
        headers: bearerAuthHeaders(token),
        multipart: {
          image: {
            name: "merch-sample.png",
            mimeType: "image/png",
            buffer: await import("node:fs").then((fs) =>
              fs.promises.readFile(merchFixturePath),
            ),
          },
        },
      },
    );
    expect(uploadRes.ok(), `upload failed: ${uploadRes.status()}`).toBeTruthy();
    const body = (await uploadRes.json()) as { success: boolean; imageUrl: string };
    expect(body.imageUrl).toMatch(/^\/uploads\/store-products\//);
  });

  test("guest adds merch to cart from public store", async ({ page, request }) => {
    const { response, json } = await postSetupPublicStoreScenario(request, {
      productImageUrl: "/uploads/store-products/e2e-cart.png",
    });
    test.skip(!response.ok(), `seed failed (${response.status()})`);

    const slug = json!.data!.storeSlug;
    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByRole("button", { name: /Cart \(1\)/ })).toBeVisible();
    await page.getByRole("button", { name: /Cart \(1\)/ }).click();
    await expect(page).toHaveURL(new RegExp(`/store/${slug}/checkout`));
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

    const { admin, storeSlug, class: seededClass } = json!.data!;
    await loginSchoolAdmin(page, admin.email, admin.password);
    await page.evaluate(() => localStorage.setItem("activeRole", "schoolAdmin"));
    const token = await waitForSupabaseToken(page);
    const authHeaders = {
      ...bearerAuthHeaders(token),
      "X-Active-Role": "schoolAdmin",
    };

    const uploadRes = await request.post(
      "/api/school-admin/public-store/upload/program-image",
      {
        headers: authHeaders,
        multipart: {
          image: {
            name: "merch-sample.png",
            mimeType: "image/png",
            buffer: await import("node:fs").then((fs) =>
              fs.promises.readFile(merchFixturePath),
            ),
          },
        },
      },
    );
    expect(uploadRes.ok(), `program upload failed: ${uploadRes.status()}`).toBeTruthy();
    const uploadJson = (await uploadRes.json()) as { imageUrl: string };
    expect(uploadJson.imageUrl).toMatch(/^\/uploads\/store-programs\//);

    const patchRes = await request.patch(
      `/api/school-admin/public-store/programs/class/${seededClass!.id}`,
      {
        headers: { ...authHeaders, "Content-Type": "application/json" },
        data: { coverImage: uploadJson.imageUrl },
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
    expect(row?.imageUrl).toBe(uploadJson.imageUrl);

    await page.goto(`/store/${storeSlug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("store-class-image").first()).toHaveAttribute(
      "src",
      uploadJson.imageUrl,
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
      gradeLevel: "4",
    });

    await page.getByTestId("store-checkout-submit").click();
    await page.waitForURL(new RegExp(`/store/${slug}/success`), { timeout: 60_000 });
    await expect(page.getByTestId("store-success-order")).toBeVisible();
    await expect(page.getByText(guestEmail)).toBeVisible();

    const orderRes = await request.get(
      `/api/public/store/${slug}/order/${new URL(page.url()).searchParams.get("token")}`,
    );
    expect(orderRes.ok()).toBeTruthy();
    const orderJson = (await orderRes.json()) as { order: { status: string } };
    expect(orderJson.order.status).toBe("paid");
  });
});
