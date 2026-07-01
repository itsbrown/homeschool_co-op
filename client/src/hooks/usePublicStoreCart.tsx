import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  loadStoreCart,
  saveStoreCart,
  addProductLine,
  addProgramLine,
  cartLineCount,
  cartSubtotalCents,
  formatStoreCartMoney,
  type StoreCartState,
} from "@/lib/store-cart";
import type { StoreCatalogItem } from "@/lib/store-catalog";

export function usePublicStoreCart(schoolSlug: string) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [cart, setCart] = useState<StoreCartState>(() => loadStoreCart(schoolSlug));
  const [cartPulse, setCartPulse] = useState(false);

  useEffect(() => {
    saveStoreCart(cart);
  }, [cart]);

  const cartCount = cartLineCount(cart);
  const cartTotal = cartSubtotalCents(cart);

  const notifyAdded = (title: string, nextCart: StoreCartState) => {
    setCartPulse(true);
    window.setTimeout(() => setCartPulse(false), 600);
    toast({
      title: "Added to cart",
      description: `${title} · ${formatStoreCartMoney(cartSubtotalCents(nextCart))} total`,
      action: (
        <ToastAction altText="View cart" onClick={() => setLocation(`/store/${schoolSlug}/checkout`)}>
          View cart
        </ToastAction>
      ),
    });
  };

  const addProduct = (item: StoreCatalogItem) => {
    const next = addProductLine(cart, {
      listingId: item.listingId,
      listingType: "product",
      sourceId: item.sourceId,
      title: item.title,
      unitPriceCents: item.priceCents,
    });
    setCart(next);
    notifyAdded(item.title, next);
  };

  const addProgram = (item: StoreCatalogItem, variant: "half_day" | "full_day") => {
    const price =
      variant === "half_day" ? item.halfDayPrice ?? 0 : item.fullDayPrice ?? item.priceCents ?? 0;
    const displayTitle = `${item.title}${
      item.listingType === "session"
        ? variant === "half_day"
          ? " — Half Day"
          : " — Full Day"
        : ""
    }`;
    const next = addProgramLine(cart, {
      listingId: item.listingId,
      listingType: item.listingType as "session" | "class",
      sourceId: item.sourceId,
      title: displayTitle,
      variant,
      unitPriceCents: price,
    });
    setCart(next);
    notifyAdded(displayTitle, next);
  };

  const onAddProgram = (item: StoreCatalogItem, variant: "half_day" | "full_day") => {
    addProgram(item, variant);
  };

  return {
    cart,
    cartCount,
    cartTotal,
    cartPulse,
    addProduct,
    onAddProgram,
    goToCheckout: () => setLocation(`/store/${schoolSlug}/checkout`),
  };
}
