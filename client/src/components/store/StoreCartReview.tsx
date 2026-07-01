import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatStoreCartMoney,
  cartSubtotalCents,
  removeCartLine,
  updateCartLineQuantity,
  type StoreCartState,
} from "@/lib/store-cart";

type StoreCartReviewProps = {
  cart: StoreCartState;
  onCartChange: (cart: StoreCartState) => void;
  showSubtotal?: boolean;
};

export function StoreCartReview({ cart, onCartChange, showSubtotal = true }: StoreCartReviewProps) {
  const subtotal = cartSubtotalCents(cart);

  const setQuantity = (lineId: string, quantity: number) => {
    onCartChange(updateCartLineQuantity(cart, lineId, quantity));
  };

  const removeLine = (lineId: string) => {
    onCartChange(removeCartLine(cart, lineId));
  };

  if (cart.lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4" data-testid="store-cart-empty">
        Your cart is empty.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="store-cart-review">
      <ul className="divide-y rounded-lg border bg-white">
        {cart.lines.map((line) => {
          const lineTotal = (line.unitPriceCents ?? 0) * Math.max(1, line.quantity);
          const isProduct = line.listingType === "product";

          return (
            <li
              key={line.lineId}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              data-testid={`store-cart-line-${line.lineId}`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm leading-snug">{line.title}</p>
                {line.unitPriceCents != null && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatStoreCartMoney(line.unitPriceCents)} each
                  </p>
                )}
                {!isProduct && (
                  <p className="text-xs text-muted-foreground mt-1">
                    One child per enrollment — add again from the store for another child.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {isProduct ? (
                  <div
                    className="flex items-center rounded-md border"
                    role="group"
                    aria-label={`Quantity for ${line.title}`}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-none"
                      aria-label="Decrease quantity"
                      data-testid={`store-cart-qty-decrease-${line.lineId}`}
                      onClick={() => setQuantity(line.lineId, line.quantity - 1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span
                      className="w-10 text-center text-sm font-medium tabular-nums"
                      data-testid={`store-cart-qty-${line.lineId}`}
                    >
                      {line.quantity}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-none"
                      aria-label="Increase quantity"
                      data-testid={`store-cart-qty-increase-${line.lineId}`}
                      onClick={() => setQuantity(line.lineId, line.quantity + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground w-10 text-center">× 1</span>
                )}

                <span className="w-20 text-right text-sm font-medium tabular-nums">
                  {line.unitPriceCents != null ? formatStoreCartMoney(lineTotal) : "—"}
                </span>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${line.title}`}
                  data-testid={`store-cart-remove-${line.lineId}`}
                  onClick={() => removeLine(line.lineId)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {showSubtotal && (
        <div className="flex justify-between items-center pt-1 text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-semibold tabular-nums" data-testid="store-cart-subtotal">
            {formatStoreCartMoney(subtotal)}
          </span>
        </div>
      )}
    </div>
  );
}
