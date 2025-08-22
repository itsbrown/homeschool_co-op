import React from 'react';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/contexts/CartContext';

export default function CartButton() {
  const { openCart, cart } = useCart();

  // Get item count directly from cart.items to ensure reactivity
  const itemCount = cart.items.length;
  console.log('🛒 CartButton rendering - itemCount:', itemCount, 'cart items:', cart.items);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="relative"
      onClick={openCart}
    >
      <ShoppingCart className="h-5 w-5" />
      {itemCount > 0 && (
        <Badge 
          variant="destructive" 
          className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs font-bold"
        >
          {itemCount}
        </Badge>
      )}
    </Button>
  );
}