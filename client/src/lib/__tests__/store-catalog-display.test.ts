import {
  formatStoreListingPrice,
  groupStoreCatalogItems,
  storeListingTypeLabel,
} from "@/lib/store-catalog-display";
import type { StoreCatalogItem } from "@/lib/store-catalog";

describe("store catalog display", () => {
  const baseItem: StoreCatalogItem = {
    listingId: 1,
    listingType: "class",
    sourceId: 1,
    title: "Art Studio",
    slug: "art-studio",
    membersOnly: false,
    priceCents: 5000,
  };

  it("formatStoreListingPrice formats class and session prices", () => {
    expect(formatStoreListingPrice(baseItem)).toBe("$50.00");
    expect(
      formatStoreListingPrice({
        ...baseItem,
        listingType: "session",
        priceCents: undefined,
        halfDayPrice: 4000,
        fullDayPrice: 7000,
      }),
    ).toBe("Half $40.00 · Full $70.00");
  });

  it("groupStoreCatalogItems splits programs and shop", () => {
    const product: StoreCatalogItem = {
      ...baseItem,
      listingId: 2,
      listingType: "product",
      slug: "t-shirt",
      priceCents: 2500,
    };
    const sections = groupStoreCatalogItems([baseItem, product]);
    expect(sections).toHaveLength(2);
    expect(sections[0].id).toBe("programs");
    expect(sections[1].id).toBe("shop");
    expect(sections[1].items).toHaveLength(1);
  });

  it("storeListingTypeLabel uses the outbound URL host, not productKind alone", () => {
    expect(
      storeListingTypeLabel(
        "product",
        "affiliate",
        "https://www.amazon.com/dp/B08STORE01",
      ),
    ).toBe("Amazon");
    expect(
      storeListingTypeLabel(
        "product",
        "affiliate",
        "https://accessliteracy.com/notebook",
      ),
    ).toBe("Merch");
    expect(storeListingTypeLabel("product", "owned")).toBe("Merch");
  });
});
