import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  FileText, 
  Download, 
  Printer, 
  Check, 
  ArrowLeft, 
  AlertCircle, 
  Shield,
  Clock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useSupabase } from '@/components/SupabaseProvider';
import { marked } from 'marked';

interface AgreementTemplate {
  schoolId: number;
  schoolName: string;
  agreementTemplate: string;
  agreementVersion: string;
  updatedAt: string | null;
}

interface AgreementStatus {
  hasSigned: boolean;
  currentVersion: string;
  latestSignedVersion: string | null;
  signedAt: string | null;
  requiresNewSignature: boolean;
}

export default function MembershipAgreementPage() {
  const [, navigate] = useLocation();
  const { session } = useSupabase();
  const { toast } = useToast();
  const contentRef = useRef<HTMLDivElement>(null);
  
  const [signatoryName, setSignatoryName] = useState('');
  const [hasReadAgreement, setHasReadAgreement] = useState(false);
  const [agreesToTerms, setAgreesToTerms] = useState(false);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);

  const searchParams = new URLSearchParams(window.location.search);
  const schoolId = searchParams.get('schoolId');
  const returnUrl = searchParams.get('return') || '/parent/dashboard';

  const getAuthHeaders = (): HeadersInit => {
    const token = session?.access_token || localStorage.getItem('supabase_token');
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  };

  const { data: agreement, isLoading: agreementLoading, error: agreementError } = useQuery<AgreementTemplate>({
    queryKey: ['membership-agreement-template', schoolId],
    queryFn: async () => {
      const response = await fetch(`/api/schools/${schoolId}/membership-agreement`);
      if (!response.ok) {
        throw new Error('Failed to fetch agreement');
      }
      return response.json();
    },
    enabled: !!schoolId,
  });

  const { data: agreementStatus, isLoading: statusLoading } = useQuery<AgreementStatus>({
    queryKey: ['agreement-status', schoolId],
    queryFn: async () => {
      const response = await fetch(`/api/parent/agreements/check/${schoolId}`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error('Failed to check agreement status');
      }
      return response.json();
    },
    enabled: !!schoolId && !!session,
  });

  const signAgreement = useMutation({
    mutationFn: async (data: { schoolId: number; signatoryName: string; agreedToTerms: boolean }) => {
      const response = await apiRequest('POST', '/api/parent/agreements/sign', data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to sign agreement');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Agreement Signed Successfully',
        description: 'Your membership agreement has been recorded. Proceeding to payment...',
      });
      
      queryClient.invalidateQueries({ queryKey: ['agreement-status', schoolId] });
      queryClient.invalidateQueries({ queryKey: ['parent-documents'] });
      
      setTimeout(() => {
        navigate(returnUrl);
      }, 1500);
    },
    onError: (error: Error) => {
      toast({
        title: 'Signing Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (isAtBottom) {
      setHasScrolledToEnd(true);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow && agreement) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${agreement.schoolName} - Membership Agreement</title>
          <style>
            body { 
              font-family: Georgia, serif; 
              line-height: 1.6; 
              padding: 40px; 
              max-width: 800px; 
              margin: 0 auto; 
            }
            h1, h2, h3 { font-family: Arial, sans-serif; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .version { color: #666; font-size: 0.9em; }
            .content { margin-bottom: 40px; }
            .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 20px; font-size: 0.9em; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${agreement.schoolName}</h1>
            <h2>Membership Agreement</h2>
            <p class="version">Version ${agreement.agreementVersion}</p>
          </div>
          <div class="content">${marked(agreement.agreementTemplate)}</div>
          <div class="footer">
            <p>Printed on: ${new Date().toLocaleString()}</p>
          </div>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleDownload = () => {
    if (agreement) {
      const content = `
${agreement.schoolName}
MEMBERSHIP AGREEMENT
Version ${agreement.agreementVersion}
${'='.repeat(50)}

${agreement.agreementTemplate}

${'='.repeat(50)}
Downloaded on: ${new Date().toLocaleString()}
      `.trim();
      
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `membership-agreement-${agreement.schoolName.replace(/\s+/g, '-').toLowerCase()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!signatoryName.trim() || signatoryName.trim().length < 2) {
      toast({
        title: 'Invalid Name',
        description: 'Please enter your full legal name.',
        variant: 'destructive',
      });
      return;
    }

    if (!hasReadAgreement || !agreesToTerms) {
      toast({
        title: 'Agreement Required',
        description: 'You must read and agree to the terms before signing.',
        variant: 'destructive',
      });
      return;
    }

    signAgreement.mutate({
      schoolId: parseInt(schoolId!),
      signatoryName: signatoryName.trim(),
      agreedToTerms: true,
    });
  };

  const handleDecline = () => {
    toast({
      title: 'Agreement Declined',
      description: 'You must sign the membership agreement to proceed with enrollment.',
    });
    navigate('/parent/dashboard');
  };

  if (!schoolId) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Invalid request. Please return to your dashboard and try again.
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate('/parent/dashboard')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Return to Dashboard
        </Button>
      </div>
    );
  }

  if (agreementLoading || statusLoading) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96 mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[400px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (agreementError || !agreement) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load membership agreement. Please try again later.
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate('/parent/dashboard')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Return to Dashboard
        </Button>
      </div>
    );
  }

  if (agreementStatus?.hasSigned) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <CardTitle>Agreement Already Signed</CardTitle>
                <CardDescription>
                  You have already signed the current version of this agreement.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-800">
                <Shield className="h-5 w-5" />
                <span className="font-medium">Agreement Confirmed</span>
              </div>
              <div className="mt-2 text-sm text-green-700 space-y-1">
                <p>Version: {agreementStatus.latestSignedVersion}</p>
                <p>Signed on: {new Date(agreementStatus.signedAt!).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={() => navigate(returnUrl)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Continue
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <Card className="shadow-lg">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">{agreement.schoolName}</CardTitle>
                <CardDescription>Membership Agreement</CardDescription>
              </div>
            </div>
            <div className="text-right">
              <Badge variant="outline" className="text-xs">
                Version {agreement.agreementVersion}
              </Badge>
              {agreement.updatedAt && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center justify-end gap-1">
                  <Clock className="h-3 w-3" />
                  Last updated: {new Date(agreement.updatedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="flex justify-end gap-2 p-4 bg-muted/50 border-b">
            <Button variant="outline" size="sm" onClick={handleDownload} data-testid="button-download">
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>

          <ScrollArea 
            className="h-[400px] p-6" 
            onScrollCapture={handleScroll}
            data-testid="agreement-content"
          >
            <div 
              ref={contentRef}
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: marked(agreement.agreementTemplate) }}
            />
          </ScrollArea>

          <Separator />

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <Alert className="bg-blue-50 border-blue-200">
              <Shield className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                <strong>Legal Notice:</strong> By signing below, you are entering into a legally binding agreement. 
                Please read the entire agreement carefully before signing. Your electronic signature has the same 
                legal effect as a handwritten signature.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="hasRead"
                  checked={hasReadAgreement}
                  onCheckedChange={(checked) => setHasReadAgreement(checked === true)}
                  data-testid="checkbox-has-read"
                />
                <Label htmlFor="hasRead" className="text-sm leading-normal cursor-pointer">
                  I have read and understand the complete membership agreement above.
                  {!hasScrolledToEnd && (
                    <span className="text-muted-foreground ml-1">
                      (Please scroll to the end of the agreement)
                    </span>
                  )}
                </Label>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="agreesToTerms"
                  checked={agreesToTerms}
                  onCheckedChange={(checked) => setAgreesToTerms(checked === true)}
                  data-testid="checkbox-agrees-terms"
                />
                <Label htmlFor="agreesToTerms" className="text-sm leading-normal cursor-pointer">
                  I agree to be bound by the terms and conditions of this membership agreement. I understand that 
                  my membership is subject to these terms and that violations may result in termination.
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="signatoryName">
                Electronic Signature (Type your full legal name)
              </Label>
              <Input
                id="signatoryName"
                type="text"
                placeholder="Enter your full legal name"
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
                className="font-serif text-lg"
                data-testid="input-signatory-name"
              />
              <p className="text-xs text-muted-foreground">
                By typing your name above, you consent to signing this agreement electronically.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleDecline}
                className="sm:flex-1"
                data-testid="button-decline"
              >
                Decline & Return
              </Button>
              <Button
                type="submit"
                disabled={!hasReadAgreement || !agreesToTerms || !signatoryName.trim() || signAgreement.isPending}
                className="sm:flex-1"
                data-testid="button-sign-agreement"
              >
                {signAgreement.isPending ? (
                  <>Signing...</>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Sign Agreement & Continue
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="mt-4 text-center text-sm text-muted-foreground">
        <p>
          This electronic signature complies with the Electronic Signatures in Global and National Commerce Act (E-SIGN Act) 
          and the Uniform Electronic Transactions Act (UETA).
        </p>
      </div>
    </div>
  );
}
