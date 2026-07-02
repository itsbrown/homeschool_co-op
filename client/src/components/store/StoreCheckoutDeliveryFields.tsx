import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { StoreProductDelivery, StoreShippingAddress } from "@/lib/store-checkout";

type StoreCheckoutDeliveryFieldsProps = {
  delivery: StoreProductDelivery;
  onChange: (value: StoreProductDelivery) => void;
};

export function StoreCheckoutDeliveryFields({
  delivery,
  onChange,
}: StoreCheckoutDeliveryFieldsProps) {
  const setMethod = (method: StoreProductDelivery["method"]) => {
    onChange({
      method,
      shippingAddress:
        method === "shipping"
          ? delivery.shippingAddress ?? {
              line1: "",
              line2: "",
              city: "",
              state: "",
              postalCode: "",
            }
          : undefined,
    });
  };

  const setAddress = (patch: Partial<StoreShippingAddress>) => {
    onChange({
      ...delivery,
      shippingAddress: {
        line1: delivery.shippingAddress?.line1 ?? "",
        line2: delivery.shippingAddress?.line2 ?? "",
        city: delivery.shippingAddress?.city ?? "",
        state: delivery.shippingAddress?.state ?? "",
        postalCode: delivery.shippingAddress?.postalCode ?? "",
        ...patch,
      },
    });
  };

  return (
    <div className="space-y-4" data-testid="store-checkout-delivery">
      <div>
        <h3 className="font-medium">Product delivery</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Choose how you would like to receive merchandise from this order.
        </p>
      </div>

      <RadioGroup
        value={delivery.method}
        onValueChange={(value) => setMethod(value as StoreProductDelivery["method"])}
        className="space-y-3"
      >
        <div className="flex items-start gap-3 rounded-lg border p-3">
          <RadioGroupItem value="pickup" id="store-delivery-pickup" data-testid="store-delivery-pickup" />
          <Label htmlFor="store-delivery-pickup" className="font-normal leading-snug cursor-pointer">
            <span className="font-medium text-foreground">Pick up at campus</span>
            <span className="block text-sm text-muted-foreground mt-0.5">
              We will email pickup details after your order is confirmed.
            </span>
          </Label>
        </div>
        <div className="flex items-start gap-3 rounded-lg border p-3">
          <RadioGroupItem value="shipping" id="store-delivery-shipping" data-testid="store-delivery-shipping" />
          <Label htmlFor="store-delivery-shipping" className="font-normal leading-snug cursor-pointer">
            <span className="font-medium text-foreground">Ship to me</span>
            <span className="block text-sm text-muted-foreground mt-0.5">
              Enter the address where we should send your items.
            </span>
          </Label>
        </div>
      </RadioGroup>

      {delivery.method === "shipping" && (
        <div className="space-y-3 pt-1">
          <div>
            <Label htmlFor="store-shipping-line1">Street address</Label>
            <Input
              id="store-shipping-line1"
              value={delivery.shippingAddress?.line1 ?? ""}
              onChange={(e) => setAddress({ line1: e.target.value })}
              autoComplete="shipping address-line1"
              data-testid="store-shipping-line1"
            />
          </div>
          <div>
            <Label htmlFor="store-shipping-line2">Apartment, suite, etc. (optional)</Label>
            <Input
              id="store-shipping-line2"
              value={delivery.shippingAddress?.line2 ?? ""}
              onChange={(e) => setAddress({ line2: e.target.value })}
              autoComplete="shipping address-line2"
              data-testid="store-shipping-line2"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <Label htmlFor="store-shipping-city">City</Label>
              <Input
                id="store-shipping-city"
                value={delivery.shippingAddress?.city ?? ""}
                onChange={(e) => setAddress({ city: e.target.value })}
                autoComplete="shipping address-level2"
                data-testid="store-shipping-city"
              />
            </div>
            <div>
              <Label htmlFor="store-shipping-state">State</Label>
              <Input
                id="store-shipping-state"
                value={delivery.shippingAddress?.state ?? ""}
                onChange={(e) => setAddress({ state: e.target.value.toUpperCase().slice(0, 2) })}
                autoComplete="shipping address-level1"
                maxLength={2}
                placeholder="NY"
                data-testid="store-shipping-state"
              />
            </div>
            <div>
              <Label htmlFor="store-shipping-postal">ZIP code</Label>
              <Input
                id="store-shipping-postal"
                value={delivery.shippingAddress?.postalCode ?? ""}
                onChange={(e) => setAddress({ postalCode: e.target.value })}
                autoComplete="shipping postal-code"
                inputMode="numeric"
                data-testid="store-shipping-postal"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
