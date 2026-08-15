import { test, expect } from "@playwright/test";
import { loginSchoolAdmin } from "./helpers/schoolAdminAuth";
import {
  postEnsurePublicStoreSchema,
  postSetupPublicStoreScenario,
} from "./helpers/testSeed";

const FIXTURE_AFFILIATE_URL =
  "https://www.amazon.com/dp/B08ADMIN01?tag=asa-admin-20";

test.describe.configure({ mode: "serial" });

test.describe("public store amazon affiliate", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async ({ request }) => {
    const { response, json } = await postEnsurePublicStoreSchema(request);
    test.skip(
      !response.ok(),
      `public store schema ensure failed (${response.status()}): ${json?.error ?? "unknown"}`,
    );
  });

  test("seeded affiliate shows Buy on Amazon and never Add to cart", async ({
    page,
    request,
  }) => {
    const affiliateUrl = "https://www.amazon.com/dp/B08STORE01?tag=asa-e2e-20";
    const { response, json } = await postSetupPublicStoreScenario(request, {
      withAffiliateProduct: true,
      affiliateUrl,
      affiliateAsin: "B08STORE01",
      affiliateName: "E2E Affiliate Candle",
      affiliatePriceCents: 2599,
      productImageUrl: "/uploads/store-products/e2e-owned.png",
    });
    expect(response.ok(), json?.error ?? json?.details ?? "seed failed").toBeTruthy();
    const slug = json!.data!.storeSlug;
    const affiliateListingId = json!.data!.affiliateListing!.id;
    const ownedListingId = json!.data!.listing.id;

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("E2E Affiliate Candle")).toBeVisible();

    const buyBtn = page.getByTestId(`store-buy-amazon-${affiliateListingId}`);
    await expect(buyBtn).toBeVisible();
    await expect(buyBtn).toHaveAttribute("href", affiliateUrl);
    await expect(buyBtn).toHaveAttribute("rel", /sponsored/);
    await expect(
      page.getByTestId(`store-add-product-${affiliateListingId}`),
    ).toHaveCount(0);

    await page.getByTestId(`store-item-link-${affiliateListingId}`).click();
    await expect(page.getByTestId("store-item-title")).toHaveText("E2E Affiliate Candle");
    await expect(page.getByTestId(`store-buy-amazon-${affiliateListingId}`)).toBeVisible();
    await expect(page.getByText(/Sold on Amazon/i)).toBeVisible();
    await expect(
      page.getByTestId(`store-add-product-${affiliateListingId}`),
    ).toHaveCount(0);

    // Owned merch still addable
    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId(`store-add-product-${ownedListingId}`)).toBeVisible();
  });

  test("snapshot rejects affiliate listingId", async ({ request }) => {
    const { response, json } = await postSetupPublicStoreScenario(request, {
      withAffiliateProduct: true,
      affiliateAsin: "B08SNAP001",
      affiliateUrl: "https://www.amazon.com/dp/B08SNAP001?tag=asa-e2e-20",
    });
    expect(response.ok(), json?.error ?? "seed failed").toBeTruthy();
    const slug = json!.data!.storeSlug;
    const listingId = json!.data!.affiliateListing!.id;
    const sourceId = json!.data!.affiliateProduct!.id;

    const snap = await request.post(`/api/public/store/${slug}/snapshot`, {
      data: {
        cart: [
          {
            lineId: "line_aff_1",
            listingId,
            listingType: "product",
            sourceId,
            quantity: 1,
          },
        ],
      },
    });
    expect(snap.status()).toBe(400);
    const body = await snap.json();
    expect(body.code).toBe("AFFILIATE_NOT_PURCHASABLE");
  });

  test("admin fetch + create affiliate product via Products tab", async ({
    page,
    request,
  }) => {
    const { response, json } = await postSetupPublicStoreScenario(request, {
      withPublishedProduct: true,
      linkSupabaseAuthAdmin: true,
    });
    expect(response.ok(), json?.error ?? "seed failed").toBeTruthy();
    test.skip(
      !json?.data?.adminSupabaseLinked,
      "Supabase admin link required for Products tab UI",
    );

    const admin = json!.data!.admin;
    const slug = json!.data!.storeSlug;

    await loginSchoolAdmin(page, admin.email, admin.password);

    await page.goto("/school-admin/public-store?tab=products", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("input-affiliate-url")).toBeVisible();
    await page.getByTestId("input-affiliate-url").fill(FIXTURE_AFFILIATE_URL);
    await page.getByTestId("button-fetch-affiliate").click();
    await expect(page.getByTestId("affiliate-preview-fields")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("input-affiliate-name")).not.toHaveValue("");
    await page.getByTestId("button-create-affiliate-product").click();
    await expect(page.getByText("Affiliate product listed on store", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Amazon product B08ADMIN01/i).first()).toBeVisible();

    const catalog = await request.get(`/api/public/store/${slug}/catalog`);
    expect(catalog.ok()).toBeTruthy();
    const catalogJson = (await catalog.json()) as {
      items: Array<{
        listingId: number;
        productKind?: string;
        affiliateUrl?: string | null;
        title: string;
      }>;
    };
    const affiliate = catalogJson.items.find(
      (i) => i.productKind === "affiliate" && i.title.includes("B08ADMIN01"),
    );
    expect(affiliate).toBeTruthy();
    expect(affiliate!.affiliateUrl).toBe(FIXTURE_AFFILIATE_URL);

    await page.goto(`/store/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId(`store-buy-amazon-${affiliate!.listingId}`),
    ).toBeVisible();
  });
});
