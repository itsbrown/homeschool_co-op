import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calendar, DollarSign, User, FileText, CreditCard, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/currency';

interface PendingEnrollment {
  id: number;
  parentEmail: string;
  childId: number;
  childName: string;
  classId: number;
  className: string;
  totalCost: number;
  totalPaid: number;
  remainingBalance: number;
  paymentStatus: string;
  status: string;
  programStartDate: string | null;
  programEndDate: string | null;
  enrollmentDate: string;
  displayLabel: string;
}

const manualPaymentSchema = z.object({
  enrollmentId: z.number().min(1, 'Please select an enrollment'),
  amount: z.number().min(0.01, 'Amount must be greater than $0.01'),
  paymentMethod: z.string().default('manual'),
  description: z.string().optional(),
  notes: z.string().optional(),
  paymentDate: z.string().optional()
});

type ManualPaymentForm = z.infer<typeof manualPaymentSchema>;

export default function ManualPaymentEntryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<PendingEnrollment | null>(null);

  const form = useForm<ManualPaymentForm>({
    resolver: zodResolver(manualPaymentSchema),
    defaultValues: {
      enrollmentId: 0,
      amount: 0,
      paymentMethod: 'manual',
      description: '',
      notes: '',
      paymentDate: format(new Date(), 'yyyy-MM-dd')
    }
  });

  // Fetch pending enrollments with outstanding balances
  const { data: pendingEnrollmentsData, isLoading: enrollmentsLoading } = useQuery<{ success: boolean; enrollments: PendingEnrollment[] }>({
    queryKey: ['/api/school-admin/pending-enrollments'],
  });

  const pendingEnrollments = pendingEnrollmentsData?.enrollments || [];

  // Update selected enrollment when form value changes
  const watchEnrollmentId = form.watch('enrollmentId');
  useEffect(() => {
    if (watchEnrollmentId) {
      const enrollment = pendingEnrollments.find(e => e.id === watchEnrollmentId);
      setSelectedEnrollment(enrollment || null);
    } else {
      setSelectedEnrollment(null);
    }
  }, [watchEnrollmentId, pendingEnrollments]);

  const createPaymentMutation = useMutation({
    mutationFn: async (data: ManualPaymentForm) => {
      if (!selectedEnrollment) {
        throw new Error('No enrollment selected');
      }
      
      const payload = {
        enrollmentId: data.enrollmentId,
        parentEmail: selectedEnrollment.parentEmail,
        childName: selectedEnrollment.childName,
        className: selectedEnrollment.className,
        amount: data.amount,
        currency: 'usd',
        paymentMethod: data.paymentMethod,
        description: data.description,
        notes: data.notes,
        paymentDate: data.paymentDate
      };
      
      const response = await apiRequest('POST', '/api/payment-history/manual', payload);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create payment');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Payment Recorded Successfully',
        description: `Payment of ${formatCurrency(data.payment.amount)} has been applied to ${data.payment.childName}'s enrollment.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/pending-enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/enrollments'] });
      form.reset({
        enrollmentId: 0,
        amount: 0,
        paymentMethod: 'manual',
        description: '',
        notes: '',
        paymentDate: format(new Date(), 'yyyy-MM-dd')
      });
      setSelectedEnrollment(null);
      setIsSubmitting(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Payment Recording Failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsSubmitting(false);
    },
  });

  const onSubmit = (data: ManualPaymentForm) => {
    if (!selectedEnrollment) {
      toast({
        title: 'No Enrollment Selected',
        description: 'Please select an enrollment to apply the payment to.',
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);
    createPaymentMutation.mutate(data);
  };

  // Calculate if payment exceeds balance
  const paymentAmount = form.watch('amount') || 0;
  const exceedsBalance = selectedEnrollment ? paymentAmount > (selectedEnrollment.remainingBalance / 100) : false;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-primary/10 rounded-lg">
          <CreditCard className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Manual Payment Entry</h1>
          <p className="text-muted-foreground">
            Record payments made outside the online system (cash, check, bank transfer)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Payment Details
            </CardTitle>
            <CardDescription>
              Select an enrollment with an outstanding balance to apply a payment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Enrollment Selector */}
                <FormField
                  control={form.control}
                  name="enrollmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Select Enrollment
                      </FormLabel>
                      <FormControl>
                        <Select
                          value={field.value ? String(field.value) : ''}
                          onValueChange={(value) => field.onChange(parseInt(value) || 0)}
                          disabled={enrollmentsLoading}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={enrollmentsLoading ? "Loading enrollments..." : "Select an enrollment with outstanding balance"} />
                          </SelectTrigger>
                          <SelectContent>
                            {pendingEnrollments.length === 0 ? (
                              <SelectItem value="none" disabled>
                                No enrollments with outstanding balances
                              </SelectItem>
                            ) : (
                              pendingEnrollments.map((enrollment) => (
                                <SelectItem key={enrollment.id} value={String(enrollment.id)}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{enrollment.childName} - {enrollment.className}</span>
                                    <span className="text-sm text-muted-foreground">
                                      Balance: {formatCurrency(enrollment.remainingBalance)} | Parent: {enrollment.parentEmail}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormDescription>
                        Only enrollments with outstanding balances are shown
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Amount */}
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Amount ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={selectedEnrollment ? selectedEnrollment.remainingBalance / 100 : undefined}
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                          />
                        </FormControl>
                        {selectedEnrollment && (
                          <FormDescription>
                            Maximum: {formatCurrency(selectedEnrollment.remainingBalance)}
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Payment Method */}
                  <FormField
                    control={form.control}
                    name="paymentMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Method</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="check">Check</SelectItem>
                              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                              <SelectItem value="manual">Manual Entry</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Payment Date */}
                  <FormField
                    control={form.control}
                    name="paymentDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Payment Date
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Description */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Brief description of the payment"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Notes */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Additional Notes (Optional)
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Check number, reference ID, or other notes..."
                          className="min-h-[80px]"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Warning for overpayment */}
                {exceedsBalance && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Payment Exceeds Balance</AlertTitle>
                    <AlertDescription>
                      The payment amount (${paymentAmount.toFixed(2)}) exceeds the remaining balance 
                      ({formatCurrency(selectedEnrollment!.remainingBalance)}). Please adjust the amount.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Submit Button */}
                <div className="flex justify-end pt-4">
                  <Button
                    type="submit"
                    disabled={isSubmitting || createPaymentMutation.isPending || !selectedEnrollment || exceedsBalance}
                    className="min-w-[150px]"
                  >
                    {isSubmitting || createPaymentMutation.isPending ? (
                      'Recording Payment...'
                    ) : (
                      'Record Payment'
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Balance Preview Sidebar */}
        <div className="space-y-4">
          {selectedEnrollment ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  Enrollment Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Student</p>
                  <p className="font-medium">{selectedEnrollment.childName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Class/Program</p>
                  <p className="font-medium">{selectedEnrollment.className}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Parent Email</p>
                  <p className="font-medium text-sm">{selectedEnrollment.parentEmail}</p>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Cost</span>
                    <span className="font-medium">{formatCurrency(selectedEnrollment.totalCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Already Paid</span>
                    <span className="font-medium text-green-600">{formatCurrency(selectedEnrollment.totalPaid)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Remaining Balance</span>
                    <Badge variant={selectedEnrollment.remainingBalance > 0 ? "destructive" : "secondary"} className="text-base px-3">
                      {formatCurrency(selectedEnrollment.remainingBalance)}
                    </Badge>
                  </div>
                </div>

                {paymentAmount > 0 && !exceedsBalance && (
                  <>
                    <Separator />
                    <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
                        <CheckCircle className="h-4 w-4" />
                        <span className="font-medium text-sm">After Payment</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">New Balance</span>
                        <span className="font-bold">
                          {formatCurrency(selectedEnrollment.remainingBalance - (paymentAmount * 100))}
                        </span>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <p className="text-sm text-muted-foreground">Payment Status</p>
                  <Badge variant="outline" className="mt-1">
                    {selectedEnrollment.paymentStatus.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Select an enrollment to view balance details</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Outstanding Balances</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">
                {pendingEnrollments.length}
              </div>
              <p className="text-sm text-muted-foreground">
                Enrollments with unpaid balances
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
