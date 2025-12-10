import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Calendar, DollarSign, User, FileText, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency, centsToDollars } from '@/utils/currency';
const manualPaymentSchema = z.object({
  parentEmail: z.string().email('Please enter a valid email address'),
  childName: z.string().min(1, 'Child name is required'),
  className: z.string().min(1, 'Class name is required'),
  amount: z.number().min(0.01, 'Amount must be greater than $0.01'),
  currency: z.string().default('usd'),
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
  const [showCustomChild, setShowCustomChild] = useState(false);
  const [showCustomClass, setShowCustomClass] = useState(false);

  const form = useForm<ManualPaymentForm>({
    resolver: zodResolver(manualPaymentSchema),
    defaultValues: {
      parentEmail: '',
      childName: '',
      className: '',
      amount: 0,
      currency: 'usd',
      paymentMethod: 'manual',
      description: '',
      notes: '',
      paymentDate: format(new Date(), 'yyyy-MM-dd')
    }
  });

  // Fetch parent users for selection
  const { data: allUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ['/api/school-admin/users'],
  });
  
  const parentUsers = Array.isArray(allUsers) ? allUsers.filter((user: any) => user.role === 'parent') : [];

  // Fetch children for selection
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ['/api/school-admin/students'],
  });
  
  const children = Array.isArray(studentsData) ? studentsData : [];

  // Fetch classes for selection
  const { data: classesData, isLoading: classesLoading } = useQuery({
    queryKey: ['/api/school-admin/classes'],
  });
  
  const classes = classesData?.items || classesData?.classes || [];

  const createPaymentMutation = useMutation({
    mutationFn: async (data: ManualPaymentForm) => {
      const response = await apiRequest('POST', '/api/payment-history/manual', data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create payment');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Payment Created Successfully',
        description: `Manual payment of ${formatCurrency(data.payment.amount)} has been recorded for ${data.payment.childName}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-history'] });
      form.reset();
      setIsSubmitting(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Payment Creation Failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsSubmitting(false);
    },
  });

  const onSubmit = (data: ManualPaymentForm) => {
    setIsSubmitting(true);
    createPaymentMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-primary/10 rounded-lg">
          <CreditCard className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Manual Payment Entry</h1>
          <p className="text-muted-foreground">
            Record payments made outside the online system
          </p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Payment Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Parent Email */}
                <FormField
                  control={form.control}
                  name="parentEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Parent Email
                      </FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select parent" />
                          </SelectTrigger>
                          <SelectContent>
                            {parentUsers.map((user: any) => (
                              <SelectItem key={user.email} value={user.email}>
                                {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.fullName || user.email} ({user.email})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Child Name */}
                <FormField
                  control={form.control}
                  name="childName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Child Name</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            if (value === 'custom') {
                              setShowCustomChild(true);
                              field.onChange('');
                            } else {
                              setShowCustomChild(false);
                              field.onChange(value);
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select child" />
                          </SelectTrigger>
                          <SelectContent>
                            {children.map((child: any, index: number) => {
                              const childName = child.firstName && child.lastName ? `${child.firstName} ${child.lastName}` : child.name;
                              // Create unique key using ID and index to avoid duplicates
                              const uniqueKey = `child-${child.id}-${index}`;
                              return (
                                <SelectItem key={uniqueKey} value={childName}>
                                  {childName}
                                  {child.parentEmail && ` (Parent: ${child.parentEmail})`}
                                </SelectItem>
                              );
                            })}
                            <SelectItem value="custom">Enter custom name...</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Custom Child Name Input */}
                {showCustomChild && (
                  <FormField
                    control={form.control}
                    name="childName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom Child Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Enter child's full name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Class Name */}
                <FormField
                  control={form.control}
                  name="className"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Class/Program</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            if (value === 'custom') {
                              setShowCustomClass(true);
                              field.onChange('');
                            } else {
                              setShowCustomClass(false);
                              field.onChange(value);
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select class or enter custom" />
                          </SelectTrigger>
                          <SelectContent>
                            {classes.map((cls: any) => (
                              <SelectItem key={cls.id} value={cls.title || cls.name}>
                                {cls.title || cls.name} {cls.price && `- $${(cls.price / 100).toFixed(2)}`}
                              </SelectItem>
                            ))}
                            <SelectItem value="custom">Enter custom class...</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Custom Class Name Input */}
                {showCustomClass && (
                  <FormField
                    control={form.control}
                    name="className"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom Class Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Enter class/program name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* Amount - moved outside grid for better spacing */}
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
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                        />
                      </FormControl>
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
                            <SelectItem value="manual">Manual Entry</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="check">Check</SelectItem>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
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
                        placeholder="Any additional information about this payment..."
                        className="min-h-[100px]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Submit Button */}
              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={isSubmitting || createPaymentMutation.isPending}
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

      {/* Recent Manual Payments */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Manual Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            Manual payments will appear in the regular payment history once recorded.
            Visit the payment history page to view all payments.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}