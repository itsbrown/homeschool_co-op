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
