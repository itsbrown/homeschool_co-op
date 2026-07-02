import {
  buildStoreCheckoutSteps,
  isProductDeliveryComplete,
} from "@/lib/store-checkout";

describe("store checkout delivery", () => {
  it("buildStoreCheckoutSteps adds delivery for product carts", () => {
    expect(buildStoreCheckoutSteps({ hasProducts: true, hasPrograms: false })).toEqual([
      "cart",
      "contact",
      "delivery",
      "payment",
    ]);
    expect(buildStoreCheckoutSteps({ hasProducts: true, hasPrograms: true })).toEqual([
      "cart",
      "contact",
      "delivery",
      "children",
      "payment",
    ]);
  });

  it("isProductDeliveryComplete validates shipping address", () => {
    expect(isProductDeliveryComplete({ method: "pickup" })).toBe(true);
    expect(
      isProductDeliveryComplete({
        method: "shipping",
        shippingAddress: {
          line1: "1 Campus Rd",
          line2: "",
          city: "Albany",
          state: "NY",
          postalCode: "12203",
        },
      }),
    ).toBe(true);
    expect(isProductDeliveryComplete({ method: "shipping" })).toBe(false);
  });
});
