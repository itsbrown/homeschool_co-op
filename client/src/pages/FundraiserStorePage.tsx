import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ShoppingCart, 
  Plus, 
  Minus, 
  Calendar,
  Loader2,
  Check,
  Package
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface StoreProduct {
  id: number;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
}

interface StoreCampaign {
  id: number;
  name: string;
  description: string | null;
  endDate: string;
}

interface StoreSeller {
  name: string;
  familyLinkId: number;
}

interface StoreData {
  campaign: StoreCampaign;
  seller: StoreSeller;
  products: StoreProduct[];
}

interface CartItem {
  productId: number;
  name: string;
  priceCents: number;
  quantity: number;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface FundraiserStorePageProps {
  campaignId: string;
  familySlug: string;
}

export default function FundraiserStorePage({ campaignId, familySlug }: FundraiserStorePageProps) {
  const { toast } = useToast();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
  });

  const { data: storeData, isLoading, error } = useQuery<StoreData>({
    queryKey: ['/api/fundraisers/store', campaignId, familySlug],
    retry: false,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (data: { 
      campaignId: number;
      familyLinkId: number;
      customer: typeof checkoutForm;
      items: CartItem[];
    }) => {
      return apiRequest('POST', '/api/fundraisers/checkout', data);
    },
    onSuccess: async (response) => {
      const data = await response.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error: any) => {
      toast({ 
        title: 'Checkout failed', 
        description: error.message || 'Please try again',
        variant: 'destructive' 
      });
    },
  });

  function addToCart(product: StoreProduct) {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        productId: product.id,
        name: product.name,
        priceCents: product.priceCents,
        quantity: 1,
      }];
    });
  }

  function removeFromCart(productId: number) {
    setCart(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing && existing.quantity > 1) {
        return prev.map(item => 
          item.productId === productId 
            ? { ...item, quantity: item.quantity - 1 }
            : item
        );
      }
      return prev.filter(item => item.productId !== productId);
    });
  }

  function getCartQuantity(productId: number): number {
    return cart.find(item => item.productId === productId)?.quantity || 0;
  }

  const cartTotal = cart.reduce((sum, item) => sum + (item.priceCents * item.quantity), 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function handleCheckout() {
    if (!storeData) return;
    
    if (!checkoutForm.customerName || !checkoutForm.customerEmail) {
      toast({ 
        title: 'Please fill in your information', 
        description: 'Name and email are required',
        variant: 'destructive' 
      });
      return;
    }
    
    checkoutMutation.mutate({
      campaignId: parseInt(campaignId),
      familyLinkId: storeData.seller.familyLinkId,
      customer: checkoutForm,
      items: cart,
    });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !storeData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Fundraiser Not Found</CardTitle>
            <CardDescription>
              This fundraiser link may have expired or doesn't exist.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { campaign, seller, products } = storeData;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-center" data-testid="campaign-name">{campaign.name}</h1>
          {campaign.description && (
            <p className="text-center text-muted-foreground mt-2">{campaign.description}</p>
          )}
          <div className="flex justify-center items-center gap-4 mt-4">
            <Badge variant="outline" className="text-sm">
              <Calendar className="h-4 w-4 mr-1" />
              Ends {format(new Date(campaign.endDate), 'MMM d, yyyy')}
            </Badge>
            <Badge className="text-sm bg-green-100 text-green-800 border-green-200">
              Supporting: {seller.name}
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h2 className="text-xl font-semibold mb-4">Products</h2>
            {products.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No products available yet</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {products.map((product) => {
                  const quantity = getCartQuantity(product.id);
                  return (
                    <Card key={product.id} data-testid={`product-card-${product.id}`}>
                      {product.imageUrl && (
                        <div className="aspect-video bg-gray-100 rounded-t-lg overflow-hidden">
                          <img 
                            src={product.imageUrl} 
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <CardHeader>
                        <CardTitle className="text-lg">{product.name}</CardTitle>
                        {product.description && (
                          <CardDescription>{product.description}</CardDescription>
                        )}
                      </CardHeader>
                      <CardFooter className="flex justify-between items-center">
                        <span className="text-xl font-bold" data-testid={`product-price-${product.id}`}>
                          {formatCents(product.priceCents)}
                        </span>
                        {quantity === 0 ? (
                          <Button onClick={() => addToCart(product)} data-testid={`button-add-${product.id}`}>
                            <Plus className="h-4 w-4 mr-1" />
                            Add to Cart
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="outline" 
                              size="icon"
                              onClick={() => removeFromCart(product.id)}
                              data-testid={`button-remove-${product.id}`}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-medium" data-testid={`quantity-${product.id}`}>
                              {quantity}
                            </span>
                            <Button 
                              variant="outline" 
                              size="icon"
                              onClick={() => addToCart(product)}
                              data-testid={`button-increase-${product.id}`}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Your Cart
                  {cartItemCount > 0 && (
                    <Badge variant="secondary">{cartItemCount}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cart.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Your cart is empty</p>
                ) : (
                  <>
                    <div className="space-y-3">
                      {cart.map((item) => (
                        <div key={item.productId} className="flex justify-between items-center" data-testid={`cart-item-${item.productId}`}>
                          <div>
                            <p className="font-medium text-sm">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCents(item.priceCents)} x {item.quantity}
                            </p>
                          </div>
                          <span className="font-medium">
                            {formatCents(item.priceCents * item.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <Separator className="my-4" />
                    <div className="flex justify-between items-center font-bold text-lg">
                      <span>Total</span>
                      <span data-testid="cart-total">{formatCents(cartTotal)}</span>
                    </div>

                    {!isCheckingOut ? (
                      <Button 
                        className="w-full mt-4" 
                        onClick={() => setIsCheckingOut(true)}
                        data-testid="button-checkout"
                      >
                        Proceed to Checkout
                      </Button>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <Separator />
                        <h3 className="font-medium">Your Information</h3>
                        <div>
                          <Label htmlFor="customer-name">Name *</Label>
                          <Input
                            id="customer-name"
                            value={checkoutForm.customerName}
                            onChange={(e) => setCheckoutForm({ ...checkoutForm, customerName: e.target.value })}
                            placeholder="Your name"
                            data-testid="input-customer-name"
                          />
                        </div>
                        <div>
                          <Label htmlFor="customer-email">Email *</Label>
                          <Input
                            id="customer-email"
                            type="email"
                            value={checkoutForm.customerEmail}
                            onChange={(e) => setCheckoutForm({ ...checkoutForm, customerEmail: e.target.value })}
                            placeholder="your@email.com"
                            data-testid="input-customer-email"
                          />
                        </div>
                        <div>
                          <Label htmlFor="customer-phone">Phone (optional)</Label>
                          <Input
                            id="customer-phone"
                            type="tel"
                            value={checkoutForm.customerPhone}
                            onChange={(e) => setCheckoutForm({ ...checkoutForm, customerPhone: e.target.value })}
                            placeholder="(555) 123-4567"
                            data-testid="input-customer-phone"
                          />
                        </div>
                        <Button 
                          className="w-full" 
                          onClick={handleCheckout}
                          disabled={checkoutMutation.isPending}
                          data-testid="button-complete-purchase"
                        >
                          {checkoutMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <Check className="h-4 w-4 mr-2" />
                              Complete Purchase
                            </>
                          )}
                        </Button>
                        <Button 
                          variant="ghost" 
                          className="w-full"
                          onClick={() => setIsCheckingOut(false)}
                        >
                          Back to Cart
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <footer className="border-t bg-white py-6 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Thank you for supporting {seller.name}!</p>
          <p className="mt-1">All proceeds benefit the school community.</p>
        </div>
      </footer>
    </div>
  );
}
