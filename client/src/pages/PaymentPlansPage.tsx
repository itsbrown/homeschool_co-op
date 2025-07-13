
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Clock, Star } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface PaymentPlan {
  id: string;
  name: string;
  description: string;
  amount: number;
  popular?: boolean;
  features: string[];
  billingCycle: string;
  setupFee?: number;
}

export default function PaymentPlansPage() {
  const [, navigate] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  // Get billing summary to check for outstanding balances
  const { data: billingSummary } = useQuery({
    queryKey: ['billing-summary'],
    queryFn: () => apiRequest('GET', '/api/billing/summary'),
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount / 100);
  };

  // Standard payment plans for class enrollments
  const paymentPlans: PaymentPlan[] = [
    {
      id: "deposit_only",
      name: "Deposit Payment",
      description: "Pay 10% deposit to secure enrollment",
      amount: 0, // Will be calculated based on class
      popular: true,
      billingCycle: "One-time",
      features: [
        "Immediate enrollment confirmation",
        "Secure your child's spot",
        "Remaining balance due before class starts",
        "Full refund if cancelled 30 days before",
        "Payment reminder emails"
      ]
    },
    {
      id: "full_payment",
      name: "Pay in Full",
      description: "Complete payment for entire class cost",
      amount: 0, // Will be calculated based on class
      billingCycle: "One-time",
      features: [
        "No future payment worries",
        "Priority class placement",
        "Small discount on total cost",
        "Full refund if cancelled 30 days before",
        "No payment reminders needed"
      ]
    },
    {
      id: "split_payment",
      name: "Split Payment Plan",
      description: "Pay 50% now, 50% in 30 days",
      amount: 0, // Will be calculated based on class
      billingCycle: "2 payments",
      features: [
        "Spread cost over 2 months",
        "Automatic payment reminders",
        "No additional fees",
        "Flexible payment scheduling"
      ]
    },
    {
      id: "monthly_plan",
      name: "Monthly Installments",
      description: "Pay in 3 monthly installments",
      amount: 0, // Will be calculated based on class
      billingCycle: "3 payments",
      features: [
        "Lowest monthly payment",
        "Automatic billing setup",
        "Payment flexibility",
        "Budget-friendly option"
      ]
    }
  ];

  const handleSelectPlan = (planId: string) => {
    setSelectedPlan(planId);
  };

  const handleProceedToPayment = () => {
    if (!selectedPlan) return;

    // Check if user has outstanding balances
    if (billingSummary?.enrollmentDetails?.length > 0) {
      // Redirect to billing page to pay outstanding balances
      navigate('/billing');
    } else {
      // Redirect to programs page to select classes first
      navigate('/programs');
    }
  };

  const handlePayOutstandingBalance = () => {
    navigate('/billing');
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Payment Plans</h1>
        <p className="text-gray-600 mb-6">
          Choose the payment option that works best for your family's budget
        </p>

        {/* Outstanding Balance Alert */}
        {billingSummary?.totalBalance > 0 && (
          <Card className="bg-yellow-50 border-yellow-200 mb-6">
            <CardHeader>
              <CardTitle className="text-yellow-900 flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Outstanding Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-yellow-800 mb-4">
                You have an outstanding balance of {billingSummary.totalBalanceFormatted} for {billingSummary.enrollmentCount} enrollment(s).
              </p>
              <Button 
                onClick={handlePayOutstandingBalance}
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                Pay Outstanding Balance
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Payment Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {paymentPlans.map((plan) => (
          <Card 
            key={plan.id} 
            className={`relative cursor-pointer transition-all duration-200 ${
              selectedPlan === plan.id 
                ? 'ring-2 ring-blue-500 shadow-lg' 
                : 'hover:shadow-md'
            } ${plan.popular ? 'border-blue-200' : ''}`}
            onClick={() => handleSelectPlan(plan.id)}
          >
            {plan.popular && (
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-blue-600 text-white">
                  <Star className="h-3 w-3 mr-1" />
                  Most Popular
                </Badge>
              </div>
            )}
            
            <CardHeader className="text-center pt-6">
              <CardTitle className="text-xl">{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <div className="mt-4">
                <div className="text-sm text-gray-500">{plan.billingCycle}</div>
              </div>
            </CardHeader>
            
            <CardContent>
              <ul className="space-y-2">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            
            <CardFooter className="pt-4">
              <Button 
                variant={selectedPlan === plan.id ? "default" : "outline"}
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectPlan(plan.id);
                }}
              >
                {selectedPlan === plan.id ? "Selected" : "Select Plan"}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Button
          size="lg"
          onClick={handleProceedToPayment}
          disabled={!selectedPlan}
          className="min-w-[200px]"
        >
          <CreditCard className="h-5 w-5 mr-2" />
          {billingSummary?.totalBalance > 0 
            ? "Pay Outstanding Balance"
            : "Browse Classes"
          }
        </Button>
        
        <Button
          variant="outline"
          size="lg"
          onClick={() => navigate('/programs')}
          className="min-w-[200px]"
        >
          View Available Classes
        </Button>
      </div>

      {/* Info Section */}
      <div className="mt-12 bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">How Payment Plans Work</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium mb-2">Deposit Payment</h4>
            <p className="text-sm text-gray-600">
              Pay just 10% upfront to secure your child's enrollment. The remaining balance is due 2 weeks before the class starts.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-2">Full Payment</h4>
            <p className="text-sm text-gray-600">
              Pay the complete amount upfront and enjoy peace of mind with no future payments to worry about.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-2">Split Payment</h4>
            <p className="text-sm text-gray-600">
              Divide the cost into two equal payments - 50% now and 50% in 30 days with automatic reminders.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-2">Monthly Installments</h4>
            <p className="text-sm text-gray-600">
              Spread the cost over 3 months for the most budget-friendly option with automatic billing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
