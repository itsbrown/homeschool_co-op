import { describe, expect, it } from "@jest/globals";
import { supplyListProductAction, type HouseholdSupplyProduct } from "../parent-supply-list";

const amazon: HouseholdSupplyProduct = {
  id: 1,
  name: "Water bottle",
  productKind: "affiliate",
  affiliateUrl: "https://www.amazon.com/dp/B08WATER01?tag=asa-20",
  listingSlug: "water-bottle",
  purchasableInCart: false,
};

const vendor: HouseholdSupplyProduct = {
  id: 2,
  name: "Orthography notebook",
  productKind: "affiliate",
  affiliateUrl: "https://accessliteracy.com/notebook",
  listingSlug: "orthography-notebook",
  purchasableInCart: false,
};

const merch: HouseholdSupplyProduct = {
  id: 3,
  name: "T-shirt",
  productKind: "owned",
  affiliateUrl: null,
  listingSlug: "t-shirt",
  purchasableInCart: false,
};

describe("supplyListProductAction", () => {
  it("uses Buy on Amazon for Amazon URLs", () => {
    const action = supplyListProductAction(amazon, "asa");
    expect(action?.kind).toBe("outbound");
    if (action?.kind !== "outbound") return;
    expect(action.cta.kind).toBe("amazon");
  });

  it("uses View product for non-Amazon URLs even when productKind is affiliate", () => {
    const action = supplyListProductAction(vendor, "asa");
    expect(action?.kind).toBe("outbound");
    if (action?.kind !== "outbound") return;
    expect(action.cta.kind).toBe("external");
    expect(action.cta.label).toBe("View product");
  });

  it("uses View in shop for owned merch without an outbound URL", () => {
    const action = supplyListProductAction(merch, "asa");
    expect(action).toEqual({
      kind: "shop",
      productId: 3,
      href: "/store/asa/t-shirt",
    });
  });
});
