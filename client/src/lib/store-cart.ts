export const STORE_CART_KEY = 'public_store_cart_v1';

export type StoreCartLine = {
  lineId: string;
  listingId: number;
  listingType: 'product' | 'session' | 'class';
  sourceId: number;
  title: string;
  quantity: number;
  variant?: 'half_day' | 'full_day';
  unitPriceCents?: number;
};

export type StoreCartState = {
  storeSlug: string;
  lines: StoreCartLine[];
};

export function loadStoreCart(storeSlug: string): StoreCartState {
  try {
    const raw = sessionStorage.getItem(STORE_CART_KEY);
    if (!raw) return { storeSlug, lines: [] };
    const parsed = JSON.parse(raw) as StoreCartState;
    if (parsed.storeSlug !== storeSlug) return { storeSlug, lines: [] };
    return parsed;
  } catch {
    return { storeSlug, lines: [] };
  }
}

export function saveStoreCart(cart: StoreCartState) {
  sessionStorage.setItem(STORE_CART_KEY, JSON.stringify(cart));
}

export function newLineId() {
  return `line_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
