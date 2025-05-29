import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Star, Users, GraduationCap, Building } from "lucide-react";
import { useAuth0 } from @/hooks/useAuth00";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface PaymentPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  icon: React.ReactNode;
  popular?: boolean;
  stripePriceId?: string;
}

const paymentPlans: PaymentPlan[] = [
  {
    id: 'free',
    name: 'Free Explorer',
    description: 'Perfect for getting started with homeschooling',
    price: 0,
    interval: 'month',
    icon: <Star className="h-6 w-6" />,
    features: [
      'Access to basic lesson templates',
      'Community knowledge base',
      '5 AI worksheet generations per month',
      'Basic curriculum planning',
      'Email support'
    ]
  },
  {
    id: 'family',
    name: 'Family Plan',
    description: 'Ideal for families with multiple children',
    price: 29.99,
    interval: 'month',
    popular: true,
    icon: <Users className="h-6 w-6" />,
    stripePriceId: 'price_family_monthly',
    features: [
      'Everything in Free',
      'Unlimited AI worksheet generation',
      'Premium lesson templates',
      'Advanced curriculum planning',
      'Progress tracking for up to 4 children',
      'Parent dashboard & analytics',
      'Priority email support',
      'Access to premium knowledge bases'
    ]
  },
  {
    id: 'educator',
    name: 'Educator Pro',
    description: 'For professional educators and tutors',
    price: 49.99,
    interval: 'month',
    icon: <GraduationCap className="h-6 w-6" />,
    stripePriceId: 'price_educator_monthly',
    features: [
      'Everything in Family Plan',
      'Classroom management tools',
      'Student progress reporting',
      'Bulk lesson creation',
      'Advanced AI features',
      'Custom branding options',
      'Phone & email support',
      'Training webinars'
    ]
  },
  {
    id: 'institutional',
    name: 'School & Co-op',
    description: 'For schools and homeschool cooperatives',
    price: 199.99,
    interval: 'month',
    icon: <Building className="h-6 w-6" />,
    stripePriceId: 'price_institutional_monthly',
    features: [
      'Everything in Educator Pro',
      'Unlimited students & teachers',
      'Administrative dashboard',
      'Custom integrations',
      'Dedicated account manager',
      'On-site training',
      'Priority feature requests',
      'White-label options'
    ]
  }
];

const annualDiscountPlans: PaymentPlan[] = paymentPlans.map(plan => ({
  ...plan,
  id: plan.id + '_annual',
  interval: 'year' as const,
  price: plan.price > 0 ? Math.round(plan.price * 10) : 0, // 2 months free
  stripePriceId: plan.stripePriceId?.replace('monthly', 'yearly')
}));

export default function PaymentPlans() {
  const { user, isAuthenticated } = useAuth0();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isAnnual, setIsAnnual] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const plans = isAnnual ? annualDiscountPlans : paymentPlans;

  const handleSelectPlan = async (plan: PaymentPlan) => {
    if (!isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please log in to subscribe to a plan.",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }

    if (plan.price === 0) {
      // Handle free plan
      try {
        setProcessing(true);
        await apiRequest("POST", "/api/subscriptions/free", {
          planId: plan.id
        });
        
        toast({
          title: "Welcome to Free Explorer!",
          description: "You can now access basic features and start your learning journey.",
        });
        
        navigate("/dashboard");
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to activate free plan. Please try again.",
          variant: "destructive",
        });
      } finally {
        setProcessing(false);
      }
      return;
    }

    // Handle paid plans with Stripe
    try {
      setProcessing(true);
      setSelectedPlan(plan.id);
      
      const response = await apiRequest("POST", "/api/subscriptions/create", {
        planId: plan.id,
        stripePriceId: plan.stripePriceId,
        interval: plan.interval
      });

      if (!response.ok) {
        throw new Error("Failed to create subscription");
      }

      const { sessionUrl } = await response.json();
      
      // Redirect to Stripe Checkout
      window.location.href = sessionUrl;
      
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start subscription process. Please try again.",
        variant: "destructive",
      });
      setSelectedPlan(null);
    } finally {
      setProcessing(false);
    }
  };

  const formatPrice = (price: number, interval: string) => {
    if (price === 0) return "Free";
    return `$${price.toFixed(2)}/${interval}`;
  };

  const getSavings = (monthlyPrice: number, annualPrice: number) => {
    if (monthlyPrice === 0) return 0;
    const monthlyCost = monthlyPrice * 12;
    return Math.round(((monthlyCost - annualPrice) / monthlyCost) * 100);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Choose Your Learning Journey
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
          Flexible payment plans designed to make quality education accessible to every family. 
          Start free and upgrade as your needs grow.
        </p>
        
        {/* Billing Toggle */}
        <div className="flex items-center justify-center space-x-4 mb-8">
          <span className={`font-medium ${!isAnnual ? 'text-primary' : 'text-gray-500'}`}>
            Monthly
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isAnnual ? 'bg-primary' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isAnnual ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className={`font-medium ${isAnnual ? 'text-primary' : 'text-gray-500'}`}>
            Annual
          </span>
          {isAnnual && (
            <Badge variant="secondary" className="ml-2">
              Save up to 17%
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {plans.map((plan) => {
          const isCurrentPlan = user?.subscription === plan.id.replace('_annual', '');
          const monthlyPlan = paymentPlans.find(p => p.id === plan.id.replace('_annual', ''));
          const savings = isAnnual && monthlyPlan ? getSavings(monthlyPlan.price, plan.price) : 0;
          
          return (
            <Card 
              key={plan.id} 
              className={`relative ${plan.popular ? 'border-primary shadow-lg scale-105' : ''} ${
                isCurrentPlan ? 'border-green-500' : ''
              }`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  Most Popular
                </Badge>
              )}
              
              {isCurrentPlan && (
                <Badge variant="secondary" className="absolute -top-3 right-4">
                  Current Plan
                </Badge>
              )}

              <CardHeader className="text-center">
                <div className="mx-auto mb-4 p-3 bg-primary/10 rounded-full w-fit">
                  {plan.icon}
                </div>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription className="text-sm">
                  {plan.description}
                </CardDescription>
                <div className="mt-4">
                  <div className="text-3xl font-bold text-primary">
                    {formatPrice(plan.price, plan.interval)}
                  </div>
                  {isAnnual && savings > 0 && (
                    <div className="text-sm text-green-600 font-medium">
                      Save {savings}% annually
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start space-x-3">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant={plan.popular ? "default" : "outline"}
                  onClick={() => handleSelectPlan(plan)}
                  disabled={processing || isCurrentPlan}
                >
                  {processing && selectedPlan === plan.id ? (
                    "Processing..."
                  ) : isCurrentPlan ? (
                    "Current Plan"
                  ) : plan.price === 0 ? (
                    "Start Free"
                  ) : (
                    `Choose ${plan.name}`
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Payment Plans Benefits */}
      <div className="mt-16 bg-gray-50 rounded-lg p-8">
        <h2 className="text-2xl font-bold text-center mb-8">Why Choose Our Payment Plans?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="bg-primary/10 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold mb-2">Family-Friendly</h3>
            <p className="text-gray-600 text-sm">Plans designed for families of all sizes with flexible child limits</p>
          </div>
          
          <div className="text-center">
            <div className="bg-primary/10 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <GraduationCap className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold mb-2">No Contracts</h3>
            <p className="text-gray-600 text-sm">Cancel anytime with no long-term commitments or hidden fees</p>
          </div>
          
          <div className="text-center">
            <div className="bg-primary/10 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <Star className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold mb-2">Money-Back Guarantee</h3>
            <p className="text-gray-600 text-sm">30-day money-back guarantee on all paid plans</p>
          </div>
        </div>
      </div>
    </div>
  );
}