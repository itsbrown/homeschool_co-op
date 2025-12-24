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
import { AlertTriangle, Bug, RefreshCw, CheckCircle, Clock, Eye, XCircle, ChevronLeft, ChevronRight, Settings, Radio } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface ErrorLog {
  id: number;
  errorType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  stackTrace: string | null;
  errorCode: string | null;
  url: string | null;
  route: string | null;
  method: string | null;
  userId: number | null;
  userEmail: string | null;
  schoolId: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestBody: any;
  metadata: any;
  status: 'new' | 'acknowledged' | 'investigating' | 'resolved' | 'ignored';
  resolutionNotes: string | null;
  resolvedBy: number | null;
  resolvedAt: string | null;
  notificationSent: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ErrorSummary {
  totalErrors: number;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  recentTrend: number;
}

const severityConfig: Record<string, { color: string; icon: any; bgColor: string }> = {
  critical: { color: "text-red-600 dark:text-red-400", icon: XCircle, bgColor: "bg-red-100 dark:bg-red-900/30" },
  high: { color: "text-orange-600 dark:text-orange-400", icon: AlertTriangle, bgColor: "bg-orange-100 dark:bg-orange-900/30" },
  medium: { color: "text-yellow-600 dark:text-yellow-400", icon: Bug, bgColor: "bg-yellow-100 dark:bg-yellow-900/30" },
  low: { color: "text-blue-600 dark:text-blue-400", icon: Clock, bgColor: "bg-blue-100 dark:bg-blue-900/30" },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  acknowledged: { label: "Acknowledged", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  investigating: { label: "Investigating", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  resolved: { label: "Resolved", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  ignored: { label: "Ignored", color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400" },
};

export default function SystemErrorsPage() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { activeRole } = useRole();
  const { toast } = useToast();
  
  const [filters, setFilters] = useState({
    severity: "",
    status: "",
    errorType: "",
  });
  const [offset, setOffset] = useState(0);
  const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const limit = 20;

  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.set("limit", limit.toString());
    params.set("offset", offset.toString());
    if (filters.severity && filters.severity !== 'all') params.set("severity", filters.severity);
    if (filters.status && filters.status !== 'all') params.set("status", filters.status);
    if (filters.errorType && filters.errorType !== 'all') params.set("errorType", filters.errorType);
    return params.toString();
  };

  // Auto-refresh configuration
  const [autoRefresh, setAutoRefresh] = useState(true);
  const REFRESH_INTERVAL = 10000; // 10 seconds

  const queryString = buildQueryString();
  const { data: errorsData, isLoading: errorsLoading, refetch, dataUpdatedAt } = useQuery<{
    errors: ErrorLog[];
    pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  }>({
    queryKey: [`/api/telemetry/errors?${queryString}`],
    enabled: isAuthenticated,
    refetchInterval: autoRefresh ? REFRESH_INTERVAL : false,
    refetchIntervalInBackground: false,
  });

  const { data: summary } = useQuery<ErrorSummary>({
    queryKey: ['/api/telemetry/errors/summary'],
    enabled: isAuthenticated,
    refetchInterval: autoRefresh ? REFRESH_INTERVAL : false,
    refetchIntervalInBackground: false,
  });

  // Format last updated time
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, resolutionNotes }: { id: number; status: string; resolutionNotes?: string }) => {
      return apiRequest('PATCH', `/api/telemetry/errors/${id}`, { status, resolutionNotes });
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/telemetry/errors/summary'] });
      setSelectedError(null);
      setResolutionNotes("");
      setNewStatus("");
      toast({ title: "Error status updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update error", description: error.message, variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <ParentAppShell>
        <div className="flex justify-center items-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </ParentAppShell>
    );
  }

  if (!isAuthenticated) {
    setLocation("/login");
    return null;
  }

  if (!['admin', 'superAdmin', 'schoolAdmin'].includes(activeRole || '')) {
    return (
      <ParentAppShell>
        <div className="container mx-auto py-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
            <p>Only administrators can access the system errors dashboard.</p>
          </div>
        </div>
      </ParentAppShell>
    );
  }

  const errors = errorsData?.errors || [];
  const pagination = errorsData?.pagination || { total: 0, limit, offset: 0, hasMore: false };

  const handleQuickStatus = (error: ErrorLog, status: string) => {
    updateMutation.mutate({ id: error.id, status });
  };

  const handleUpdateWithNotes = () => {
    if (selectedError && newStatus) {
      updateMutation.mutate({
        id: selectedError.id,
        status: newStatus,
        resolutionNotes: resolutionNotes,
      });
    }
  };

  return (
    <ParentAppShell>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <Settings className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold" data-testid="text-page-title">System Errors</h1>
              {autoRefresh && (
                <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <Radio className="h-3 w-3 animate-pulse" />
                  <span className="text-xs font-medium">Live</span>
                </div>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              Monitor and manage application errors across the platform
            </p>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-1">
                Last updated: {format(lastUpdated, "h:mm:ss a")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                data-testid="switch-auto-refresh"
              />
              <Label htmlFor="auto-refresh" className="text-sm cursor-pointer">
                Auto-refresh
              </Label>
            </div>
            <Button onClick={() => refetch()} variant="outline" data-testid="button-refresh">
              <RefreshCw className={`h-4 w-4 mr-2 ${errorsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{summary.totalErrors}</div>
                <p className="text-sm text-muted-foreground">Total Errors (7 days)</p>
              </CardContent>
            </Card>
            <Card className={severityConfig.critical.bgColor}>
              <CardContent className="pt-6">
                <div className={`text-2xl font-bold ${severityConfig.critical.color}`}>
                  {summary.bySeverity?.critical || 0}
                </div>
                <p className="text-sm text-muted-foreground">Critical</p>
              </CardContent>
            </Card>
            <Card className={severityConfig.high.bgColor}>
              <CardContent className="pt-6">
                <div className={`text-2xl font-bold ${severityConfig.high.color}`}>
                  {summary.bySeverity?.high || 0}
                </div>
                <p className="text-sm text-muted-foreground">High</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-yellow-600">
                  {summary.byStatus?.new || 0}
                </div>
                <p className="text-sm text-muted-foreground">New/Unhandled</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">
                  {summary.byStatus?.resolved || 0}
                </div>
                <p className="text-sm text-muted-foreground">Resolved</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="w-48">
                <Label className="mb-2 block">Severity</Label>
                <Select value={filters.severity} onValueChange={(v) => { setFilters({ ...filters, severity: v }); setOffset(0); }}>
                  <SelectTrigger data-testid="select-severity">
                    <SelectValue placeholder="All severities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All severities</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-48">
                <Label className="mb-2 block">Status</Label>
                <Select value={filters.status} onValueChange={(v) => { setFilters({ ...filters, status: v }); setOffset(0); }}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="acknowledged">Acknowledged</SelectItem>
                    <SelectItem value="investigating">Investigating</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="ignored">Ignored</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-48">
                <Label className="mb-2 block">Type</Label>
                <Select value={filters.errorType} onValueChange={(v) => { setFilters({ ...filters, errorType: v }); setOffset(0); }}>
                  <SelectTrigger data-testid="select-type">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="frontend">Frontend</SelectItem>
                    <SelectItem value="backend">Backend</SelectItem>
                    <SelectItem value="api">API</SelectItem>
                    <SelectItem value="database">Database</SelectItem>
                    <SelectItem value="auth">Auth</SelectItem>
                    <SelectItem value="payment">Payment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button 
                  variant="ghost" 
                  onClick={() => { setFilters({ severity: "", status: "", errorType: "" }); setOffset(0); }}
                  data-testid="button-clear-filters"
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Error Log</CardTitle>
            <CardDescription>
              {pagination.total} total errors found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {errorsLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : errors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <p>No errors found matching your filters.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {errors.map((error) => {
                  const SeverityIcon = severityConfig[error.severity]?.icon || Bug;
                  return (
                    <div
                      key={error.id}
                      className={`p-4 rounded-lg border ${severityConfig[error.severity]?.bgColor || 'bg-gray-50'}`}
                      data-testid={`error-row-${error.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <SeverityIcon className={`h-5 w-5 mt-0.5 ${severityConfig[error.severity]?.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <Badge variant="outline" className={severityConfig[error.severity]?.color}>
                                {error.severity.toUpperCase()}
                              </Badge>
                              <Badge variant="outline">{error.errorType}</Badge>
                              <Badge className={statusConfig[error.status]?.color || ''}>
                                {statusConfig[error.status]?.label || error.status}
                              </Badge>
                              {error.errorCode && (
                                <Badge variant="secondary">{error.errorCode}</Badge>
                              )}
                            </div>
                            <p className="font-medium text-sm truncate" title={error.message}>
                              {error.message}
                            </p>
                            <div className="flex flex-wrap gap-4 mt-1 text-xs text-muted-foreground">
                              <span>{format(new Date(error.createdAt), "MMM d, yyyy h:mm a")}</span>
                              {error.route && <span>Route: {error.route}</span>}
                              {error.userEmail && <span>User: {error.userEmail}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedError(error);
                              setNewStatus(error.status);
                              setResolutionNotes(error.resolutionNotes || "");
                            }}
                            data-testid={`button-view-${error.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {error.status === 'new' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleQuickStatus(error, 'acknowledged')}
                              data-testid={`button-ack-${error.id}`}
                            >
                              Acknowledge
                            </Button>
                          )}
                          {error.status !== 'resolved' && error.status !== 'ignored' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-green-600"
                              onClick={() => handleQuickStatus(error, 'resolved')}
                              data-testid={`button-resolve-${error.id}`}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {offset + 1} - {Math.min(offset + limit, pagination.total)} of {pagination.total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - limit))}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!pagination.hasMore}
                      onClick={() => setOffset(offset + limit)}
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!selectedError} onOpenChange={(open) => !open && setSelectedError(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Error Details</DialogTitle>
              <DialogDescription>
                ID: {selectedError?.id} | {selectedError && format(new Date(selectedError.createdAt), "PPpp")}
              </DialogDescription>
            </DialogHeader>
            
            {selectedError && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Severity</Label>
                    <Badge className={`mt-1 ${severityConfig[selectedError.severity]?.color}`}>
                      {selectedError.severity.toUpperCase()}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Type</Label>
                    <p className="mt-1 font-medium">{selectedError.errorType}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Route</Label>
                    <p className="mt-1 font-mono text-sm">{selectedError.route || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Method</Label>
                    <p className="mt-1 font-mono text-sm">{selectedError.method || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">User</Label>
                    <p className="mt-1 text-sm">{selectedError.userEmail || 'Anonymous'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">School ID</Label>
                    <p className="mt-1 text-sm">{selectedError.schoolId || 'N/A'}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground">Message</Label>
                  <p className="mt-1 p-3 bg-muted rounded font-mono text-sm break-words">
                    {selectedError.message}
                  </p>
                </div>

                {selectedError.stackTrace && (
                  <div>
                    <Label className="text-muted-foreground">Stack Trace</Label>
                    <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-x-auto max-h-48 whitespace-pre-wrap break-words">
                      {selectedError.stackTrace}
                    </pre>
                  </div>
                )}

                {selectedError.metadata && Object.keys(selectedError.metadata).length > 0 && (
                  <div>
                    <Label className="text-muted-foreground">Metadata</Label>
                    <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-x-auto">
                      {JSON.stringify(selectedError.metadata, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="border-t pt-4">
                  <Label>Update Status</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger className="mt-2" data-testid="select-new-status">
                      <SelectValue placeholder="Select new status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="acknowledged">Acknowledged</SelectItem>
                      <SelectItem value="investigating">Investigating</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="ignored">Ignored</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Resolution Notes</Label>
                  <Textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Add notes about the resolution or investigation..."
                    className="mt-2"
                    rows={3}
                    data-testid="textarea-resolution-notes"
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedError(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpdateWithNotes}
                disabled={updateMutation.isPending || !newStatus}
                data-testid="button-update-error"
              >
                {updateMutation.isPending ? "Updating..." : "Update Error"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ParentAppShell>
  );
}
