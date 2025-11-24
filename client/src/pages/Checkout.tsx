import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useEffect, useState } from 'react';
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { STRIPE_PUBLISHABLE_KEY } from '@/config/stripe';

// Initialize Stripe outside component to avoid re-creating the Stripe object
const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

const CheckoutForm = ({ purchaseData }: { purchaseData: any }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const [processing, setProcessing] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout-success?kb=${purchaseData.knowledgeBaseId}`,
        },
        redirect: 'if_required',
      });

      if (error) {
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Record the purchase on your backend
        await apiRequest("POST", `/api/knowledge-bases/${purchaseData.knowledgeBaseId}/purchase`, {
          paymentIntentId: paymentIntent.id,
        });
        
        toast({
          title: "Payment Successful",
          description: "Thank you for your purchase!",
        });
        
        // Navigate to the knowledge base detail page
        navigate(`/knowledge-base/${purchaseData.knowledgeBaseId}`);
      }
    } catch (error) {
      console.error("Payment error:", error);
      toast({
        title: "Payment Failed",
        description: "There was an error processing your payment.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button 
        type="submit" 
        className="w-full" 
        disabled={!stripe || processing}
      >
        {processing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing
          </>
        ) : (
          `Pay $${(purchaseData.amount / 100).toFixed(2)}`
        )}
      </Button>
    </form>
  );
};

export default function Checkout() {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purchaseData, setPurchaseData] = useState<any>(null);
  const [location, navigate] = useLocation();
  
  useEffect(() => {
    // Extract purchase info from URL parameters
    const searchParams = new URLSearchParams(window.location.search);
    const knowledgeBaseId = searchParams.get("kb");
    const title = searchParams.get("title");
    const amount = searchParams.get("amount");
    
    if (!knowledgeBaseId || !amount) {
      setError("Missing required purchase information");
      return;
    }
    
    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      setError("Invalid purchase amount");
      return;
    }
    
    const purchaseInfo = {
      knowledgeBaseId: parseInt(knowledgeBaseId),
      title: title || "Knowledge Base Purchase",
      amount: amountValue
    };
    
    setPurchaseData(purchaseInfo);
    
    // Create PaymentIntent
    apiRequest("POST", "/api/create-payment-intent", purchaseInfo)
      .then((res) => {
        if (!res.ok) {
          return res.json().then(data => {
            throw new Error(data.message || "Failed to create payment intent");
          });
        }
        return res.json();
      })
      .then((data) => {
        setClientSecret(data.clientSecret);
      })
      .catch((err) => {
        console.error("Payment intent error:", err);
        setError(err.message || "Failed to initialize payment");
      });
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-red-500">Payment Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center">{error}</p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button onClick={() => navigate("/knowledge-base")}>
              Return to Knowledge Base
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!clientSecret || !purchaseData) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Complete Your Purchase</CardTitle>
          <CardDescription className="text-center">
            {purchaseData.title} - ${(purchaseData.amount / 100).toFixed(2)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CheckoutForm purchaseData={purchaseData} />
          </Elements>
        </CardContent>
      </Card>
    </div>
  );
}