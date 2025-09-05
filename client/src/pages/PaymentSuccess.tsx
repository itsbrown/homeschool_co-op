import React, { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Calendar, DollarSign, User, ArrowRight } from 'lucide-react';
import ParentAppShell from '@/components/layout/ParentAppShell';
import { useAuth } from '@/components/SupabaseProvider';
import { apiRequest, queryClient } from '@/lib/queryClient';

export default function PaymentSuccess() {
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const { user } = useAuth();
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get payment details from URL parameters
    const urlParams = new URLSearchParams(searchParams);
    const paymentIntentId = urlParams.get('payment_intent');
    const amount = urlParams.get('amount');
    const paymentDate = urlParams.get('date');
    const enrollmentIds = urlParams.get('enrollments');

    if (paymentIntentId && amount) {
      setPaymentDetails({
        paymentIntentId,
        amount: parseInt(amount),
        paymentDate: paymentDate || new Date().toISOString(),
        enrollmentIds: enrollmentIds ? JSON.parse(enrollmentIds) : []
      });
    }

    // Invalidate queries to refresh billing data
    queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
    queryClient.invalidateQueries({ queryKey: ['payment-history'] });
    
    setIsLoading(false);
  }, [searchParams]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (isLoading || !paymentDetails) {
    return (
      <ParentAppShell>
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight mb-2">
              Loading payment details...
            </h1>
          </div>
        </div>
      </ParentAppShell>
    );
  }

  return (
    <ParentAppShell>
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="text-center pb-6">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-green-700 text-2xl">Payment Successful!</CardTitle>
            <CardDescription className="text-green-600 text-lg">
              Your payment has been processed successfully
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Payment Amount */}
            <div className="text-center bg-white rounded-lg p-4 border border-green-200">
              <p className="text-sm text-muted-foreground mb-1">Payment Amount</p>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(paymentDetails.amount)}
              </p>
            </div>

            {/* Transaction Details */}
            <div className="space-y-4 bg-white rounded-lg p-4 border border-green-200">
              <h3 className="font-semibold text-gray-900 flex items-center">
                <DollarSign className="h-4 w-4 mr-2" />
                Transaction Details
              </h3>
              
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transaction ID:</span>
                  <code className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                    {paymentDetails.paymentIntentId}
                  </code>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Date:</span>
                  <span className="font-medium">
                    {formatDate(paymentDetails.paymentDate)}
                  </span>
                </div>
                
                {paymentDetails.enrollmentIds.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Enrollments:</span>
                    <Badge variant="secondary">
                      {paymentDetails.enrollmentIds.length} enrollment{paymentDetails.enrollmentIds.length > 1 ? 's' : ''}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Next Steps */}
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-3 flex items-center">
                <Calendar className="h-4 w-4 mr-2" />
                What's Next?
              </h3>
              <div className="text-sm text-blue-800 space-y-2">
                <p>• Your account will be automatically updated</p>
                <p>• You will receive class details and schedules closer to the start date</p>
                <p>• A confirmation email has been sent to your email address</p>
                <p>• If you have any questions, please contact us at support@americanseekersacademy.com</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button 
                onClick={() => navigate('/billing')}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                View Updated Billing
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => navigate('/dashboard')}
                className="flex-1"
              >
                <User className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ParentAppShell>
  );
}