
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, CreditCard, Calendar, DollarSign, Star, AlertCircle } from 'lucide-react';
import { useLocation } from 'wouter';
import ParentAppShell from '@/components/layout/ParentAppShell';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PaymentPlan {
  id: string;
  name: string;
  description: string;
  features: string[];
  popular?: boolean;
  discount?: string;
  icon: React.ReactNode;
  color: string;
}

export default function PaymentPlansPage() {
  const [, navigate] = useLocation();

  const paymentPlans: PaymentPlan[] = [
    {
      id: 'deposit',
      name: 'Deposit Payment',
      description: 'Secure your spot with just 10% down',
      features: [
        'Pay only 10% to enroll',
        'Immediate class confirmation',
        'Remaining balance due before class starts',
        'Payment reminders via email',
        'Full refund if cancelled 30 days before'
      ],
      popular: true,
      icon: <DollarSign className="h-6 w-6" />,
      color: 'bg-blue-50 border-blue-200'
    },
    {
      id: 'full',
      name: 'Pay in Full',
      description: 'Complete payment now and save',
      features: [
        '$5 discount on orders over $500',
        'No future payment worries',
        'Priority class placement',
        'Full refund if cancelled 30 days before',
        'Guaranteed enrollment'
      ],
      discount: '$5 off orders over $500',
      icon: <Check className="h-6 w-6" />,
      color: 'bg-green-50 border-green-200'
    },
    {
      id: 'split',
      name: 'Split Payment',
      description: 'Pay 50% now, 50% later',
      features: [
        'Pay half now, half in 30 days',
        'Automatic payment reminders',
        'No additional fees',
        'Flexible payment dates',
        'Easy to manage'
      ],
      icon: <Calendar className="h-6 w-6" />,
      color: 'bg-purple-50 border-purple-200'
    },
    {
      id: 'monthly',
      name: 'Monthly Installments',
      description: 'Spread payments over 3 months',
      features: [
        'Pay in 3 equal monthly installments',
        'Automatic billing on the same date',
        'Low monthly amounts',
        'Payment failure protection',
        'Easy cancellation policy'
      ],
      icon: <CreditCard className="h-6 w-6" />,
      color: 'bg-orange-50 border-orange-200'
    }
  ];

  const benefits = [
    'Secure payment processing with Stripe',
    'Multiple payment methods accepted',
    'Email confirmations for all payments',
    'Transparent pricing with no hidden fees',
    'Flexible cancellation policies',
    'Customer support for payment issues'
  ];

  return (
    <ParentAppShell>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            Flexible Payment Plans
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose the payment option that works best for your family. All plans include the same great benefits.
          </p>
        </div>

        {/* Payment Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {paymentPlans.map((plan) => (
            <Card 
              key={plan.id} 
              className={`relative ${plan.color} ${plan.popular ? 'ring-2 ring-blue-500' : ''}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-blue-500 text-white flex items-center gap-1 px-3 py-1">
                    <Star className="h-3 w-3" />
                    Most Popular
                  </Badge>
                </div>
              )}
              
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-2">
                  {plan.icon}
                </div>
                <CardTitle className="text-xl mb-2">{plan.name}</CardTitle>
                <CardDescription className="text-sm">
                  {plan.description}
                </CardDescription>
                {plan.discount && (
                  <Badge variant="secondary" className="mt-2 bg-green-100 text-green-700">
                    {plan.discount}
                  </Badge>
                )}
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
            </Card>
          ))}
        </div>

        {/* How It Works */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-2xl text-center">How Payment Plans Work</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="bg-blue-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
                  <span className="text-blue-600 font-bold">1</span>
                </div>
                <h3 className="font-semibold mb-2">Choose Your Plan</h3>
                <p className="text-sm text-muted-foreground">
                  Select the payment option that fits your budget during enrollment
                </p>
              </div>
              <div className="text-center">
                <div className="bg-blue-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
                  <span className="text-blue-600 font-bold">2</span>
                </div>
                <h3 className="font-semibold mb-2">Make Payment</h3>
                <p className="text-sm text-muted-foreground">
                  Pay securely online with credit card, debit card, or bank transfer
                </p>
              </div>
              <div className="text-center">
                <div className="bg-blue-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
                  <span className="text-blue-600 font-bold">3</span>
                </div>
                <h3 className="font-semibold mb-2">Get Confirmed</h3>
                <p className="text-sm text-muted-foreground">
                  Receive instant confirmation and manage future payments in your dashboard
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Benefits */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Payment Benefits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-green-500" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Important Information */}
        <Alert className="mb-8">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> Payment plans are selected during enrollment. 
            You can view and manage your payment schedules in the billing section of your dashboard. 
            All payments are processed securely through Stripe.
          </AlertDescription>
        </Alert>

        {/* Action Buttons */}
        <div className="text-center space-y-4">
          <div className="space-x-4">
            <Button 
              onClick={() => navigate('/programs')} 
              size="lg"
              className="bg-blue-600 hover:bg-blue-700"
            >
              Browse Classes
            </Button>
            <Button 
              onClick={() => navigate('/billing')} 
              variant="outline" 
              size="lg"
            >
              View My Billing
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Need help? Contact our support team for assistance with payment plans.
          </p>
        </div>
      </div>
    </ParentAppShell>
  );
}
