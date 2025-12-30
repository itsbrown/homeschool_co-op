import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/components/SupabaseProvider";
import { useRole } from "@/contexts/RoleContext";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock, CheckCircle, XCircle, RefreshCw, DollarSign, Users, Calendar, Hand } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

// Unified Credit type - supports all credit types (volunteer, referral, etc.)
interface Credit {
  id: number;
  userId: number;
  schoolId: number;
  creditType: 'volunteer' | 'referral' | 'achievement' | 'marketing' | 'manual';
  sourceType: string | null;
  sourceId: number | null;
  creditAmountCents: number;
  usedAmountCents: number;
  status: 'pending' | 'approved' | 'rejected' | 'used' | 'partially_used' | 'expired' | 'revoked';
  approvedBy: number | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  expiresAt: string | null;
  title: string | null;
  description: string | null;
  metadata: {
    minutesWorked?: number;
    hourlyRateCents?: number;
    sessionId?: number;
    sessionVolunteerId?: number;
    [key: string]: any;
  } | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Enriched fields from API
  userName: string;
  userEmail: string;
  remainingAmount: number;
  session: {
    id: number;
    scheduledDate: string;
    className: string;
  } | null;
}

// Backward compatible alias
type VolunteerCredit = Credit;

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  approved: { label: "Approved", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  used: { label: "Used", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  partially_used: { label: "Partially Used", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
  expired: { label: "Expired", color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400" },
};

export default function VolunteerCreditsPage() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { activeRole } = useRole();
  const { toast } = useToast();
  
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedCredits, setSelectedCredits] = useState<number[]>([]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [creditToReject, setCreditToReject] = useState<VolunteerCredit | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (statusFilter && statusFilter !== 'all') params.set("status", statusFilter);
    return params.toString();
  };

  const queryString = buildQueryString();
  const { data: credits, isLoading, refetch } = useQuery<VolunteerCredit[]>({
    queryKey: [`/api/school-admin/volunteer-credits${queryString ? `?${queryString}` : ''}`],
    enabled: isAuthenticated,
  });

  const approveMutation = useMutation({
    mutationFn: async (creditId: number) => {
      return apiRequest('POST', `/api/school-admin/volunteer-credits/${creditId}/approve`);
    },
    onSuccess: () => {
      toast({ title: "Credit approved", description: "Volunteer credit has been approved." });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/volunteer-credits'] });
      setSelectedCredits([]);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve credit.", variant: "destructive" });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ creditId, reason }: { creditId: number; reason: string }) => {
      return apiRequest('POST', `/api/school-admin/volunteer-credits/${creditId}/reject`, { reason });
    },
    onSuccess: () => {
      toast({ title: "Credit rejected", description: "Volunteer credit has been rejected." });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/volunteer-credits'] });
      setRejectDialogOpen(false);
      setCreditToReject(null);
      setRejectionReason("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reject credit.", variant: "destructive" });
    }
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (creditIds: number[]) => {
      return apiRequest('POST', '/api/school-admin/volunteer-credits/bulk-approve', { creditIds });
    },
    onSuccess: (result: any) => {
      toast({ 
        title: "Bulk approval complete", 
        description: `${result.approved?.length || 0} credits approved, ${result.failed?.length || 0} failed.` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/volunteer-credits'] });
      setSelectedCredits([]);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to bulk approve credits.", variant: "destructive" });
    }
  });

  const handleApprove = (credit: VolunteerCredit) => {
    approveMutation.mutate(credit.id);
  };

  const handleReject = (credit: VolunteerCredit) => {
    setCreditToReject(credit);
    setRejectDialogOpen(true);
  };

  const confirmReject = () => {
    if (creditToReject && rejectionReason.trim()) {
      rejectMutation.mutate({ creditId: creditToReject.id, reason: rejectionReason });
    }
  };

  const toggleCreditSelection = (creditId: number) => {
    setSelectedCredits(prev => 
      prev.includes(creditId) 
        ? prev.filter(id => id !== creditId)
        : [...prev, creditId]
    );
  };

  const selectAllPending = () => {
    const pendingIds = credits?.filter(c => c.status === 'pending').map(c => c.id) || [];
    setSelectedCredits(pendingIds);
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatHours = (minutes: number) => {
    const hours = minutes / 60;
    return `${hours.toFixed(2)} hrs`;
  };

  if (authLoading) {
    return (
      <ParentAppShell>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </ParentAppShell>
    );
  }

  if (!isAuthenticated) {
    setLocation("/login");
    return null;
  }

  const pendingCredits = credits?.filter(c => c.status === 'pending') || [];
  const approvedCredits = credits?.filter(c => c.status === 'approved' || c.status === 'partially_used') || [];
  const totalPendingAmount = pendingCredits.reduce((sum, c) => sum + c.creditAmountCents, 0);
  const totalApprovedAmount = approvedCredits.reduce((sum, c) => sum + c.creditAmountCents, 0);

  return (
    <ParentAppShell>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="page-title">
              Volunteer Credits
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Manage volunteer time credits and approvals
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Pending Approval</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white" data-testid="stat-pending-count">
                    {pendingCredits.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <DollarSign className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Pending Value</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white" data-testid="stat-pending-value">
                    {formatCurrency(totalPendingAmount)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Approved Credits</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white" data-testid="stat-approved-count">
                    {approvedCredits.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Hand className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Available Balance</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white" data-testid="stat-available-value">
                    {formatCurrency(totalApprovedAmount)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle>Credit Requests</CardTitle>
                <CardDescription>Review and approve volunteer credit requests</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="used">Used</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
                
                {pendingCredits.length > 0 && (
                  <>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={selectAllPending}
                      data-testid="button-select-all"
                    >
                      Select All Pending
                    </Button>
                    {selectedCredits.length > 0 && (
                      <Button 
                        size="sm" 
                        onClick={() => bulkApproveMutation.mutate(selectedCredits)}
                        disabled={bulkApproveMutation.isPending}
                        data-testid="button-bulk-approve"
                      >
                        Approve Selected ({selectedCredits.length})
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : !credits || credits.length === 0 ? (
              <div className="text-center py-12">
                <Hand className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No volunteer credits found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {credits.map((credit) => (
                  <div 
                    key={credit.id} 
                    className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    data-testid={`credit-item-${credit.id}`}
                  >
                    <div className="flex items-start gap-4">
                      {credit.status === 'pending' && (
                        <Checkbox
                          checked={selectedCredits.includes(credit.id)}
                          onCheckedChange={() => toggleCreditSelection(credit.id)}
                          data-testid={`checkbox-credit-${credit.id}`}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {credit.userName}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {credit.userEmail}
                            </p>
                          </div>
                          <Badge className={statusConfig[credit.status]?.color || 'bg-gray-100'}>
                            {statusConfig[credit.status]?.label || credit.status}
                          </Badge>
                        </div>
                        
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500 dark:text-gray-400">Hours Worked</p>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {credit.metadata?.minutesWorked ? formatHours(credit.metadata.minutesWorked) : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 dark:text-gray-400">Credit Value</p>
                            <p className="font-medium text-green-600 dark:text-green-400">
                              {formatCurrency(credit.creditAmountCents)}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 dark:text-gray-400">Session</p>
                            <p className="font-medium text-gray-900 dark:text-white truncate">
                              {credit.session ? credit.session.className : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 dark:text-gray-400">Date</p>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {credit.session 
                                ? format(new Date(credit.session.scheduledDate), 'MMM d, yyyy')
                                : format(new Date(credit.createdAt), 'MMM d, yyyy')
                              }
                            </p>
                          </div>
                        </div>

                        {credit.description && (
                          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                            {credit.description}
                          </p>
                        )}

                        {credit.rejectionReason && (
                          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-600 dark:text-red-400">
                            <strong>Rejection reason:</strong> {credit.rejectionReason}
                          </div>
                        )}

                        {credit.expiresAt && (
                          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Expires: {format(new Date(credit.expiresAt), 'MMM d, yyyy')}
                          </p>
                        )}

                        {credit.status === 'pending' && (
                          <div className="mt-4 flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={() => handleApprove(credit)}
                              disabled={approveMutation.isPending}
                              data-testid={`button-approve-${credit.id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleReject(credit)}
                              disabled={rejectMutation.isPending}
                              data-testid={`button-reject-${credit.id}`}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Volunteer Credit</DialogTitle>
              <DialogDescription>
                Please provide a reason for rejecting this credit request.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {creditToReject && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="font-medium">{creditToReject.userName}</p>
                  <p className="text-sm text-gray-500">
                    {creditToReject.metadata?.minutesWorked ? formatHours(creditToReject.metadata.minutesWorked) : ''} - {formatCurrency(creditToReject.creditAmountCents)}
                  </p>
                </div>
              )}
              <div>
                <Label htmlFor="rejection-reason">Rejection Reason</Label>
                <Textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter the reason for rejection..."
                  rows={3}
                  data-testid="input-rejection-reason"
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setRejectDialogOpen(false)}
                data-testid="button-cancel-reject"
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={confirmReject}
                disabled={!rejectionReason.trim() || rejectMutation.isPending}
                data-testid="button-confirm-reject"
              >
                Reject Credit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ParentAppShell>
  );
}
