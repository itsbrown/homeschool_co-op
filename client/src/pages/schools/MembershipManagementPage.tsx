import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from "@/hooks/useAuth0";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Calendar, DollarSign, FileText, UserCheck, Users, Filter } from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';

// Form schema for manual payment recording
const paymentSchema = z.object({
  amount: z.number().min(0, "Amount must be positive"),
  paymentMethod: z.enum(["credit_card", "paypal", "bank_transfer", "cash", "check", "other"]),
  paymentDate: z.string().optional(),
  notes: z.string().optional(),
});

// Form schema for membership update
const updateSchema = z.object({
  status: z.enum(["pending_payment", "active", "expired", "grace_period", "suspended"]).optional(),
  expirationDate: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;
type UpdateFormData = z.infer<typeof updateSchema>;

export default function MembershipManagementPage() {
  const { user, getAccessTokenSilently } = useAuth();
  const { toast } = useToast();
  const [selectedMembership, setSelectedMembership] = useState<any>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch memberships for authenticated admin's school
  const { data: memberships, isLoading } = useQuery({
    queryKey: ['/api/admin/memberships/my-school'],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      const response = await fetch('/api/admin/memberships/my-school', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch memberships');
      }
      return response.json();
    },
    enabled: !!user
  });

  // Fetch summary for authenticated admin's school
  const { data: summary } = useQuery({
    queryKey: ['/api/admin/memberships/my-school/summary'],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      const response = await fetch('/api/admin/memberships/my-school/summary', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch summary');
      }
      return response.json();
    },
    enabled: !!user
  });

  // Payment form
  const paymentForm = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: 0,
      paymentMethod: "check",
      paymentDate: format(new Date(), 'yyyy-MM-dd'),
      notes: ""
    }
  });

  // Update form
  const updateForm = useForm<UpdateFormData>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      status: "active",
      notes: ""
    }
  });

  // Record payment mutation
  const recordPayment = useMutation({
    mutationFn: async (data: PaymentFormData & { membershipId: number }) => {
      const token = await getAccessTokenSilently();
      return await apiRequest(
        `/api/admin/memberships/${data.membershipId}/payment`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: Math.round(data.amount * 100), // Convert to cents
            paymentMethod: data.paymentMethod,
            paymentDate: data.paymentDate,
            notes: data.notes
          })
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/memberships/my-school'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/memberships/my-school/summary'] });
      toast({
        title: "Payment recorded",
        description: "Membership payment has been recorded successfully"
      });
      setPaymentDialogOpen(false);
      paymentForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive"
      });
    }
  });

  // Update membership mutation
  const updateMembership = useMutation({
    mutationFn: async (data: UpdateFormData & { membershipId: number }) => {
      const token = await getAccessTokenSilently();
      return await apiRequest(
        `/api/admin/memberships/${data.membershipId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/memberships/my-school'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/memberships/my-school/summary'] });
      toast({
        title: "Membership updated",
        description: "Membership has been updated successfully"
      });
      setUpdateDialogOpen(false);
      updateForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update membership",
        variant: "destructive"
      });
    }
  });

  const handleOpenPaymentDialog = (membership: any) => {
    setSelectedMembership(membership);
    paymentForm.reset({
      amount: membership.remainingBalance / 100, // Convert from cents
      paymentMethod: "check",
      paymentDate: format(new Date(), 'yyyy-MM-dd'),
      notes: `Payment for ${membership.membershipYear} membership`
    });
    setPaymentDialogOpen(true);
  };

  const handleOpenUpdateDialog = (membership: any) => {
    setSelectedMembership(membership);
    updateForm.reset({
      status: membership.status || "pending_payment",
      expirationDate: membership.expirationDate ? format(new Date(membership.expirationDate), 'yyyy-MM-dd') : undefined,
      notes: membership.notes || ""
    });
    setUpdateDialogOpen(true);
  };

  const onSubmitPayment = (data: PaymentFormData) => {
    if (selectedMembership) {
      recordPayment.mutate({ ...data, membershipId: selectedMembership.id });
    }
  };

  const onSubmitUpdate = (data: UpdateFormData) => {
    if (selectedMembership) {
      updateMembership.mutate({ ...data, membershipId: selectedMembership.id });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      'active': { variant: 'default', label: 'Active' },
      'pending_payment': { variant: 'secondary', label: 'Pending Payment' },
      'partial_payment': { variant: 'secondary', label: 'Partial Payment' },
      'grace_period': { variant: 'outline', label: 'Grace Period' },
      'expired': { variant: 'destructive', label: 'Expired' },
      'suspended': { variant: 'destructive', label: 'Suspended' }
    };
    const config = variants[status] || { variant: 'secondary', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const filteredMemberships = memberships?.filter((m: any) => {
    if (statusFilter === 'all') return true;
    return m.status === statusFilter;
  }) || [];

  if (isLoading) {
    return <div className="p-8">Loading memberships...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="membership-management-page">
      <div>
        <h1 className="text-3xl font-bold">Membership Management</h1>
        <p className="text-muted-foreground">Manage school memberships and payments</p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-600">
                <UserCheck className="h-4 w-4" />
                Active
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{summary.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-600">
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{summary.pending + summary.partial}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-600">
                Expired
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{summary.expired}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Outstanding
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${(summary.totalOutstanding / 100).toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="filter-status">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending_payment">Pending Payment</SelectItem>
                <SelectItem value="partial_payment">Partial Payment</SelectItem>
                <SelectItem value="grace_period">Grace Period</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Memberships Table */}
      <Card>
        <CardHeader>
          <CardTitle>Memberships ({filteredMemberships.length})</CardTitle>
          <CardDescription>View and manage all parent memberships</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parent</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Expiration</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMemberships.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No memberships found
                  </TableCell>
                </TableRow>
              ) : (
                filteredMemberships.map((membership: any) => (
                  <TableRow key={membership.id} data-testid={`membership-row-${membership.id}`}>
                    <TableCell className="font-medium">{membership.parentName}</TableCell>
                    <TableCell>{membership.parentEmail}</TableCell>
                    <TableCell>{membership.membershipYear}</TableCell>
                    <TableCell>{getStatusBadge(membership.status)}</TableCell>
                    <TableCell>${(membership.amount / 100).toFixed(2)}</TableCell>
                    <TableCell>${(membership.amountPaid / 100).toFixed(2)}</TableCell>
                    <TableCell className={membership.remainingBalance > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                      ${(membership.remainingBalance / 100).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {membership.expirationDate ? format(new Date(membership.expirationDate), 'MMM dd, yyyy') : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenPaymentDialog(membership)}
                          data-testid={`button-record-payment-${membership.id}`}
                        >
                          <DollarSign className="h-4 w-4 mr-1" />
                          Payment
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenUpdateDialog(membership)}
                          data-testid={`button-update-${membership.id}`}
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          Update
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent data-testid="payment-dialog">
          <DialogHeader>
            <DialogTitle>Record Manual Payment</DialogTitle>
            <DialogDescription>
              Record an offline payment for {selectedMembership?.parentName}'s membership
            </DialogDescription>
          </DialogHeader>
          <Form {...paymentForm}>
            <form onSubmit={paymentForm.handleSubmit(onSubmitPayment)} className="space-y-4">
              <FormField
                control={paymentForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                        data-testid="input-payment-amount"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={paymentForm.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-payment-method">
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="credit_card">Credit Card</SelectItem>
                        <SelectItem value="paypal">PayPal</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={paymentForm.control}
                name="paymentDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-payment-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={paymentForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Add any notes about this payment..." {...field} data-testid="input-payment-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setPaymentDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={recordPayment.isPending} data-testid="button-submit-payment">
                  {recordPayment.isPending ? "Recording..." : "Record Payment"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Update Dialog */}
      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent data-testid="update-dialog">
          <DialogHeader>
            <DialogTitle>Update Membership</DialogTitle>
            <DialogDescription>
              Update membership status and details for {selectedMembership?.parentName}
            </DialogDescription>
          </DialogHeader>
          <Form {...updateForm}>
            <form onSubmit={updateForm.handleSubmit(onSubmitUpdate)} className="space-y-4">
              <FormField
                control={updateForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="pending_payment">Pending Payment</SelectItem>
                        <SelectItem value="grace_period">Grace Period</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={updateForm.control}
                name="expirationDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiration Date (optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-expiration-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={updateForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Add any notes..." {...field} data-testid="input-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setUpdateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMembership.isPending} data-testid="button-submit-update">
                  {updateMembership.isPending ? "Updating..." : "Update Membership"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
