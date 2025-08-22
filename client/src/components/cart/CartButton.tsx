import React from 'react';
import { useCart } from "@/contexts/CartContext";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart } from 'lucide-react';

export default function CartButton() {
  const { getItemCount, openCart, loadUnpaidEnrollments, cart } = useCart();

  const handleOpenCart = async () => {
    console.log('🛒 CartButton clicked - manually loading enrollments...');
    await loadUnpaidEnrollments();
    openCart();
  };

  // Use cart.items.length directly to ensure reactivity to cart state changes
  const itemCount = cart.items.length;
  
  console.log('🛒 CartButton render - itemCount:', itemCount, 'cart items:', cart.items.length);
  console.log('🛒 CartButton render - cart state:', cart);

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