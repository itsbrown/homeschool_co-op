import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from "@/components/SupabaseProvider";
import { useRole } from "@/contexts/RoleContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Calendar, DollarSign, FileText, UserCheck, Users, Filter, Search, CheckSquare, Wrench, AlertCircle } from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { cn, formatDate } from '@/lib/utils';

const paymentSchema = z.object({
  amount: z.number().min(0, "Amount must be positive"),
  paymentMethod: z.enum(["credit_card", "paypal", "bank_transfer", "cash", "check", "other"]),
  paymentDate: z.string().optional(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  status: z.enum(["pending_payment", "active", "enrolled", "expired", "grace_period", "suspended"]).optional(),
  expirationDate: z.string().optional(),
  notes: z.string().optional(),
});

const expirationDateSchema = z.object({
  expirationDate: z.string().min(1, "Expiration date is required"),
});

type PaymentFormData = z.infer<typeof paymentSchema>;
type UpdateFormData = z.infer<typeof updateSchema>;
type ExpirationDateFormData = z.infer<typeof expirationDateSchema>;

interface MembershipSummary {
  total: number;
  active: number;
  pending: number;
  partial: number;
  expired: number;
  totalOutstanding: number;
}

interface MembershipRecord {
  id: number;
  parentUserId: number;
  parentName?: string;
  parentEmail?: string;
  schoolId: number;
  membershipYear: number;
  status: 'pending_payment' | 'active' | 'enrolled' | 'expired' | 'grace_period' | 'suspended' | 'partial_payment';
  amount: number;
  amountPaid: number;
  remainingBalance: number;
  totalAmount: number;
  balanceDue: number;
  dueDate?: string | null;
  expirationDate?: string | null;
  gracePeriodEnd?: string | null;
  renewalDate?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  membershipTier?: string;
}

interface WinterPreviewItem {
  membershipId: number;
  parentName: string;
  parentEmail: string;
  amountPaid: number;
  totalAmount: number;
  currentStatus: string;
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
    case 'enrolled':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'grace_period':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'pending_payment':
    case 'partial_payment':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'expired':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'suspended':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: 'Active',
    enrolled: 'Active',
    grace_period: 'Grace Period',
    pending_payment: 'Pending',
    partial_payment: 'Partial',
    expired: 'Expired',
    suspended: 'Suspended',
  };
  return labels[status] || status;
}

function getDaysLabel(membership: MembershipRecord): { text: string; className: string } {
  if (!membership.expirationDate) return { text: 'N/A', className: 'text-muted-foreground' };

  const now = new Date();
  const exp = new Date(membership.expirationDate);
  const diff = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0) {
    return { text: `${Math.abs(diff)}d overdue`, className: 'text-red-600 font-semibold' };
  }
  if (diff <= 30) {
    return { text: `${diff}d left`, className: 'text-yellow-600 font-semibold' };
  }
  return { text: `${diff}d left`, className: 'text-green-600' };
}

export default function MembershipManagementPage() {
  const { user } = useAuth();
  const { activeRole } = useRole();
  const { toast } = useToast();
  const [selectedMembership, setSelectedMembership] = useState<MembershipRecord | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [bulkActionDialog, setBulkActionDialog] = useState<{
    open: boolean;
    action: 'paid' | 'pending' | 'expiration' | null;
  }>({ open: false, action: null });

  const [winterSessionDialogOpen, setWinterSessionDialogOpen] = useState(false);
  const [winterSessionApplyDialogOpen, setWinterSessionApplyDialogOpen] = useState(false);


  const expirationForm = useForm<ExpirationDateFormData>({
    resolver: zodResolver(expirationDateSchema),
    defaultValues: { expirationDate: '' },
  });

  const { data: memberships, isLoading } = useQuery<MembershipRecord[]>({
    queryKey: ['/api/admin/memberships/my-school'],
    enabled: !!user,
  });

  const { data: summary } = useQuery<MembershipSummary>({
    queryKey: ['/api/admin/memberships/my-school/summary'],
    enabled: !!user,
  });

  const { data: winterPreview, isLoading: isLoadingWinterPreview, refetch: refetchWinterPreview } = useQuery<WinterPreviewItem[]>({
    queryKey: ['/api/admin/memberships/winter-session-fix-preview'],
    enabled: false,
  });

  const paymentForm = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: 0,
      paymentMethod: "check",
      paymentDate: format(new Date(), 'yyyy-MM-dd'),
      notes: ""
    }
  });

  const updateForm = useForm<UpdateFormData>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      status: "active",
      notes: ""
    }
  });

  const recordPayment = useMutation({
    mutationFn: async (data: PaymentFormData & { membershipId: number }) => {
      const res = await apiRequest('POST', `/api/admin/memberships/${data.membershipId}/payment`, {
        amount: Math.round(data.amount * 100),
        paymentMethod: data.paymentMethod,
        paymentDate: data.paymentDate,
        notes: data.notes
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/memberships/my-school'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/memberships/my-school/summary'] });
      toast({ title: "Payment recorded", description: "Membership payment has been recorded successfully" });
      setPaymentDialogOpen(false);
      paymentForm.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to record payment", variant: "destructive" });
    }
  });

  const updateMembership = useMutation({
    mutationFn: async (data: UpdateFormData & { membershipId: number }) => {
      const res = await apiRequest('PATCH', `/api/admin/memberships/${data.membershipId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/memberships/my-school'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/memberships/my-school/summary'] });
      toast({ title: "Membership updated", description: "Membership has been updated successfully" });
      setUpdateDialogOpen(false);
      updateForm.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update membership", variant: "destructive" });
    }
  });

  const bulkUpdate = useMutation({
    mutationFn: async ({ membershipIds, updates }: { membershipIds: number[]; updates: Partial<MembershipRecord> }) => {
      const res = await apiRequest('PATCH', '/api/admin/memberships/bulk-update', { membershipIds, updates });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/memberships/my-school'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/memberships/my-school/summary'] });
      toast({ title: "Bulk update complete", description: `Updated ${data.updatedCount} membership(s)` });
      setBulkActionDialog({ open: false, action: null });
      setSelectedIds(new Set());
      expirationForm.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to bulk update memberships", variant: "destructive" });
    }
  });

  const applyWinterFix = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/memberships/winter-session-fix-apply', {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/memberships/my-school'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/memberships/my-school/summary'] });
      toast({ title: "Winter Session Fix Applied", description: `Fixed ${data.updatedCount} membership(s)` });
      setWinterSessionApplyDialogOpen(false);
      setWinterSessionDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to apply winter session fix", variant: "destructive" });
    }
  });

  const handleOpenPaymentDialog = (membership: MembershipRecord) => {
    setSelectedMembership(membership);
    paymentForm.reset({
      amount: (membership.remainingBalance || 0) / 100,
      paymentMethod: "check",
      paymentDate: format(new Date(), 'yyyy-MM-dd'),
      notes: `Payment for ${membership.membershipYear} membership`
    });
    setPaymentDialogOpen(true);
  };

  const handleOpenUpdateDialog = (membership: MembershipRecord) => {
    setSelectedMembership(membership);
    const validStatuses = ["pending_payment", "active", "enrolled", "expired", "grace_period", "suspended"] as const;
    const formStatus = validStatuses.includes(membership.status as typeof validStatuses[number])
      ? (membership.status as typeof validStatuses[number])
      : "pending_payment";
    updateForm.reset({
      status: formStatus,
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

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredMemberships.map((m: MembershipRecord) => m.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: number, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelectedIds(next);
  };

  const handleOpenBulkAction = (action: 'paid' | 'pending' | 'expiration') => {
    setBulkActionDialog({ open: true, action });
    if (action === 'expiration') {
      expirationForm.reset({ expirationDate: '' });
    }
  };

  const handleConfirmBulkAction = () => {
    const ids = Array.from(selectedIds);
    if (bulkActionDialog.action === 'paid') {
      bulkUpdate.mutate({ membershipIds: ids, updates: { status: 'enrolled', balanceDue: 0, remainingBalance: 0 } });
    } else if (bulkActionDialog.action === 'pending') {
      bulkUpdate.mutate({ membershipIds: ids, updates: { status: 'pending_payment' } });
    } else if (bulkActionDialog.action === 'expiration') {
      const formValues = expirationForm.getValues();
      if (!formValues.expirationDate) return;
      bulkUpdate.mutate({ membershipIds: ids, updates: { expirationDate: formValues.expirationDate } });
    }
  };

  const handleWinterSessionFix = async () => {
    await refetchWinterPreview();
    setWinterSessionDialogOpen(true);
  };

  const allMemberships: MembershipRecord[] = memberships || [];
  const filteredMemberships = allMemberships.filter((m: MembershipRecord) => {
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery ||
      (m.parentName || '').toLowerCase().includes(searchLower) ||
      (m.parentEmail || '').toLowerCase().includes(searchLower);
    return matchesStatus && matchesSearch;
  });

  const allSelected = filteredMemberships.length > 0 && filteredMemberships.every((m: MembershipRecord) => selectedIds.has(m.id));
  const someSelected = selectedIds.size > 0;

  const getBulkActionLabel = () => {
    if (bulkActionDialog.action === 'paid') return 'Mark as Paid (Enrolled)';
    if (bulkActionDialog.action === 'pending') return 'Mark as Pending';
    if (bulkActionDialog.action === 'expiration') return 'Set Expiration Date';
    return '';
  };

  if (activeRole !== 'schoolAdmin' && activeRole !== 'admin' && activeRole !== 'superAdmin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-semibold">Access Denied</p>
          <p className="text-muted-foreground">This page is only available to school administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="membership-management-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Membership Management</h1>
          <p className="text-muted-foreground">Manage school memberships and payments</p>
        </div>
        <Button
          variant="default"
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={handleWinterSessionFix}
          data-testid="winter-session-fix-button"
        >
          <Wrench className="h-4 w-4 mr-2" />
          Winter Session Fix
        </Button>
      </div>

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
              <div className="text-2xl font-bold text-orange-600">
                {(summary.pending || 0) + (summary.partial || 0)}
              </div>
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
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="search-input"
            />
          </div>
          <div className="w-52">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="filter-status">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="enrolled">Enrolled</SelectItem>
                <SelectItem value="pending_payment">Pending Payment</SelectItem>
                <SelectItem value="partial_payment">Partial Payment</SelectItem>
                <SelectItem value="grace_period">Grace Period</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {someSelected && (
        <div className="sticky top-4 z-10 bg-primary text-primary-foreground rounded-lg shadow-lg p-3 flex items-center gap-3">
          <CheckSquare className="h-5 w-5 shrink-0" />
          <span className="font-medium">{selectedIds.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleOpenBulkAction('paid')}
              data-testid="bulk-action-mark-paid"
            >
              Mark as Paid (Enrolled)
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleOpenBulkAction('pending')}
              data-testid="bulk-action-mark-pending"
            >
              Mark as Pending
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleOpenBulkAction('expiration')}
              data-testid="bulk-action-set-expiration"
            >
              Set Expiration Date
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-primary-foreground hover:text-primary-foreground hover:bg-primary/80"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Memberships ({filteredMemberships.length})</CardTitle>
          <CardDescription>View and manage all parent memberships</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                      data-testid="select-all-checkbox"
                    />
                  </TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amt Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Renewal</TableHead>
                  <TableHead>Expiration</TableHead>
                  <TableHead>Grace End</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 12 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredMemberships.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      No memberships found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMemberships.map((membership: MembershipRecord) => {
                    const daysInfo = getDaysLabel(membership);
                    const isSelected = selectedIds.has(membership.id);
                    return (
                      <TableRow
                        key={membership.id}
                        data-testid={`membership-row-${membership.id}`}
                        className={cn(isSelected && 'bg-muted/50')}
                      >
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleSelectRow(membership.id, !!checked)}
                            data-testid={`checkbox-row-${membership.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{membership.parentName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{membership.parentEmail}</TableCell>
                        <TableCell>{membership.membershipYear}</TableCell>
                        <TableCell>
                          <span className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
                            getStatusBadgeClass(membership.status)
                          )}>
                            {getStatusLabel(membership.status)}
                          </span>
                        </TableCell>
                        <TableCell>${((membership.amountPaid || 0) / 100).toFixed(2)}</TableCell>
                        <TableCell className={cn(
                          (membership.remainingBalance || 0) > 0 ? 'text-red-600 font-semibold' : 'text-green-600'
                        )}>
                          ${((membership.remainingBalance || 0) / 100).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {membership.renewalDate ? formatDate(membership.renewalDate) : 'N/A'}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {membership.expirationDate ? formatDate(membership.expirationDate) : 'N/A'}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {membership.gracePeriodEnd ? formatDate(membership.gracePeriodEnd) : 'N/A'}
                        </TableCell>
                        <TableCell className={cn('text-sm whitespace-nowrap', daysInfo.className)}>
                          {daysInfo.text}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenPaymentDialog(membership)}
                              data-testid={`button-record-payment-${membership.id}`}
                            >
                              <DollarSign className="h-3 w-3 mr-1" />
                              Pay
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenUpdateDialog(membership)}
                              data-testid={`button-update-${membership.id}`}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
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
                        <SelectItem value="enrolled">Enrolled</SelectItem>
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

      {/* Bulk Action Confirmation Dialog */}
      <Dialog open={bulkActionDialog.open} onOpenChange={(open) => setBulkActionDialog(prev => ({ ...prev, open }))}>
        <DialogContent data-testid="bulk-action-dialog">
          <DialogHeader>
            <DialogTitle>Confirm Bulk Action</DialogTitle>
            <DialogDescription>
              {bulkActionDialog.action !== 'expiration'
                ? `Update ${selectedIds.size} membership(s) to "${getBulkActionLabel()}"?`
                : `Set expiration date for ${selectedIds.size} membership(s)?`}
            </DialogDescription>
          </DialogHeader>
          {bulkActionDialog.action === 'expiration' && (
            <div className="py-2">
              <Form {...expirationForm}>
                <FormField
                  control={expirationForm.control}
                  name="expirationDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Expiration Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="bulk-expiration-date-input" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkActionDialog({ open: false, action: null })}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmBulkAction}
              disabled={bulkUpdate.isPending}
              data-testid="bulk-action-confirm"
            >
              {bulkUpdate.isPending ? "Updating..." : `Confirm – ${getBulkActionLabel()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Winter Session Fix Preview Dialog */}
      <Dialog open={winterSessionDialogOpen} onOpenChange={setWinterSessionDialogOpen}>
        <DialogContent className="max-w-2xl" data-testid="winter-session-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Winter Session Fix Preview
            </DialogTitle>
            <DialogDescription>
              The following memberships are marked as pending but have a succeeded payment. Confirming will mark them as enrolled with zeroed balances.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            {isLoadingWinterPreview ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !winterPreview || winterPreview.length === 0 ? (
              <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
                <AlertCircle className="h-5 w-5" />
                No memberships found matching the winter session fix criteria.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parent</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount Paid</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {winterPreview.map((item: WinterPreviewItem) => (
                    <TableRow key={item.membershipId}>
                      <TableCell className="font-medium">{item.parentName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.parentEmail}</TableCell>
                      <TableCell>
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                          getStatusBadgeClass(item.currentStatus)
                        )}>
                          {getStatusLabel(item.currentStatus)}
                        </span>
                      </TableCell>
                      <TableCell>${(item.amountPaid / 100).toFixed(2)}</TableCell>
                      <TableCell>${(item.totalAmount / 100).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWinterSessionDialogOpen(false)}>
              Cancel
            </Button>
            {winterPreview && winterPreview.length > 0 && (
              <Button
                onClick={() => {
                  setWinterSessionDialogOpen(false);
                  setWinterSessionApplyDialogOpen(true);
                }}
                data-testid="winter-session-confirm-preview"
              >
                Apply Fix to {winterPreview.length} account(s)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Winter Session Fix Apply Confirmation Dialog */}
      <Dialog open={winterSessionApplyDialogOpen} onOpenChange={setWinterSessionApplyDialogOpen}>
        <DialogContent data-testid="winter-session-apply-dialog">
          <DialogHeader>
            <DialogTitle>Confirm Winter Session Fix</DialogTitle>
            <DialogDescription>
              This will update {winterPreview ? winterPreview.length : 0} membership(s) to enrolled status with zeroed balances. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWinterSessionApplyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => applyWinterFix.mutate()}
              disabled={applyWinterFix.isPending}
              data-testid="winter-session-apply-confirm"
            >
              {applyWinterFix.isPending ? "Applying..." : "Confirm & Apply Fix"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
