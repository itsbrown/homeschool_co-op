import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface RefundPolicyNoticeProps {
  variant?: 'default' | 'compact';
}

export function RefundPolicyNotice({ variant = 'default' }: RefundPolicyNoticeProps) {
  if (variant === 'compact') {
    return (
      <p className="text-xs text-muted-foreground">
        By completing this purchase, you agree to our refund policy. Full refunds are available before class start dates. Pro-rated refunds may apply after.
      </p>
    );
  }

  return (
    <Alert className="bg-blue-50 border-blue-200">
      <AlertCircle className="h-4 w-4 text-blue-600" />
      <AlertTitle className="text-blue-800">Refund Policy</AlertTitle>
      <AlertDescription className="text-blue-700 text-sm space-y-2">
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Before class starts:</strong> Full refund available</li>
          <li><strong>After class starts:</strong> Pro-rated refund based on remaining sessions</li>
          <li><strong>After 50% of sessions completed:</strong> No refund available</li>
          <li><strong>Processing time:</strong> Refunds are processed within 5-7 business days</li>
        </ul>
        <p className="text-xs mt-2">
          To request a refund, please contact your school administrator.
        </p>
      </AlertDescription>
    </Alert>
  );
}
