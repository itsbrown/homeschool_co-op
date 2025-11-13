
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Check, CreditCard, Calendar, DollarSign } from "lucide-react";
import { useLocation } from "wouter";

interface ClassPaymentPlan {
  id: string;
  name: string;
  description: string;
  amount: number;
  popular?: boolean;
  discount?: number;
  features: string[];
  dueDate?: string;
  installments?: {
    count: number;
    frequency: string;
    amounts: number[];
  };
}

interface ClassPaymentPlansProps {
  classData: {
    id: string;
    title: string;
    price: number;
    depositRequired: number;
    school: string;
    schedule: string;
  };
  childName: string;
  onSelectPlan: (plan: ClassPaymentPlan) => void;
}

export default function ClassPaymentPlans({ classData, childName, onSelectPlan }: ClassPaymentPlansProps) {
  const [, navigate] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState("deposit");

  // Calculate payment plan options
  const depositAmount = classData.depositRequired;
  const fullAmount = classData.price;
  const remainingBalance = fullAmount - depositAmount;

  const paymentPlans: ClassPaymentPlan[] = [
    {
      id: "deposit",
      name: "Pay Deposit Only",
      description: "Secure your spot with a 10% deposit",
      amount: depositAmount,
      popular: true,
      features: [
        "Immediate enrollment confirmation",
        "Remaining balance due before class starts",
        "Full refund if cancelled 30 days before",
        "Payment reminder emails"
      ],
      dueDate: "Remaining balance due 2 weeks before class start"
    },
    {
      id: "full",
      name: "Pay in Full",
      description: "Complete payment now",
      amount: fullAmount,
      features: [
        "No additional fees",
        "No future payment worries",
        "Priority class placement",
        "Full refund if cancelled 30 days before"
      ]
    },
    {
      id: "split",
      name: "Split Payment Plan",
      description: "Pay 50% now, 50% later",
      amount: Math.round(fullAmount / 2),
      features: [
        "Pay half now, half in 30 days",
        "Automatic payment reminders",
        "No additional fees",
        "Flexible payment dates"
      ],
      installments: {
        count: 2,
        frequency: "monthly",
        amounts: [Math.round(fullAmount / 2), Math.round(fullAmount / 2)]
      }
    },
    {
      id: "monthly",
      name: "Monthly Installments",
      description: "Spread payment over 3 months",
      amount: Math.round(fullAmount / 3),
      features: [
        "Pay in 3 equal monthly installments",
        "First payment due today",
        "Auto-charge on file each month",
        "Small convenience fee applies"
      ],
      installments: {
        count: 3,
        frequency: "monthly",
        amounts: [
          Math.round(fullAmount / 3),
          Math.round(fullAmount / 3),
          Math.round(fullAmount / 3)
        ]
      }
    }
  ];

  const handleProceedToPayment = () => {
    const selectedPlanData = paymentPlans.find(p => p.id === selectedPlan);
    if (selectedPlanData) {
      onSelectPlan(selectedPlanData);
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
      {/* Class Information Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Choose Your Payment Plan</h1>
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-xl text-blue-900">{classData.title}</CardTitle>
            <CardDescription>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                <div>
                  <span className="font-medium">Student:</span> {childName}
                </div>
                <div>
                  <span className="font-medium">School:</span> {classData.school}
                </div>
                <div>
                  <span className="font-medium">Schedule:</span> {classData.schedule}
                </div>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <span className="text-lg font-medium">Total Class Cost:</span>
              <span className="text-2xl font-bold text-blue-700">
                {formatCurrency(classData.price)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Plan Selection */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-6">Select Payment Option</h2>
        
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
                      {plan.installments && (
                        <div className="text-sm text-gray-500">
                          {plan.installments.count} payments
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                
                {selectedPlan === plan.id && (
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Features */}
                      <div>
                        <h4 className="font-medium mb-3 flex items-center">
                          <Check className="h-4 w-4 text-green-500 mr-2" />
                          What's Included
                        </h4>
                        <ul className="space-y-2">
                          {plan.features.map((feature, index) => (
                            <li key={index} className="flex items-start space-x-2">
                              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
                              <span className="text-sm text-gray-600">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Payment Schedule */}
                      <div>
                        <h4 className="font-medium mb-3 flex items-center">
                          <Calendar className="h-4 w-4 text-blue-500 mr-2" />
                          Payment Schedule
                        </h4>
                        {plan.installments ? (
                          <div className="space-y-2">
                            {plan.installments.amounts.map((amount, index) => (
                              <div key={index} className="flex justify-between text-sm">
                                <span>Payment {index + 1}:</span>
                                <span className="font-medium">{formatCurrency(amount)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-600">
                            {plan.id === 'deposit' ? (
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span>Today:</span>
                                  <span className="font-medium">{formatCurrency(plan.amount)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Before class starts:</span>
                                  <span className="font-medium">{formatCurrency(remainingBalance)}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex justify-between">
                                <span>Today:</span>
                                <span className="font-medium">{formatCurrency(plan.amount)}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {plan.dueDate && (
                          <div className="mt-2 text-xs text-gray-500">
                            {plan.dueDate}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </RadioGroup>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 pt-6 border-t">
        <Button
          variant="outline"
          onClick={() => navigate("/programs")}
          className="flex-1"
        >
          Back to Programs
        </Button>
        <Button
          onClick={handleProceedToPayment}
          className="flex-1"
          size="lg"
        >
          <CreditCard className="mr-2 h-4 w-4" />
          Proceed to Payment
        </Button>
      </div>

      {/* Payment Security Note */}
      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <DollarSign className="h-4 w-4" />
          <span>
            Secure payment processing by Stripe. All payment plans are subject to the school's refund policy.
          </span>
        </div>
      </div>
    </div>
  );
}
