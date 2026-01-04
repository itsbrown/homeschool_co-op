import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/components/SupabaseProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAutocomplete } from '@/components/ui/user-autocomplete';
import { 
  Plus, 
  Loader2,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  History,
  Gift
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AppShell from '@/components/layout/AppShell';
import { format } from 'date-fns';

interface CreditSummary {
  totalCreditsIssued: number;
  totalAvailableCents: number;
  pendingApprovalCount: number;
  expiringSoonCount: number;
  expiringSoonCents: number;
  creditsByType: Record<string, number>;
}

interface HouseholdBalance {
  userId: number;
  userName: string;
  userEmail: string;
  totalCreditsCents: number;
  availableCreditsCents: number;
  pendingCreditsCents: number;
  expiringSoonCents: number;
  creditCount: number;
}

interface CreditRecord {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  creditType: string;
  creditAmountCents: number;
  usedAmountCents: number;
  status: string;
  title: string | null;
  description: string | null;
  notes: string | null;
  expiresAt: string | null;
  createdAt: string;
  approvedAt: string | null;
  approverName: string | null;
  rejectionReason: string | null;
}

interface SelectedUser {
  id: number;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  role: string;
}

const creditTypeLabels: Record<string, string> = {
  volunteer: 'Volunteer',
  referral: 'Referral',
  achievement: 'Achievement',
  marketing: 'Marketing',
  manual: 'Manual',
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  partially_used: 'bg-blue-100 text-blue-800',
  used: 'bg-gray-100 text-gray-800',
  expired: 'bg-orange-100 text-orange-800',
  revoked: 'bg-red-100 text-red-800',
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CreditManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [isAddCreditOpen, setIsAddCreditOpen] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<CreditRecord | null>(null);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedParent, setSelectedParent] = useState<SelectedUser | null>(null);
  
  const [creditForm, setCreditForm] = useState({
    userId: 0,
    creditAmountDollars: '',
    title: '',
    description: '',
    notes: '',
    expiresAt: '',
    autoApprove: true,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<CreditSummary>({
    queryKey: ['/api/credits/summary'],
    enabled: !!user?.email,
  });

  const { data: households = [], isLoading: householdsLoading } = useQuery<HouseholdBalance[]>({
    queryKey: ['/api/credits/households'],
    enabled: !!user?.email,
  });

  const { data: pendingCredits = [], isLoading: pendingLoading } = useQuery<CreditRecord[]>({
    queryKey: ['/api/credits/pending'],
    enabled: !!user?.email,
  });

  const { data: creditHistory = [], isLoading: historyLoading } = useQuery<CreditRecord[]>({
    queryKey: ['/api/credits/history'],
    enabled: !!user?.email,
  });

  const createCreditMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/credits/manual', data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create credit');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Credit created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/households'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/history'] });
      setIsAddCreditOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const approveCreditMutation = useMutation({
    mutationFn: async (creditId: number) => {
      const response = await apiRequest('POST', '/api/credits/approve', { creditId });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to approve credit');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Credit approved successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/households'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/history'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const rejectCreditMutation = useMutation({
    mutationFn: async ({ creditId, reason }: { creditId: number; reason: string }) => {
      const response = await apiRequest('POST', '/api/credits/reject', { creditId, reason });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reject credit');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Credit rejected" });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/households'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/history'] });
      setIsRejectDialogOpen(false);
      setSelectedCredit(null);
      setRejectionReason('');
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setCreditForm({
      userId: 0,
      creditAmountDollars: '',
      title: '',
      description: '',
      notes: '',
      expiresAt: '',
      autoApprove: true,
    });
    setSelectedParent(null);
  }

  function handleSubmitCredit() {
    if (!selectedParent) {
      toast({ title: "Error", description: "Please select a parent", variant: "destructive" });
      return;
    }
    
    const amountCents = Math.round(parseFloat(creditForm.creditAmountDollars) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount", variant: "destructive" });
      return;
    }
    
    if (!creditForm.title.trim()) {
      toast({ title: "Error", description: "Please enter a title", variant: "destructive" });
      return;
    }
    
    createCreditMutation.mutate({
      userId: selectedParent.id,
      creditAmountCents: amountCents,
      title: creditForm.title.trim(),
      description: creditForm.description.trim() || undefined,
      notes: creditForm.notes.trim() || undefined,
      expiresAt: creditForm.expiresAt || undefined,
      autoApprove: creditForm.autoApprove,
    });
  }

  function handleApprove(credit: CreditRecord) {
    approveCreditMutation.mutate(credit.id);
  }

  function handleReject(credit: CreditRecord) {
    setSelectedCredit(credit);
    setIsRejectDialogOpen(true);
  }

  function confirmReject() {
    if (!selectedCredit || !rejectionReason.trim()) {
      toast({ title: "Error", description: "Please enter a rejection reason", variant: "destructive" });
      return;
    }
    rejectCreditMutation.mutate({ creditId: selectedCredit.id, reason: rejectionReason.trim() });
  }

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Credit Management</h1>
            <p className="text-muted-foreground">Manage household credits, approve requests, and track usage</p>
          </div>
          <Button onClick={() => setIsAddCreditOpen(true)} data-testid="button-add-credit">
            <Plus className="h-4 w-4 mr-2" />
            Add Credit
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <DollarSign className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="households" data-testid="tab-households">
              <Users className="h-4 w-4 mr-2" />
              Households
            </TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-pending">
              <Clock className="h-4 w-4 mr-2" />
              Pending
              {pendingCredits.length > 0 && (
                <Badge variant="secondary" className="ml-2">{pendingCredits.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              <History className="h-4 w-4 mr-2" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            {summaryLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <Skeleton className="h-4 w-24" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-20" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : summary ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card data-testid="card-total-available">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-green-600" />
                        Total Available
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-green-600" data-testid="text-total-available">
                        {formatCents(summary.totalAvailableCents)}
                      </p>
                      <p className="text-sm text-muted-foreground">{summary.totalCreditsIssued} credits issued</p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-pending-approval">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4 text-yellow-600" />
                        Pending Approval
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-yellow-600" data-testid="text-pending-count">
                        {summary.pendingApprovalCount}
                      </p>
                      <p className="text-sm text-muted-foreground">credits awaiting review</p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-expiring-soon">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                        Expiring Soon
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-orange-600" data-testid="text-expiring-amount">
                        {formatCents(summary.expiringSoonCents)}
                      </p>
                      <p className="text-sm text-muted-foreground">{summary.expiringSoonCount} credits in 30 days</p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-by-type">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Gift className="h-4 w-4 text-purple-600" />
                        By Type
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(summary.creditsByType).map(([type, count]) => (
                          <Badge key={type} variant="secondary" className="text-xs">
                            {creditTypeLabels[type] || type}: {count}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="households">
            <Card>
              <CardHeader>
                <CardTitle>Household Credit Balances</CardTitle>
                <CardDescription>View credit balances for each family</CardDescription>
              </CardHeader>
              <CardContent>
                {householdsLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : households.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No household credits found</p>
                ) : (
                  <Table data-testid="table-households">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Household</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="text-right">Pending</TableHead>
                        <TableHead className="text-right">Expiring Soon</TableHead>
                        <TableHead className="text-right">Total Issued</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {households.map((h) => (
                        <TableRow key={h.userId} data-testid={`row-household-${h.userId}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{h.userName}</p>
                              <p className="text-sm text-muted-foreground">{h.userEmail}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {formatCents(h.availableCreditsCents)}
                          </TableCell>
                          <TableCell className="text-right text-yellow-600">
                            {formatCents(h.pendingCreditsCents)}
                          </TableCell>
                          <TableCell className="text-right text-orange-600">
                            {formatCents(h.expiringSoonCents)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCents(h.totalCreditsCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <CardTitle>Pending Credit Approvals</CardTitle>
                <CardDescription>Review and approve or reject credit requests</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : pendingCredits.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                    <p className="text-muted-foreground">No pending approvals</p>
                  </div>
                ) : (
                  <div className="space-y-4" data-testid="list-pending-credits">
                    {pendingCredits.map((credit) => (
                      <Card key={credit.id} data-testid={`card-pending-credit-${credit.id}`}>
                        <CardContent className="pt-4">
                          <div className="flex flex-col sm:flex-row justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="secondary">
                                  {creditTypeLabels[credit.creditType] || credit.creditType}
                                </Badge>
                                <span className="text-lg font-bold text-green-600">
                                  {formatCents(credit.creditAmountCents)}
                                </span>
                              </div>
                              <p className="font-medium">{credit.title || 'Untitled Credit'}</p>
                              <p className="text-sm text-muted-foreground">
                                For: {credit.userName} ({credit.userEmail})
                              </p>
                              {credit.description && (
                                <p className="text-sm mt-2">{credit.description}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-2">
                                Submitted: {format(new Date(credit.createdAt), 'MMM d, yyyy h:mm a')}
                              </p>
                            </div>
                            <div className="flex gap-2 sm:flex-col">
                              <Button 
                                size="sm" 
                                onClick={() => handleApprove(credit)}
                                disabled={approveCreditMutation.isPending}
                                data-testid={`button-approve-${credit.id}`}
                              >
                                {approveCreditMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                )}
                                Approve
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => handleReject(credit)}
                                disabled={rejectCreditMutation.isPending}
                                data-testid={`button-reject-${credit.id}`}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Credit History</CardTitle>
                <CardDescription>All credit transactions</CardDescription>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : creditHistory.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No credit history found</p>
                ) : (
                  <Table data-testid="table-history">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Used</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {creditHistory.map((credit) => (
                        <TableRow key={credit.id} data-testid={`row-history-${credit.id}`}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(credit.createdAt), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{credit.userName}</p>
                              <p className="text-xs text-muted-foreground">{credit.userEmail}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {creditTypeLabels[credit.creditType] || credit.creditType}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {credit.title || '-'}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCents(credit.creditAmountCents)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatCents(credit.usedAmountCents)}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[credit.status] || 'bg-gray-100'}>
                              {credit.status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={isAddCreditOpen} onOpenChange={setIsAddCreditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Manual Credit</DialogTitle>
              <DialogDescription>
                Award a credit to a household account
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Parent</Label>
                {selectedParent ? (
                  <div className="flex items-center justify-between bg-accent p-3 rounded-md">
                    <div>
                      <p className="font-medium text-sm">{selectedParent.name}</p>
                      <p className="text-xs text-muted-foreground">{selectedParent.email}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setSelectedParent(null)}
                      data-testid="button-clear-parent"
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <UserAutocomplete
                    onSelect={(user) => {
                      setSelectedParent(user);
                      setCreditForm(prev => ({ ...prev, userId: user.id }));
                    }}
                    placeholder="Search by name or email..."
                    roleFilter="parent"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Credit Amount ($)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={creditForm.creditAmountDollars}
                  onChange={(e) => setCreditForm(prev => ({ ...prev, creditAmountDollars: e.target.value }))}
                  data-testid="input-credit-amount"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="e.g., Volunteer bonus, Referral reward"
                  value={creditForm.title}
                  onChange={(e) => setCreditForm(prev => ({ ...prev, title: e.target.value }))}
                  data-testid="input-credit-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Additional details about this credit..."
                  value={creditForm.description}
                  onChange={(e) => setCreditForm(prev => ({ ...prev, description: e.target.value }))}
                  data-testid="input-credit-description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiresAt">Expiration Date (optional)</Label>
                <Input
                  id="expiresAt"
                  type="date"
                  value={creditForm.expiresAt}
                  onChange={(e) => setCreditForm(prev => ({ ...prev, expiresAt: e.target.value }))}
                  min={new Date().toISOString().split('T')[0]}
                  data-testid="input-credit-expiration"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Admin Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Internal notes (not visible to parent)..."
                  value={creditForm.notes}
                  onChange={(e) => setCreditForm(prev => ({ ...prev, notes: e.target.value }))}
                  data-testid="input-credit-notes"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddCreditOpen(false)} data-testid="button-cancel-credit">
                Cancel
              </Button>
              <Button 
                onClick={handleSubmitCredit}
                disabled={createCreditMutation.isPending || !selectedParent}
                data-testid="button-submit-credit"
              >
                {createCreditMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Add Credit'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Credit</DialogTitle>
              <DialogDescription>
                Please provide a reason for rejecting this credit request.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <Textarea
                placeholder="Reason for rejection..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                data-testid="input-rejection-reason"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)} data-testid="button-cancel-reject">
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={confirmReject}
                disabled={rejectCreditMutation.isPending || !rejectionReason.trim()}
                data-testid="button-confirm-reject"
              >
                {rejectCreditMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Rejecting...
                  </>
                ) : (
                  'Reject Credit'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
