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

export function clearStoreCart() {
  sessionStorage.removeItem(STORE_CART_KEY);
}

export function newLineId() {
  return `line_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function cartLineCount(cart: StoreCartState): number {
  return cart.lines.reduce((sum, line) => sum + Math.max(1, line.quantity), 0);
}

export function cartSubtotalCents(cart: StoreCartState): number {
  return cart.lines.reduce(
    (sum, line) => sum + (line.unitPriceCents ?? 0) * Math.max(1, line.quantity),
    0,
  );
}

export function formatStoreCartMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function programLineKey(line: Pick<StoreCartLine, 'listingId' | 'listingType' | 'sourceId' | 'variant'>) {
  return `${line.listingType}:${line.listingId}:${line.sourceId}:${line.variant ?? 'default'}`;
}

export function findMatchingCartLine(
  cart: StoreCartState,
  candidate: Pick<StoreCartLine, 'listingId' | 'listingType' | 'sourceId' | 'variant'>,
): StoreCartLine | undefined {
  if (candidate.listingType === 'product') {
    return cart.lines.find(
      (l) =>
        l.listingType === 'product' &&
        l.listingId === candidate.listingId &&
        l.sourceId === candidate.sourceId,
    );
  }
  const key = programLineKey(candidate);
  return cart.lines.find((l) => programLineKey(l) === key);
}

export function addProductLine(
  cart: StoreCartState,
  line: Omit<StoreCartLine, 'lineId' | 'quantity'> & { quantity?: number },
): StoreCartState {
  const existing = findMatchingCartLine(cart, line);
  if (existing) {
    return {
      ...cart,
      lines: cart.lines.map((l) =>
        l.lineId === existing.lineId
          ? { ...l, quantity: l.quantity + (line.quantity ?? 1) }
          : l,
      ),
    };
  }
  return {
    ...cart,
    lines: [
      ...cart.lines,
      {
        ...line,
        lineId: newLineId(),
        quantity: line.quantity ?? 1,
      },
    ],
  };
}

export function addProgramLine(
  cart: StoreCartState,
  line: Omit<StoreCartLine, 'lineId' | 'quantity'>,
): StoreCartState {
  return {
    ...cart,
    lines: [...cart.lines, { ...line, lineId: newLineId(), quantity: 1 }],
  };
}

export function updateCartLineQuantity(
  cart: StoreCartState,
  lineId: string,
  quantity: number,
): StoreCartState {
  if (quantity <= 0) {
    return removeCartLine(cart, lineId);
  }
  const line = cart.lines.find((l) => l.lineId === lineId);
  if (!line) return cart;
  if (line.listingType !== 'product') {
    return cart;
  }
  return {
    ...cart,
    lines: cart.lines.map((l) => (l.lineId === lineId ? { ...l, quantity } : l)),
  };
}

export function removeCartLine(cart: StoreCartState, lineId: string): StoreCartState {
  return {
    ...cart,
    lines: cart.lines.filter((l) => l.lineId !== lineId),
  };
}
