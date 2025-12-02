import React from 'react';
import { useCart } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, ShoppingCart, CreditCard, Percent, Gift, X, Clock, AlertCircle, Award } from 'lucide-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/utils/currency';

export default function CartDrawer() {
  const { cart, isOpen, closeCart, removeItem, clearCart, getItemCount } = useCart();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleCheckout = (e: React.MouseEvent) => {
    console.log('🛒 🚨 CHECKOUT BUTTON CLICKED - EVENT RECEIVED!');
    
    e.preventDefault();
    e.stopPropagation();
    
    console.log('🛒 Cart items length:', cart.items.length, 'membership:', cart.membership);
    
    // Allow checkout if there are items OR membership
    if (cart.items.length === 0 && !cart.membership) {
      console.log('🛒 No items or membership in cart, showing toast');
      toast({
        title: "Cart is empty",
        description: "Add classes or membership to your cart before checking out",
        variant: "destructive",
      });
      return;
    }

    console.log('🛒 Navigating to checkout...');
    closeCart();
    setLocation('/cart/checkout');
    console.log('🛒 Navigation completed');
  };

  const getUniqueChildrenCount = () => {
    const uniqueChildren = new Set(cart.items.map(item => item.childId));
    return uniqueChildren.size;
  };

  const hasDiscounts = cart.discounts.siblingDiscount > 0 || 
                     cart.discounts.freeAfterThree > 0 || 
                     (cart.discounts.appliedDiscounts && cart.discounts.appliedDiscounts.length > 0);

  return (
    <Sheet open={isOpen} onOpenChange={closeCart}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col h-[100dvh] min-h-0 p-0">
        <div className="px-6 pt-6 pb-4 flex-shrink-0">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Shopping Cart ({getItemCount()})
            </SheetTitle>
            <SheetDescription>
              Review your class enrollments before checkout
            </SheetDescription>
          </SheetHeader>
        </div>

        {cart.items.length === 0 && !cart.membership ? (
          <div className="flex flex-col items-center justify-center py-8 px-6 text-center">
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
          <>
            {/* Payment Required Notice */}
            <div className="px-6 pb-3 flex-shrink-0">
              <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30" data-testid="alert-cart-payment-notice">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-300 text-sm">
                  <strong>Payment is required to save your seat.</strong> Spots are limited and not guaranteed until payment is complete.
                </AlertDescription>
              </Alert>
            </div>
            
            <div className="flex-1 overflow-y-auto px-6 min-h-0">
              <div className="space-y-4 pb-4">
                {cart.items.map((item) => {
                  const isDiscounted = cart.discounts.discountedChildIds?.includes(item.childId);
                  const isFree = cart.discounts.freeItemIds?.includes(item.id);
                  return (
                  <Card key={item.id} className="relative">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium">{item.className}</h4>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-muted-foreground">{item.childName}</p>
                      {isFree && (
                        <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200" data-testid={`badge-free-${item.id}`}>
                          <Gift className="h-2.5 w-2.5 mr-1" />
                          FREE
                        </Badge>
                      )}
                      {isDiscounted && !isFree && (
                        <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-200">
                          <Percent className="h-2.5 w-2.5 mr-1" />
                          Sibling Discount
                        </Badge>
                      )}
                    </div>
                    {(item.statusText || item.status) && (
                      <p className="text-xs text-orange-600 font-medium">
                        {item.statusText || (item.status === 'pending_payment' ? 'Payment Required' : item.status)}
                      </p>
                    )}
                    {(item.amountPaid || 0) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Paid: {formatCurrency(item.amountPaid || 0)}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {isFree ? (
                      <p className="font-medium text-emerald-600" data-testid={`price-free-${item.id}`}>FREE</p>
                    ) : (
                      <p className="font-medium">{formatCurrency(item.price)}</p>
                    )}
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
                      {!isFree && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">
                            {formatCurrency(item.price)}
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
                })}
                
                {/* Membership Fee Card */}
                {cart.membership && (
                  <Card className="relative border-primary/20 bg-primary/5" data-testid="card-membership-fee">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium flex items-center gap-2">
                            <Award className="h-4 w-4 text-primary" />
                            Annual Membership
                          </h4>
                          <p className="text-sm text-muted-foreground">{cart.membership.schoolName}</p>
                          <Badge variant="secondary" className="text-xs bg-primary/10 text-primary mt-1">
                            {cart.membership.year} Membership
                          </Badge>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatCurrency(cart.membership.amount)}</p>
                          <p className="text-xs text-muted-foreground">Annual Fee</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground">
                        Required for enrollment. Generates your Member ID.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* Cart Summary - Fixed Footer */}
            <div 
              className="border-t pt-4 space-y-4 flex-shrink-0 bg-white px-6 pb-8" 
              style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
            >
              <div className="space-y-2">
                {cart.items.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Class Enrollments:</span>
                    <span>{formatCurrency(cart.subtotal)}</span>
                  </div>
                )}

                {cart.membership && (
                  <div className="flex justify-between text-sm" data-testid="summary-membership-fee">
                    <span className="flex items-center gap-1">
                      <Award className="h-3 w-3 text-primary" />
                      Membership Fee:
                    </span>
                    <span>{formatCurrency(cart.membership.amount)}</span>
                  </div>
                )}

                {hasDiscounts && (
                  <>
                    {cart.discounts.siblingDiscount > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span className="flex items-center gap-1">
                          <Percent className="h-3 w-3" />
                          Sibling Discount {cart.schoolSettings?.siblingDiscountRate ? `(${Math.round(cart.schoolSettings.siblingDiscountRate * 100)}%)` : ''}:
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

                    {cart.discounts.appliedDiscounts && cart.discounts.appliedDiscounts.map((discount) => (
                      <div key={discount.id} className="flex justify-between text-sm text-blue-600">
                        <span className="flex items-center gap-1">
                          <Gift className="h-3 w-3" />
                          {discount.name}:
                        </span>
                        <span>-{formatCurrency(discount.discountAmount)}</span>
                      </div>
                    ))}
                  </>
                )}

                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Total:</span>
                  <span>{formatCurrency(cart.total + (cart.membership?.amount || 0))}</span>
                </div>
              </div>

              {/* Discount Info */}
              {getUniqueChildrenCount() > 1 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3" data-testid="section-discount-info">
                  {cart.schoolSettings?.freeAfterThresholdEnabled && 
                   getUniqueChildrenCount() > cart.schoolSettings.freeAfterThreshold ? (
                    <p className="text-xs text-green-700" data-testid="text-free-after-active">
                      <strong>Amazing!</strong> You have {getUniqueChildrenCount()} children enrolled. 
                      Your {getUniqueChildrenCount() - cart.schoolSettings.freeAfterThreshold} cheapest 
                      enrollment{getUniqueChildrenCount() - cart.schoolSettings.freeAfterThreshold > 1 ? 's are' : ' is'} FREE!
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-green-700" data-testid="text-sibling-discount-active">
                        <strong>Great!</strong> You're getting a {cart.schoolSettings?.siblingDiscountRate ? `${cart.schoolSettings.siblingDiscountRate}%` : '10%'} sibling discount for enrolling multiple children.
                      </p>
                      {cart.schoolSettings?.freeAfterThresholdEnabled && 
                       getUniqueChildrenCount() >= cart.schoolSettings.freeAfterThreshold && (
                        <p className="text-xs text-green-700 mt-1" data-testid="text-free-after-coming">
                          <strong>Bonus:</strong> Enroll {cart.schoolSettings.freeAfterThreshold + 1 - getUniqueChildrenCount()} more 
                          child{cart.schoolSettings.freeAfterThreshold + 1 - getUniqueChildrenCount() > 1 ? 'ren' : ''} to get your cheapest classes free!
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => clearCart()}
                  className="flex-1"
                  disabled={cart.items.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
                <Button
                  type="button"
                  onClick={handleCheckout}
                  className="flex-1 relative z-50"
                  disabled={cart.items.length === 0}
                  style={{ pointerEvents: 'auto' }}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Checkout
                </Button>
              </div>
              
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}