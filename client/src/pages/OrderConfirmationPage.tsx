import { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Package, MapPin, CreditCard, Loader2 } from 'lucide-react';

interface Submission {
  id: number;
  formId: number;
  totalAmount: number;
  subtotal: number;
  platformFee: number;
  paymentStatus: string;
  stripePaymentIntentId: string | null;
  shippingAddress: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  responseData: any;
  productImages: string[];
  createdAt: string;
}

export default function OrderConfirmationPage() {
  const [, params] = useRoute('/order-confirmation/:submissionId');
  const [, navigate] = useLocation();
  const submissionId = params?.submissionId ? parseInt(params.submissionId) : null;
  const [paymentStatus, setPaymentStatus] = useState<string>('loading');

  // Get payment intent status from URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('payment_intent_client_secret') ? 'succeeded' : 'loading';
    setPaymentStatus(status);
  }, []);

  // Fetch submission details
  const { data: submission, isLoading } = useQuery<Submission>({
    queryKey: [`/api/custom-forms/submissions/${submissionId}`],
    enabled: !!submissionId,
  });

  if (isLoading || !submission) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isPaymentSuccessful = paymentStatus === 'succeeded' || submission.paymentStatus === 'completed';

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        {/* Success Header */}
        {isPaymentSuccessful ? (
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold mb-2" data-testid="text-order-success">
              Order Confirmed!
            </h1>
            <p className="text-muted-foreground">
              Thank you for your order. You will receive a confirmation email shortly.
            </p>
          </div>
        ) : (
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-100 rounded-full mb-4">
              <Package className="h-8 w-8 text-yellow-600" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Payment Pending</h1>
            <p className="text-muted-foreground">
              Your order is being processed. Please wait for payment confirmation.
            </p>
          </div>
        )}

        {/* Order Details */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Order Details
            </CardTitle>
            <CardDescription>Order #{submission.id}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Order Items */}
            <div>
              <h3 className="font-semibold mb-2">Items Ordered</h3>
              <div className="space-y-2">
                {Object.entries(submission.responseData || {}).map(([key, value]) => {
                  if (typeof value === 'number' && value > 0) {
                    return (
                      <div key={key} className="flex justify-between text-sm">
                        <span>{key.replace('field_', 'Item ')}:</span>
                        <span>Qty: {value}</span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>

            {/* Product Images */}
            {submission.productImages && submission.productImages.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Product Images</h3>
                <div className="grid grid-cols-3 gap-2">
                  {submission.productImages.map((imageUrl, index) => (
                    <img
                      key={index}
                      src={imageUrl}
                      alt={`Product ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Shipping Address */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Shipping Address
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              <p>{submission.shippingAddress.address}</p>
              <p>
                {submission.shippingAddress.city}, {submission.shippingAddress.state} {submission.shippingAddress.zipCode}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Payment Summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>${(submission.subtotal / 100).toFixed(2)}</span>
              </div>
              {submission.platformFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Platform Fee:</span>
                  <span>${(submission.platformFee / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total Paid:</span>
                <span data-testid="text-order-total">${(submission.totalAmount / 100).toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm mt-4">
                <span className="text-muted-foreground">Payment Status:</span>
                <span 
                  className={`font-semibold ${
                    isPaymentSuccessful ? 'text-green-600' : 'text-yellow-600'
                  }`}
                  data-testid="text-payment-status"
                >
                  {isPaymentSuccessful ? 'Completed' : 'Pending'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4 justify-center">
          <Button
            variant="outline"
            onClick={() => navigate('/')}
            data-testid="button-back-home"
          >
            Back to Home
          </Button>
          <Button
            onClick={() => window.print()}
            data-testid="button-print-receipt"
          >
            Print Receipt
          </Button>
        </div>
      </div>
    </div>
  );
}
