import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, DollarSign, AlertTriangle, Calculator } from 'lucide-react';
import { calculateProRatedRefund, type ProRatedRefundResult } from '@/lib/refundCalculator';

export const REFUND_REASONS = [
  { code: 'duplicate_charge', label: 'Duplicate Charge' },
  { code: 'program_cancelled', label: 'Program/Class Cancelled' },
  { code: 'customer_request', label: 'Customer Request' },
  { code: 'sibling_adjustment', label: 'Sibling Discount Adjustment' },
  { code: 'billing_error', label: 'Billing Error' },
  { code: 'service_issue', label: 'Service Issue' },
  { code: 'withdrawal', label: 'Student Withdrawal' },
  { code: 'other', label: 'Other (specify in notes)' },
] as const;

export type RefundReasonCode = typeof REFUND_REASONS[number]['code'];

interface RefundEnrollment {
  id: number;
  childName: string;
  className: string;
  totalCost: number;
  totalPaid: number;
  remainingBalance: number;
  parentEmail?: string;
  programStartDate?: string;
  programEndDate?: string;
}

interface RefundDialogProps {
  enrollment: RefundEnrollment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function RefundDialog({ enrollment, open, onOpenChange, onSuccess }: RefundDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [refundAmountDollars, setRefundAmountDollars] = useState('');
  const [reasonCode, setReasonCode] = useState<RefundReasonCode | ''>('');
  const [notes, setNotes] = useState('');
  const [confirmPolicy, setConfirmPolicy] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const maxRefundCents = enrollment?.totalPaid || 0;
  const refundAmountCents = Math.round(parseFloat(refundAmountDollars || '0') * 100);
  const isValidAmount = refundAmountCents > 0 && refundAmountCents <= maxRefundCents;
  const isFormValid = isValidAmount && reasonCode && confirmPolicy;

  const refundMutation = useMutation({
    mutationFn: async () => {
      if (!enrollment) throw new Error('No enrollment selected');
      
      const reasonLabel = REFUND_REASONS.find(r => r.code === reasonCode)?.label || reasonCode;
      const adminComment = notes 
        ? `${reasonLabel}: ${notes}` 
        : reasonLabel;

      const response = await apiRequest(
        'POST',
        `/api/admin/enrollments/${enrollment.id}/reallocate-payment`,
        {
          targetType: 'refund',
          amount: refundAmountCents,
          adminComment,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.details || 'Failed to process refund');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Refund Processed',
        description: `Successfully refunded ${formatCurrency(refundAmountCents)} to ${enrollment?.childName}'s enrollment`,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/refunds'] });
      
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: 'Refund Failed',
        description: error.message,
        variant: 'destructive',
      });
      setShowConfirmDialog(false);
    },
  });

  const resetForm = () => {
    setRefundAmountDollars('');
    setReasonCode('');
    setNotes('');
    setConfirmPolicy(false);
    setShowConfirmDialog(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const handlePrefillMax = () => {
    setRefundAmountDollars((maxRefundCents / 100).toFixed(2));
  };

  const handlePrefillProRated = () => {
    if (proRatedResult) {
      setRefundAmountDollars((proRatedResult.proRatedAmount / 100).toFixed(2));
    }
  };

  const proRatedResult: ProRatedRefundResult | null = 
    enrollment?.programStartDate && enrollment?.programEndDate
      ? calculateProRatedRefund(
          enrollment.totalPaid,
          enrollment.programStartDate,
          enrollment.programEndDate
        )
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isFormValid) {
      setShowConfirmDialog(true);
    }
  };

  const handleConfirmRefund = () => {
    refundMutation.mutate();
  };

  if (!enrollment) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Issue Refund
            </DialogTitle>
            <DialogDescription>
              Process a refund for {enrollment.childName}'s enrollment in {enrollment.className}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Student:</span>
                <span className="font-medium">{enrollment.childName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Class:</span>
                <span className="font-medium">{enrollment.className}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Paid:</span>
                <span className="font-medium text-green-600">{formatCurrency(enrollment.totalPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Available to Refund:</span>
                <span className="font-medium">{formatCurrency(maxRefundCents)}</span>
              </div>
            </div>

            {proRatedResult && (
              <div className={`p-4 rounded-lg space-y-2 text-sm border ${
                proRatedResult.isAfterEnd 
                  ? 'bg-red-50 border-red-200' 
                  : proRatedResult.isBeforeStart 
                    ? 'bg-green-50 border-green-200'
                    : 'bg-blue-50 border-blue-200'
              }`}>
                <div className={`flex items-center gap-2 font-medium ${
                  proRatedResult.isAfterEnd 
                    ? 'text-red-800' 
                    : proRatedResult.isBeforeStart 
                      ? 'text-green-800'
                      : 'text-blue-800'
                }`}>
                  <Calculator className="h-4 w-4" />
                  Pro-rated Refund Calculator
                </div>
                <div className={`space-y-1 ${
                  proRatedResult.isAfterEnd 
                    ? 'text-red-700' 
                    : proRatedResult.isBeforeStart 
                      ? 'text-green-700'
                      : 'text-blue-700'
                }`}>
                  <div className="flex justify-between">
                    <span>Program duration:</span>
                    <span>{proRatedResult.daysTotal} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Days used:</span>
                    <span>{proRatedResult.daysUsed} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Days remaining:</span>
                    <span>{proRatedResult.daysRemaining} days</span>
                  </div>
                  <div className={`flex justify-between font-semibold border-t pt-1 mt-1 ${
                    proRatedResult.isAfterEnd 
                      ? 'border-red-200' 
                      : proRatedResult.isBeforeStart 
                        ? 'border-green-200'
                        : 'border-blue-200'
                  }`}>
                    <span>Suggested refund ({proRatedResult.refundPercentage}%):</span>
                    <span>{formatCurrency(proRatedResult.proRatedAmount)}</span>
                  </div>
                  <p className="text-xs mt-1 italic">{proRatedResult.reason}</p>
                </div>
                {proRatedResult.proRatedAmount > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePrefillProRated}
                    className={`w-full mt-2 ${
                      proRatedResult.isBeforeStart 
                        ? 'text-green-700 border-green-300 hover:bg-green-100'
                        : 'text-blue-700 border-blue-300 hover:bg-blue-100'
                    }`}
                  >
                    Use Suggested Amount
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="refund-amount">Refund Amount</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="refund-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={(maxRefundCents / 100).toFixed(2)}
                    placeholder="0.00"
                    value={refundAmountDollars}
                    onChange={(e) => setRefundAmountDollars(e.target.value)}
                    className="pl-7"
                    data-testid="input-refund-amount"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrefillMax}
                  data-testid="button-refund-max"
                >
                  Max
                </Button>
              </div>
              {refundAmountCents > maxRefundCents && (
                <p className="text-sm text-destructive">
                  Amount exceeds maximum refundable ({formatCurrency(maxRefundCents)})
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="refund-reason">Reason for Refund</Label>
              <Select value={reasonCode} onValueChange={(value) => setReasonCode(value as RefundReasonCode)}>
                <SelectTrigger id="refund-reason" data-testid="select-refund-reason">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {REFUND_REASONS.map((reason) => (
                    <SelectItem key={reason.code} value={reason.code}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="refund-notes">Additional Notes (Optional)</Label>
              <Textarea
                id="refund-notes"
                placeholder="Any additional details about this refund..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                data-testid="textarea-refund-notes"
              />
            </div>

            <div className="flex items-start space-x-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <Checkbox
                id="confirm-policy"
                checked={confirmPolicy}
                onCheckedChange={(checked) => setConfirmPolicy(checked === true)}
                data-testid="checkbox-confirm-policy"
              />
              <label
                htmlFor="confirm-policy"
                className="text-sm text-amber-800 leading-tight cursor-pointer"
              >
                I confirm this refund complies with the school's refund policy and has been properly authorized.
              </label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!isFormValid}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-submit-refund"
              >
                Issue Refund
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Refund
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>You are about to process a refund with the following details:</p>
                <div className="bg-muted p-3 rounded-lg space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Amount:</span>
                    <span className="font-semibold text-red-600">{formatCurrency(refundAmountCents)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Student:</span>
                    <span className="font-medium">{enrollment.childName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Reason:</span>
                    <span className="font-medium">
                      {REFUND_REASONS.find(r => r.code === reasonCode)?.label}
                    </span>
                  </div>
                </div>
                <p className="text-amber-600 font-medium">
                  This action will process the refund through Stripe and cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refundMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRefund}
              disabled={refundMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {refundMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Confirm Refund'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
