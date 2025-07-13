import React from 'react';
import { useCart } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, ShoppingCart, CreditCard, Percent, Gift, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

export default function CartDrawer() {
  const { cart, isOpen, closeCart, removeItem, clearCart, getItemCount } = useCart();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const handleCheckout = () => {
    if (cart.items.length === 0) {
      toast({
        title: "No unpaid enrollments",
        description: "All your enrollments are paid or you haven't enrolled in any classes yet",
        variant: "destructive",
      });
      return;
    }

    closeCart();
    setLocation('/cart/checkout');
  };

  const getUniqueChildrenCount = () => {
    const uniqueChildren = new Set(cart.items.map(item => item.childId));
    return uniqueChildren.size;
  };

  const hasDiscounts = cart.discounts.siblingDiscount > 0 || cart.discounts.freeAfterThree > 0;

  return (
    <Sheet open={isOpen} onOpenChange={closeCart}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Shopping Cart ({getItemCount()})
          </SheetTitle>
          <SheetDescription>
            Review your class enrollments before checkout
          </SheetDescription>
        </SheetHeader>

        {cart.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
          <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No unpaid enrollments</h3>
          <p className="text-muted-foreground mb-4">
            All your enrollments are paid or you haven't enrolled in any classes yet
          </p>
          <Button onClick={() => {
            closeCart();
            setLocation('/programs');
          }}>
            Browse Classes
          </Button>
        </div>
        ) : (
          <div className="flex flex-col h-full">
            <ScrollArea className="flex-1 mt-6">
              <div className="space-y-4">
                {cart.items.map((item) => (
                  <Card key={item.id} className="relative">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium">{item.className}</h4>
                    <p className="text-sm text-muted-foreground">{item.childName}</p>
                    {item.status && (
                      <p className="text-xs text-orange-600 font-medium">
                        {item.status === 'pending_payment' ? 'Payment Required' : item.status}
                      </p>
                    )}
                    {item.amountPaid > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Paid: {formatCurrency(item.amountPaid || 0)}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatCurrency(item.price)}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.remainingBalance ? 'Balance Due' : 'Total Due'}
                    </p>
                  </div>
                </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {item.schedule && (
                        <p className="text-xs text-muted-foreground mb-2">
                          {item.schedule}
                        </p>
                      )}
                      {item.startDate && item.endDate && (
                        <p className="text-xs text-muted-foreground mb-2">
                          {new Date(item.startDate).toLocaleDateString()} - {new Date(item.endDate).toLocaleDateString()}
                        </p>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">
                          {formatCurrency(item.price)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            {/* Cart Summary */}
            <div className="border-t pt-4 mt-4 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(cart.subtotal)}</span>
                </div>

                {hasDiscounts && (
                  <>
                    {cart.discounts.siblingDiscount > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span className="flex items-center gap-1">
                          <Percent className="h-3 w-3" />
                          Sibling Discount (10%):
                        </span>
                        <span>-{formatCurrency(cart.discounts.siblingDiscount)}</span>
                      </div>
                    )}

                    {cart.discounts.freeAfterThree > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span className="flex items-center gap-1">
                          <Gift className="h-3 w-3" />
                          Free After Three:
                        </span>
                        <span>-{formatCurrency(cart.discounts.freeAfterThree)}</span>
                      </div>
                    )}
                  </>
                )}

                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Total:</span>
                  <span>{formatCurrency(cart.total)}</span>
                </div>
              </div>

              {/* Discount Info */}
              {getUniqueChildrenCount() > 1 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs text-green-700">
                    <strong>Great!</strong> You're getting a 10% sibling discount for enrolling multiple children.
                  </p>
                  {getUniqueChildrenCount() >= 3 && (
                    <p className="text-xs text-green-700 mt-1">
                      <strong>Bonus:</strong> Your 4th child and beyond are free with our "Free After Three" policy!
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={clearCart}
                  className="flex-1"
                  disabled={cart.items.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
                <Button
                  onClick={handleCheckout}
                  className="flex-1"
                  disabled={cart.items.length === 0}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Checkout
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}