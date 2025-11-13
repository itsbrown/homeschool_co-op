
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CreditCard, Calendar, DollarSign } from "lucide-react";

interface PaymentPlanPageProps {
  enrollmentData?: {
    enrollmentId: string;
    className: string;
    childName: string;
    totalCost: number;
    depositRequired: number;
    amountPaid: number;
    remainingBalance: number;
  };
}

export default function PaymentPlanPage({ enrollmentData }: PaymentPlanPageProps) {
  const [, navigate] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState("deposit");

  if (!enrollmentData) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <p>No enrollment data found. Please select a class first.</p>
            <Button onClick={() => navigate("/programs")} className="mt-4">
              Browse Programs
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const paymentPlans = [
    {
      id: "deposit",
      name: "Pay Deposit Only",
      description: "Secure your spot with a 10% deposit",
      amount: enrollmentData.depositRequired,
      popular: true,
      features: [
        "Immediate enrollment confirmation",
        "Remaining balance due before class starts",
        "Full refund if cancelled 30 days before",
        "Payment reminder emails"
      ]
    },
    {
      id: "full",
      name: "Pay in Full",
      description: "Complete payment now",
      amount: enrollmentData.remainingBalance,
      features: [
        "No additional fees",
        "No future payment worries",
        "Priority class placement",
        "Full refund if cancelled 30 days before"
      ]
    },
    {
      id: "split",
      name: "Split Payment",
      description: "Pay 50% now, 50% later",
      amount: Math.round(enrollmentData.remainingBalance / 2),
      features: [
        "Pay half now, half in 30 days",
        "Automatic payment reminders",
        "No additional fees",
        "Flexible payment dates"
      ]
    }
  ];

  const handleProceedToPayment = () => {
    const selectedPlanData = paymentPlans.find(p => p.id === selectedPlan);
    if (selectedPlanData) {
      // Navigate to checkout with payment plan data
      const paymentData = {
        ...enrollmentData,
        paymentType: selectedPlan,
        amount: selectedPlanData.amount,
        description: `${selectedPlanData.name} for ${enrollmentData.className}`
      };
      
      // Store payment data and navigate to checkout
      sessionStorage.setItem('paymentPlanData', JSON.stringify(paymentData));
      navigate('/checkout');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount / 100);
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Choose Your Payment Plan</h1>
        <p className="text-gray-600">
          Select the payment option that works best for you for {enrollmentData.className}
        </p>
      </div>

      <div className="grid gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Enrollment Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Class</p>
                <p className="font-semibold">{enrollmentData.className}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Student</p>
                <p className="font-semibold">{enrollmentData.childName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Cost</p>
                <p className="font-semibold">{formatCurrency(enrollmentData.totalCost)}</p>
              </div>
            </div>
            {enrollmentData.amountPaid > 0 && (
              <div className="mt-4 p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-green-700">
                  Amount Already Paid: {formatCurrency(enrollmentData.amountPaid)}
                </p>
                <p className="text-sm text-green-700">
                  Remaining Balance: {formatCurrency(enrollmentData.remainingBalance)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <RadioGroup value={selectedPlan} onValueChange={setSelectedPlan}>
          <div className="grid gap-4">
            {paymentPlans.map((plan) => (
              <Card key={plan.id} className={`cursor-pointer transition-all ${
                selectedPlan === plan.id ? 'ring-2 ring-primary border-primary' : 'hover:shadow-md'
              }`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value={plan.id} id={plan.id} />
                      <Label htmlFor={plan.id} className="cursor-pointer">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold">{plan.name}</h3>
                            {plan.popular && (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                                Most Popular
                              </Badge>
                            )}
                          </div>
                          <p className="text-gray-600 text-sm">{plan.description}</p>
                        </div>
                      </Label>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">
                        {formatCurrency(plan.amount)}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm">
                        <div className="h-1.5 w-1.5 bg-green-500 rounded-full"></div>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </RadioGroup>
      </div>

      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={() => navigate("/programs")}>
          Back to Programs
        </Button>
        <Button onClick={handleProceedToPayment} className="flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Proceed to Payment
        </Button>
      </div>
    </div>
  );
}
