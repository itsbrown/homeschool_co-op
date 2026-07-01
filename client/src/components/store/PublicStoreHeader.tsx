import { Link } from "wouter";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatStoreCartMoney } from "@/lib/store-cart";

type PublicStoreHeaderProps = {
  storeName?: string;
  storeDescription?: string | null;
  cartCount: number;
  cartTotal: number;
  cartPulse?: boolean;
  isAuthenticated: boolean;
  onCheckout: () => void;
};

export function PublicStoreHeader({
  storeName,
  storeDescription,
  cartCount,
  cartTotal,
  cartPulse,
  isAuthenticated,
  onCheckout,
}: PublicStoreHeaderProps) {
  return (
    <header className="border-b bg-white sticky top-0 z-10">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <div className="min-w-0 pr-4">
          <h1 className="text-2xl font-semibold truncate">{storeName ?? "Store"}</h1>
          {storeDescription && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{storeDescription}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isAuthenticated ? (
            <Button variant="outline" asChild className="hidden sm:inline-flex">
              <Link href={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}>
                Sign in
              </Link>
            </Button>
          ) : null}
          <Button
            onClick={onCheckout}
            className={cartPulse ? "animate-pulse ring-2 ring-primary ring-offset-2" : undefined}
            data-testid="store-cart-button"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Cart ({cartCount})
            {cartTotal > 0 && (
              <span className="ml-1 opacity-90">· {formatStoreCartMoney(cartTotal)}</span>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
