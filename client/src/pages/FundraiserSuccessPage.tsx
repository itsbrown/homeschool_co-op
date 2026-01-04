import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

export default function FundraiserSuccessPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl" data-testid="success-title">Thank You for Your Order!</CardTitle>
          <CardDescription>
            Your payment has been processed successfully.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Your order confirmation has been sent to your email. The seller will earn credits from your purchase to help support their school community.
          </p>
          <Button 
            onClick={() => setLocation('/')} 
            className="w-full"
            data-testid="button-return-home"
          >
            Return to Homepage
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
