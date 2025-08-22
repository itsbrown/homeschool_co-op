import React from 'react';
import { useCart } from "@/contexts/CartContext";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart } from 'lucide-react';

export default function CartButton() {
  const { getItemCount, openCart, loadUnpaidEnrollments, cart } = useCart();

  const handleOpenCart = async () => {
    await loadUnpaidEnrollments();
    openCart();
  };

  const itemCount = getItemCount();
  
  console.log('🛒 CartButton render - itemCount:', itemCount, 'cart items:', cart.items.length);

  return (
    <Button
      variant="outline"
      size="icon"
      className="relative"
      onClick={handleOpenCart}
    >
      <ShoppingCart className="h-4 w-4" />
      {itemCount > 0 && (
        <Badge 
          variant="destructive" 
          className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
        >
          {itemCount}
        </Badge>
      )}
    </Button>
  );
}