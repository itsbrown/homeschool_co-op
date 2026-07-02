import {
  buildStoreItemSharePayload,
  buildStoreItemShareUrl,
  buildStoreItemSocialShareLinks,
  truncateStoreShareText,
} from "@/lib/store-item-share";
import type { StoreCatalogItem } from "@/lib/store-catalog";

const sampleItem: StoreCatalogItem = {
  listingId: 1,
  listingType: "product",
  sourceId: 10,
  title: "America 250 Commemorative Candle",
  slug: "america-250-candle",
  description: "Celebrate America's 250th anniversary with this beautiful commemorative candle!",
  priceCents: 2500,
  membersOnly: false,
  inStock: true,
};

describe("store item share", () => {
  it("buildStoreItemShareUrl adds userId for logged-in sharers", () => {
    expect(buildStoreItemShareUrl(sampleItem, "american-seekers-academy", 42)).toBe(
      "/store/american-seekers-academy/america-250-candle?userId=42",
    );
  });

  it("buildStoreItemShareUrl omits userId for guests", () => {
    expect(buildStoreItemShareUrl(sampleItem, "american-seekers-academy", null)).toBe(
      "/store/american-seekers-academy/america-250-candle",
    );
  });

  it("buildStoreItemSharePayload includes title, price, description, and url", () => {
    const payload = buildStoreItemSharePayload(sampleItem, "american-seekers-academy", {
      sharerUserId: 7,
      origin: "https://example.com",
    });
    expect(payload.title).toBe(sampleItem.title);
    expect(payload.url).toBe(
      "https://example.com/store/american-seekers-academy/america-250-candle?userId=7",
    );
    expect(payload.text).toContain("America 250 Commemorative Candle");
    expect(payload.text).toContain("$25.00");
    expect(payload.text).toContain("250th anniversary");
    expect(payload.text).toContain(payload.url);
  });

  it("truncateStoreShareText shortens long descriptions", () => {
    const long = "a".repeat(300);
    expect(truncateStoreShareText(long).length).toBe(280);
    expect(truncateStoreShareText(long).endsWith("…")).toBe(true);
  });

  it("buildStoreItemSocialShareLinks builds platform URLs", () => {
    const payload = buildStoreItemSharePayload(sampleItem, "american-seekers-academy", {
      origin: "https://example.com",
    });
    const links = buildStoreItemSocialShareLinks(payload);
    expect(links.facebook).toContain("facebook.com/sharer");
    expect(links.twitter).toContain("twitter.com/intent/tweet");
    expect(links.linkedin).toContain("linkedin.com/sharing");
    expect(links.email).toMatch(/^mailto:/);
  });
});
