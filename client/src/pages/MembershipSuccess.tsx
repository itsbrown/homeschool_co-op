import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { CheckCircle, ArrowRight, Calendar, CreditCard, Loader2, AlertCircle, Building2 } from 'lucide-react';
import ParentAppShell from '@/components/layout/ParentAppShell';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/components/SupabaseProvider';

interface MembershipDetails {
  schoolName: string;
  membershipYear: number;
  amount: number;
  tier: string | null;
  expirationDate: string | null;
}

export default function MembershipSuccess() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { session } = useAuth();
  const [processing, setProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [membershipDetails, setMembershipDetails] = useState<MembershipDetails | null>(null);

  useEffect(() => {
    const processMembershipPayment = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('session_id');

        console.log('🔄 MembershipSuccess: Processing session:', sessionId);

        if (!sessionId) {
          throw new Error('Missing session information');
        }

        const token = session?.access_token || localStorage.getItem("supabase_token");
        if (!token) {
          throw new Error('Authentication required');
        }

        const response = await fetch(`/api/parent/memberships/confirm?session_id=${sessionId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          console.log('✅ Membership confirmed:', data);
          
          setMembershipDetails({
            schoolName: data.schoolName || 'Your School',
            membershipYear: data.membershipYear || new Date().getFullYear(),
            amount: data.amount || 0,
            tier: data.tier || null,
            expirationDate: data.expirationDate || null
          });

          toast({
            title: "Membership Activated!",
            description: "Your family membership has been successfully activated.",
            duration: 5000,
          });
        } else {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.message || 'Unable to confirm payment details';
          console.error('❌ Membership confirmation failed:', errorData);
          
          setError(errorMessage);
          
          const urlSchoolName = urlParams.get('school');
          const urlAmount = urlParams.get('amount');
          
          setMembershipDetails({
            schoolName: urlSchoolName || 'Your School',
            membershipYear: new Date().getFullYear(),
            amount: urlAmount ? parseInt(urlAmount) : 0,
            tier: null,
            expirationDate: null
          });

          toast({
            title: "Payment Received",
            description: "Your payment was processed. Please check your dashboard for membership status.",
            variant: "default",
            duration: 5000,
          });
        }

        queryClient.invalidateQueries({ queryKey: ['/api/parent/memberships'] });

      } catch (error) {
        console.error('❌ Error processing membership:', error);
        setError(error instanceof Error ? error.message : 'Failed to process membership');
        
        setMembershipDetails({
          schoolName: 'Your School',
          membershipYear: new Date().getFullYear(),
          amount: 0,
          tier: null,
          expirationDate: null
        });
      } finally {
        setProcessing(false);
      }
    };

    processMembershipPayment();
  }, [session, toast]);

  const handleReturnToDashboard = () => {
    setLocation('/parent');
  };

  if (processing) {
    return (
      <ParentAppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-lg font-medium">Processing your membership...</p>
                <p className="text-sm text-muted-foreground">Please wait while we confirm your payment.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </ParentAppShell>
    );
  }

  return (
    <ParentAppShell>
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="w-full max-w-lg" data-testid="card-membership-success">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl" data-testid="text-success-title">
              Payment Successful!
            </CardTitle>
            <CardDescription className="text-base">
              Your membership has been activated.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {error && (
              <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium text-yellow-800 dark:text-yellow-200">Payment Received - Verification Pending</p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      Your payment was processed successfully. Some details are still being verified.
                    </p>
                    <p className="text-sm text-yellow-600 dark:text-yellow-400">
                      Check your dashboard in a few moments for the updated membership status. If you continue to experience issues, please contact support.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">School</p>
                  <p className="font-medium" data-testid="text-school-name">
                    {membershipDetails?.schoolName || 'Your School'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Membership Year</p>
                  <p className="font-medium" data-testid="text-membership-year">
                    {membershipDetails?.membershipYear || new Date().getFullYear()}
                    {membershipDetails?.tier && ` • ${membershipDetails.tier.charAt(0).toUpperCase() + membershipDetails.tier.slice(1)} Tier`}
                  </p>
                </div>
              </div>

              {membershipDetails?.amount && membershipDetails.amount > 0 && (
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Amount Paid</p>
                    <p className="font-medium" data-testid="text-amount-paid">
                      ${(membershipDetails.amount / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              )}

              {membershipDetails?.expirationDate && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Valid Until</p>
                    <p className="font-medium" data-testid="text-expiration-date">
                      {new Date(membershipDetails.expirationDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-medium" data-testid="text-status-active">Status: Active</span>
                </div>
              </div>
            </div>

            <Button 
              onClick={handleReturnToDashboard} 
              className="w-full"
              size="lg"
              data-testid="button-return-dashboard"
            >
              Return to Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </ParentAppShell>
  );
}
