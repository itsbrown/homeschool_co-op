
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { CheckCircle, ArrowRight, Calendar, CreditCard } from 'lucide-react';
import ParentAppShell from '@/components/layout/ParentAppShell';

export default function CartSuccess() {
  const [, setLocation] = useLocation();

  return (
    <ParentAppShell>
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-green-600">
            Enrollment Complete!
          </h1>
          <p className="text-muted-foreground mt-2">
            Your payment has been processed and your children have been enrolled
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>What's Next?</CardTitle>
            <CardDescription>
              Here's what you can expect after enrollment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <CreditCard className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium">Payment Confirmation</h3>
                <p className="text-sm text-muted-foreground">
                  You'll receive an email receipt with payment details and enrollment confirmation
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Calendar className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <h3 className="font-medium">Class Information</h3>
                <p className="text-sm text-muted-foreground">
                  Detailed class schedules and additional information will be sent to your email
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium">Enrollment Active</h3>
                <p className="text-sm text-muted-foreground">
                  Your children's enrollments are now active and visible in your dashboard
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            onClick={() => setLocation('/dashboard')}
            className="flex items-center gap-2"
          >
            View Dashboard
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline"
            onClick={() => setLocation('/programs')}
          >
            Browse More Classes
          </Button>
        </div>
      </div>
    </ParentAppShell>
  );
}
