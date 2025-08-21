import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Clock, Star, Calendar, User, DollarSign, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface BillingSummary {
  totalBalance: number;
  totalBalanceFormatted: string;
  enrollmentCount: number;
  enrollmentDetails: Array<{
    enrollmentId: number;
    childName: string;
    className: string;
    classPrice: number;
    amountPaid: number;
    balance: number;
    enrollmentDate: string;
    status: string;
    depositRequired: number;
  }>;
  parentEmail: string;
}

interface PaymentHistory {
  id: number;
  amount: number;
  status: string;
  createdAt: string;
  paymentPlan: string | null;
  nextPaymentDate: string | null;
  description: string;
}

export default function PaymentPlansPage() {
  const [, navigate] = useLocation();

  // Get billing summary and payment history
  const { data: billingSummary, isLoading: billingSummaryLoading } = useQuery<BillingSummary>({
    queryKey: ['billing-summary'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/billing/summary');
      const data = await response.json();
      return data;
    },
  });

  const { data: paymentHistory = [], isLoading: historyLoading } = useQuery<PaymentHistory[]>({
    queryKey: ['payment-history'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/payment-history/history');
      const data = await response.json();
      return data.success ? data.payments : [];
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Get active payment plans (enrollments with remaining balances)
  const activePaymentPlans = billingSummary?.enrollmentDetails?.filter(detail => detail.balance > 0) || [];
  
  // Check if user has any active payment plans
  const hasActivePaymentPlans = activePaymentPlans.length > 0;
  
  // Get recent payments with payment plans
  const recentPaymentPlans = paymentHistory?.filter(payment => 
    payment.paymentPlan && payment.nextPaymentDate
  ) || [];

  return (
    <ParentAppShell>
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">Payment Plans</h1>
          <p className="text-gray-600 mb-6">
            Manage your active payment plans and view payment schedules
          </p>
        </div>

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="active">Active Plans</TabsTrigger>
            <TabsTrigger value="history">Payment History</TabsTrigger>
            <TabsTrigger value="options">Plan Options</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-6">
            {hasActivePaymentPlans ? (
              <div className="space-y-6">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold mb-2">Active Payment Plans</h2>
                  <p className="text-gray-600">Your current enrollments with outstanding balances</p>
                </div>

                <div className="grid gap-4">
                  {activePaymentPlans.map((plan) => (
                    <Card key={plan.enrollmentId} className="border-l-4 border-l-orange-500">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <h3 className="font-medium text-lg">{plan.className}</h3>
                            <div className="flex items-center gap-4 text-sm text-gray-600">
                              <span className="flex items-center gap-1">
                                <User className="h-4 w-4" />
                                {plan.childName}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                Enrolled {formatDate(plan.enrollmentDate)}
                              </span>
                            </div>
                            
                            <div className="pt-2 space-y-1">
                              <div className="text-sm">
                                <span className="text-gray-600">Total Cost:</span> 
                                <span className="ml-2 font-medium">{formatCurrency(plan.classPrice)}</span>
                              </div>
                              <div className="text-sm">
                                <span className="text-gray-600">Amount Paid:</span> 
                                <span className="ml-2 font-medium text-green-600">{formatCurrency(plan.amountPaid)}</span>
                              </div>
                              <div className="text-sm">
                                <span className="text-gray-600">Outstanding Balance:</span> 
                                <span className="ml-2 font-bold text-orange-600">{formatCurrency(plan.balance)}</span>
                              </div>
                            </div>
                          </div>
                          
                          <Button onClick={() => navigate('/billing')}>
                            Make Payment
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <DollarSign className="h-6 w-6 text-blue-600 mt-0.5" />
                      <div>
                        <h3 className="font-medium text-blue-900">Total Outstanding</h3>
                        <p className="text-2xl font-bold text-blue-900 mt-1">
                          {formatCurrency(activePaymentPlans.reduce((sum, plan) => sum + plan.balance, 0))}
                        </p>
                        <p className="text-sm text-blue-700 mt-2">
                          Across {activePaymentPlans.length} enrollment{activePaymentPlans.length !== 1 ? 's' : ''}
                        </p>
                        <Button 
                          className="mt-3" 
                          onClick={() => navigate('/billing')}
                        >
                          Pay All Outstanding Balances
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12">
                <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">All Paid Up!</h3>
                <p className="text-gray-500 mb-4">You have no active payment plans or outstanding balances.</p>
                <Button onClick={() => navigate('/programs')}>
                  Browse Programs
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Payment History</h2>
              <p className="text-gray-600">View all your past payments and transactions</p>
            </div>

            {paymentHistory.length > 0 ? (
              <div className="space-y-4">
                {paymentHistory.map((payment) => (
                  <Card key={payment.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{payment.description || 'Payment'}</h3>
                            <Badge 
                              variant={payment.status === 'succeeded' ? 'default' : 
                                      payment.status === 'pending' ? 'secondary' : 'destructive'}
                            >
                              {payment.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600">
                            {formatDate(payment.createdAt)}
                          </p>
                          {payment.paymentPlan && (
                            <p className="text-sm text-blue-600">
                              Payment Plan: {payment.paymentPlan}
                            </p>
                          )}
                          {payment.nextPaymentDate && (
                            <p className="text-sm text-orange-600">
                              Next Payment: {formatDate(payment.nextPaymentDate)}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold">
                            {formatCurrency(payment.amount)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No payment history</h3>
                <p className="text-gray-500">Payment records will appear here once you make your first payment.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="options" className="space-y-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Payment Plan Options</h2>
              <p className="text-gray-600">Available payment plans for new enrollments</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-blue-600" />
                    Deposit Payment
                  </CardTitle>
                  <CardDescription>Pay 10% deposit to secure enrollment</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      Immediate enrollment confirmation
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      Secure your child's spot
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      Payment reminders for balance
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Split Payment
                  </CardTitle>
                  <CardDescription>Pay 50% now, 50% later</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      Spread cost over 2 payments
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      Automatic reminders
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      No additional fees
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Monthly Installments
                  </CardTitle>
                  <CardDescription>Pay in 3 monthly payments</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      Lowest monthly payment
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      Budget-friendly option
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      Flexible scheduling
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="text-center">
                  <h3 className="font-medium text-green-900 mb-2">Ready to Enroll?</h3>
                  <p className="text-green-700 mb-4">Browse our programs and classes to get started with a payment plan</p>
                  <Button onClick={() => navigate('/programs')}>
                    Browse Programs & Classes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ParentAppShell>
  );
}