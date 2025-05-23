import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, ArrowRight, Users, Star } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function SubscriptionSuccess() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(true);
  const [subscriptionDetails, setSubscriptionDetails] = useState<any>(null);

  useEffect(() => {
    const processSubscription = async () => {
      try {
        // Get session ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('session_id');
        
        if (!sessionId) {
          toast({
            title: "Error",
            description: "No session ID found. Please try again.",
            variant: "destructive",
          });
          navigate("/payment-plans");
          return;
        }

        // Verify subscription was successful and get details
        const response = await apiRequest("GET", `/api/subscriptions/status`);
        
        if (response.ok) {
          const data = await response.json();
          setSubscriptionDetails(data);
        }
        
        setIsProcessing(false);
      } catch (error) {
        console.error("Error processing subscription:", error);
        toast({
          title: "Error",
          description: "There was an error processing your subscription. Please contact support.",
          variant: "destructive",
        });
        setIsProcessing(false);
      }
    };

    processSubscription();
  }, [navigate, toast]);

  const getPlanDetails = (planName: string) => {
    switch (planName) {
      case 'family':
        return {
          title: 'Family Plan',
          description: 'Perfect for families with multiple children',
          features: ['Unlimited AI worksheets', 'Progress tracking for 4 children', 'Premium lesson templates']
        };
      case 'educator':
        return {
          title: 'Educator Pro',
          description: 'Professional tools for educators',
          features: ['Classroom management', 'Student reporting', 'Advanced AI features']
        };
      case 'institutional':
        return {
          title: 'School & Co-op',
          description: 'Complete solution for institutions',
          features: ['Unlimited students', 'Administrative dashboard', 'Custom integrations']
        };
      default:
        return {
          title: 'Premium Plan',
          description: 'Enhanced learning experience',
          features: ['Full platform access', 'Premium content', 'Priority support']
        };
    }
  };

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-4">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-4"></div>
        <p>Processing your subscription...</p>
      </div>
    );
  }

  const planDetails = getPlanDetails(subscriptionDetails?.plan || '');

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-6">
          <div className="rounded-full bg-green-100 p-4">
            <Check className="h-12 w-12 text-green-600" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Welcome to {planDetails.title}! 🎉
        </h1>
        <p className="text-lg text-gray-600">
          Your subscription is now active and ready to use
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Star className="h-5 w-5 text-primary" />
              <span>Your Plan Features</span>
            </CardTitle>
            <CardDescription>{planDetails.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {planDetails.features.map((feature, index) => (
                <li key={index} className="flex items-start space-x-3">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-primary" />
              <span>Next Steps</span>
            </CardTitle>
            <CardDescription>Get the most out of your new plan</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex items-start space-x-3">
                <ArrowRight className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm">Register your children in the system</span>
              </li>
              <li className="flex items-start space-x-3">
                <ArrowRight className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm">Explore premium lesson templates</span>
              </li>
              <li className="flex items-start space-x-3">
                <ArrowRight className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm">Start generating unlimited AI worksheets</span>
              </li>
              <li className="flex items-start space-x-3">
                <ArrowRight className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm">Set up progress tracking for your children</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
        <Button onClick={() => navigate('/dashboard')} size="lg" className="min-w-[200px]">
          Go to Dashboard
        </Button>
        <Button 
          variant="outline" 
          onClick={() => navigate('/children')} 
          size="lg"
          className="min-w-[200px]"
        >
          Register Children
        </Button>
      </div>

      <Card className="mt-8 bg-blue-50 border-blue-200">
        <CardContent className="p-6">
          <div className="text-center">
            <h3 className="font-semibold text-blue-900 mb-2">Need Help Getting Started?</h3>
            <p className="text-blue-700 text-sm mb-4">
              Our support team is here to help you make the most of your subscription.
            </p>
            <Button variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100">
              Contact Support
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}