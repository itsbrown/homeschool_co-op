import { describe, expect, it } from "@jest/globals";
import {
  isAmazonStoreUrl,
  storeProductCta,
  storeProductIsCartPurchasable,
} from "../store-product-cta";

describe("storeProductCta", () => {
  it("uses Add to cart when there is no outbound URL", () => {
    expect(storeProductCta({ affiliateUrl: null })).toEqual({ kind: "cart" });
    expect(storeProductCta({ affiliateUrl: "  " })).toEqual({ kind: "cart" });
    expect(storeProductIsCartPurchasable(null)).toBe(true);
  });

  it("labels Amazon hosts and short links as Buy on Amazon", () => {
    const amazon = storeProductCta({
      affiliateUrl: "https://www.amazon.com/dp/B08STORE01?tag=asa-20",
    });
    expect(amazon.kind).toBe("amazon");
    if (amazon.kind !== "amazon") return;
    expect(amazon.label).toBe("Buy on Amazon");
    expect(amazon.rel).toBe("noopener noreferrer sponsored");
    expect(isAmazonStoreUrl("https://amzn.to/abc123")).toBe(true);
    expect(isAmazonStoreUrl("https://a.co/d/xyz")).toBe(true);
    expect(storeProductIsCartPurchasable("https://www.amazon.com/dp/B08STORE01")).toBe(false);
  });

  it("labels other vendor URLs as View product", () => {
    const cta = storeProductCta({
      affiliateUrl: "https://accessliteracy.com/orthography-notebook",
    });
    expect(cta.kind).toBe("external");
    if (cta.kind !== "external") return;
    expect(cta.label).toBe("View product");
    expect(cta.rel).toBe("noopener noreferrer");
    expect(cta.rel).not.toMatch(/sponsored/);
    expect(storeProductIsCartPurchasable("https://accessliteracy.com/x")).toBe(false);
  });
});
