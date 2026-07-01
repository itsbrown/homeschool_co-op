import {
  addProductLine,
  addProgramLine,
  cartLineCount,
  cartSubtotalCents,
  formatStoreCartMoney,
  removeCartLine,
  updateCartLineQuantity,
  type StoreCartState,
} from '../store-cart';

const emptyCart = (slug = 'demo'): StoreCartState => ({ storeSlug: slug, lines: [] });

const productLine = {
  lineId: 'line_a',
  listingId: 10,
  listingType: 'product' as const,
  sourceId: 5,
  title: 'T-Shirt',
  quantity: 1,
  unitPriceCents: 1999,
};

describe('store-cart helpers', () => {
  describe('cartLineCount', () => {
    it('sums product quantities', () => {
      const cart = {
        ...emptyCart(),
        lines: [
          { ...productLine, quantity: 2 },
          { ...productLine, lineId: 'line_b', listingId: 11, sourceId: 6, quantity: 1 },
        ],
      };
      expect(cartLineCount(cart)).toBe(3);
    });
  });

  describe('cartSubtotalCents', () => {
    it('multiplies unit price by quantity', () => {
      const cart = {
        ...emptyCart(),
        lines: [{ ...productLine, quantity: 3 }],
      };
      expect(cartSubtotalCents(cart)).toBe(5997);
    });
  });

  describe('formatStoreCartMoney', () => {
    it('formats cents as USD', () => {
      expect(formatStoreCartMoney(1999)).toBe('$19.99');
    });
  });

  describe('addProductLine', () => {
    it('merges quantity when the same product is added again', () => {
      const cart = { ...emptyCart(), lines: [productLine] };
      const next = addProductLine(cart, {
        listingId: 10,
        listingType: 'product',
        sourceId: 5,
        title: 'T-Shirt',
        unitPriceCents: 1999,
      });
      expect(next.lines).toHaveLength(1);
      expect(next.lines[0].quantity).toBe(2);
    });

    it('appends a new line for a different product', () => {
      const cart = { ...emptyCart(), lines: [productLine] };
      const next = addProductLine(cart, {
        listingId: 11,
        listingType: 'product',
        sourceId: 6,
        title: 'Hat',
        unitPriceCents: 1200,
      });
      expect(next.lines).toHaveLength(2);
    });
  });

  describe('addProgramLine', () => {
    it('always adds a separate enrollment line', () => {
      const cart = addProgramLine(emptyCart(), {
        listingId: 20,
        listingType: 'class',
        sourceId: 99,
        title: 'Trail Trekkers',
        unitPriceCents: 37500,
        variant: 'full_day',
      });
      const next = addProgramLine(cart, {
        listingId: 20,
        listingType: 'class',
        sourceId: 99,
        title: 'Trail Trekkers',
        unitPriceCents: 37500,
        variant: 'full_day',
      });
      expect(next.lines).toHaveLength(2);
      expect(next.lines.every((l) => l.quantity === 1)).toBe(true);
    });
  });

  describe('updateCartLineQuantity', () => {
    it('updates product quantity', () => {
      const cart = { ...emptyCart(), lines: [productLine] };
      const next = updateCartLineQuantity(cart, 'line_a', 4);
      expect(next.lines[0].quantity).toBe(4);
    });

    it('removes the line when quantity is zero', () => {
      const cart = { ...emptyCart(), lines: [productLine] };
      const next = updateCartLineQuantity(cart, 'line_a', 0);
      expect(next.lines).toHaveLength(0);
    });

    it('ignores quantity changes for program lines', () => {
      const cart = {
        ...emptyCart(),
        lines: [
          {
            ...productLine,
            lineId: 'prog_1',
            listingType: 'class' as const,
            quantity: 1,
          },
        ],
      };
      const next = updateCartLineQuantity(cart, 'prog_1', 5);
      expect(next.lines[0].quantity).toBe(1);
    });
  });

  describe('removeCartLine', () => {
    it('drops the matching line', () => {
      const cart = {
        ...emptyCart(),
        lines: [productLine, { ...productLine, lineId: 'line_b', listingId: 11 }],
      };
      const next = removeCartLine(cart, 'line_a');
      expect(next.lines).toHaveLength(1);
      expect(next.lines[0].lineId).toBe('line_b');
    });
  });
});
