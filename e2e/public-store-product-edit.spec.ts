import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";
import {
  postEnsurePublicStoreSchema,
  postSetupPublicStoreScenario,
} from "./helpers/testSeed";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const merchFixturePath = path.join(__dirname, "fixtures", "merch-sample.png");

type CatalogItem = {
  listingId: number;
  title: string;
  priceCents?: number;
  imageUrl?: string | null;
  productKind?: string;
};

async function fetchCatalog(request: APIRequestContext, slug: string) {
  const catalog = await request.get(`/api/public/store/${slug}/catalog`);
  expect(catalog.ok(), "catalog request failed").toBeTruthy();
  return (await catalog.json()) as { items: CatalogItem[] };
}

test.describe.configure({ mode: "serial" });

test.describe("public store product edit", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async ({ request }) => {
    const { response, json } = await postEnsurePublicStoreSchema(request);
    test.skip(
      !response.ok(),
      `public store schema ensure failed (${response.status()}): ${json?.error ?? "unknown"}`,
    );
  });

  test("admin edits merch fields, photo, and hide/publish", async ({ page, request }) => {
    const { response, json } = await postSetupPublicStoreScenario(request, {
      withPublishedProduct: true,
      linkSupabaseAuthAdmin: true,
    });
    expect(response.ok(), json?.error ?? json?.details ?? "seed failed").toBeTruthy();
    test.skip(
      !json?.data?.adminSupabaseLinked,
      "Supabase admin link required for Products tab UI",
    );

    const admin = json!.data!.admin;
    const slug = json!.data!.storeSlug;
    const product = json!.data!.product;
    const listingId = json!.data!.listing.id;
    const newName = `Edited Merch ${Date.now()}`;
    const newPrice = "12.50";

    await loginSchoolAdmin(page, admin.email, admin.password);
    await page.evaluate(() => localStorage.setItem("activeRole", "schoolAdmin"));
    await page.goto("/school-admin/public-store?tab=products", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId(`button-edit-product-${product.id}`)).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId(`button-edit-product-${product.id}`).click();
    const dialog = page.getByTestId("edit-product-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("input-edit-product-name")).toHaveValue(product.name);
    await expect(page.getByTestId("switch-edit-product-published")).toBeChecked();
    await page.getByTestId("switch-edit-product-published").click();
    await expect(page.getByTestId("switch-edit-product-published")).not.toBeChecked();

    await page.getByTestId("input-edit-product-name").fill(newName);
    await page.getByTestId("input-edit-product-description").fill("Updated merch description");
    await page.getByTestId("input-edit-product-price").fill(newPrice);

    const uploadResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/unified-uploads/request-url") &&
        r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await dialog.getByTestId("image-upload-input").setInputFiles(merchFixturePath);
    const uploadRes = await uploadResponse;
    expect(uploadRes.ok(), `upload request-url failed: ${uploadRes.status()}`).toBeTruthy();
    await expect(page.getByText("Image uploaded", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId("button-save-product").click();
    await expect(page.getByText("Product updated", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog).toBeHidden();

    const card = page.getByTestId(`store-admin-product-${product.id}`);
    await expect(card).toContainText(newName);
    await expect(card).toContainText("$12.50");
    await expect(page.getByTestId(`product-hidden-badge-${product.id}`)).toBeVisible();

    const hiddenCatalog = await fetchCatalog(request, slug);
    expect(hiddenCatalog.items.some((item) => item.listingId === listingId)).toBeFalsy();

    await page.getByTestId(`button-edit-product-${product.id}`).click();
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("input-edit-product-name")).toHaveValue(newName);
    await expect(page.getByTestId("switch-edit-product-published")).not.toBeChecked();
    await page.getByTestId("switch-edit-product-published").click();
    await expect(page.getByTestId("switch-edit-product-published")).toBeChecked();
    await page.getByTestId("button-save-product").click();
    await expect(page.getByText("Product updated", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId(`product-published-badge-${product.id}`)).toBeVisible();

    const publishedCatalog = await fetchCatalog(request, slug);
    const listed = publishedCatalog.items.find((item) => item.listingId === listingId);
    expect(listed).toBeTruthy();
    expect(listed!.title).toBe(newName);
    expect(listed!.priceCents).toBe(1250);
    expect(listed!.imageUrl).toMatch(/^\/public\/store-products\//);
  });

  test("admin edits affiliate display price and photo", async ({ page, request }) => {
    const affiliateUrl = "https://www.amazon.com/dp/B08EDIT001?tag=asa-e2e-20";
    const { response, json } = await postSetupPublicStoreScenario(request, {
      withPublishedProduct: true,
      withAffiliateProduct: true,
      affiliateUrl,
      affiliateAsin: "B08EDIT001",
      affiliateName: "E2E Affiliate Edit Candle",
      affiliatePriceCents: 2599,
      linkSupabaseAuthAdmin: true,
    });
    expect(response.ok(), json?.error ?? json?.details ?? "seed failed").toBeTruthy();
    test.skip(
      !json?.data?.adminSupabaseLinked,
      "Supabase admin link required for Products tab UI",
    );

    const admin = json!.data!.admin;
    const slug = json!.data!.storeSlug;
    const affiliate = json!.data!.affiliateProduct!;
    const listingId = json!.data!.affiliateListing!.id;

    await loginSchoolAdmin(page, admin.email, admin.password);
    await page.evaluate(() => localStorage.setItem("activeRole", "schoolAdmin"));
    await page.goto("/school-admin/public-store?tab=products", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId(`button-edit-product-${affiliate.id}`)).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId(`button-edit-product-${affiliate.id}`).click();
    const dialog = page.getByTestId("edit-product-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("input-edit-product-name")).toHaveValue(affiliate.name);
    await expect(dialog.getByText(/Display price is a snapshot/i)).toBeVisible();

    await page.getByTestId("input-edit-product-price").fill("18.75");

    const uploadResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/unified-uploads/request-url") &&
        r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await dialog.getByTestId("image-upload-input").setInputFiles(merchFixturePath);
    const uploadRes = await uploadResponse;
    expect(uploadRes.ok(), `upload request-url failed: ${uploadRes.status()}`).toBeTruthy();
    await expect(page.getByText("Image uploaded", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId("button-save-product").click();
    await expect(page.getByText("Product updated", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    const card = page.getByTestId(`store-admin-product-${affiliate.id}`);
    await expect(card).toContainText("$18.75");
    await expect(page.getByTestId(`product-published-badge-${affiliate.id}`)).toBeVisible();

    const catalog = await fetchCatalog(request, slug);
    const listed = catalog.items.find((item) => item.listingId === listingId);
    expect(listed).toBeTruthy();
    expect(listed!.productKind).toBe("affiliate");
    expect(listed!.priceCents).toBe(1875);
    expect(listed!.imageUrl).toMatch(/^\/public\/store-products\//);

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId(`store-buy-amazon-${listingId}`)).toBeVisible();
    await expect(page.getByTestId(`store-add-product-${listingId}`)).toHaveCount(0);
  });
});
