import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  RefreshCw,
  User,
  Calendar,
  Monitor,
  Bug,
  CreditCard,
  Zap,
  Mail
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface TechnicalIssue {
  id: string;
  userEmail: string;
  userRole: string;
  issueType: 'navigation' | 'payment' | 'ui' | 'performance' | 'authentication' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  timestamp: Date;
  resolution?: string;
  assignedTo?: string;
  reproductionSteps: string[];
  recommendedActions: string[];
}

export default function TechnicalSupportPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedIssue, setSelectedIssue] = useState<TechnicalIssue | null>(null);
  const [resolution, setResolution] = useState('');
  const [newStatus, setNewStatus] = useState<string>('');

  const { data: issues = [], isLoading } = useQuery<TechnicalIssue[]>({
    queryKey: ['/api/admin/technical-issues'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/technical-issues');
      const result = await response.json();
      return result.success ? result.issues : [];
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const { data: systemHealth } = useQuery({
    queryKey: ['/api/technical-support/system-health'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/technical-support/system-health');
      return response.json();
    },
    refetchInterval: 60000 // Check system health every minute
  });

  const updateIssueMutation = useMutation({
    mutationFn: async ({ issueId, updates }: { issueId: string; updates: any }) => {
      const response = await apiRequest('PATCH', `/api/admin/technical-issues/${issueId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/technical-issues'] });
      toast({
        title: "Issue Updated",
        description: "The technical issue has been updated successfully.",
      });
      setSelectedIssue(null);
      setResolution('');
      setNewStatus('');
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: "Failed to update the issue. Please try again.",
        variant: "destructive",
      });
    }
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'high': return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case 'medium': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'low': return <CheckCircle className="h-4 w-4 text-green-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getIssueTypeIcon = (type: string) => {
    switch (type) {
      case 'navigation': return <Monitor className="h-4 w-4" />;
      case 'payment': return <CreditCard className="h-4 w-4" />;
      case 'ui': return <Zap className="h-4 w-4" />;
      case 'performance': return <RefreshCw className="h-4 w-4" />;
      case 'authentication': return <User className="h-4 w-4" />;
      default: return <Bug className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'investigating': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleUpdateIssue = () => {
    if (!selectedIssue || !newStatus) return;

    updateIssueMutation.mutate({
      issueId: selectedIssue.id,
      updates: {
        status: newStatus,
        resolution: resolution || undefined,
        assignedTo: 'Current Admin' // Could be dynamic based on logged-in admin
      }
    });
  };

  const openIssues = issues.filter(issue => ['open', 'investigating'].includes(issue.status));
  const resolvedIssues = issues.filter(issue => ['resolved', 'closed'].includes(issue.status));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Technical Support Dashboard</h1>
        <p className="text-gray-600">Monitor and manage technical issues reported by users</p>
      </div>

      {/* System Health Status */}
      {systemHealth && (
        <Alert className={systemHealth.overallHealth === 'critical' ? 'border-red-200 bg-red-50' : systemHealth.overallHealth === 'warning' ? 'border-yellow-200 bg-yellow-50' : 'border-green-200 bg-green-50'}>
          <Monitor className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <span>
                System Health: <strong className={systemHealth.overallHealth === 'healthy' ? 'text-green-700' : systemHealth.overallHealth === 'warning' ? 'text-yellow-700' : 'text-red-700'}>
                  {systemHealth.overallHealth.toUpperCase()}
                </strong>
              </span>
              {systemHealth.issues?.length > 0 && (
                <span className="text-sm">
                  {systemHealth.issues.length} issues detected
                </span>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openIssues.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{issues.filter(i => i.severity === 'critical').length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {resolvedIssues.filter(i => 
                new Date(i.timestamp).toDateString() === new Date().toDateString()
              ).length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Issues</CardTitle>
            <Bug className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{issues.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Issues List */}
      <Tabs defaultValue="open" className="space-y-4">
        <TabsList>
          <TabsTrigger value="open">Open Issues ({openIssues.length})</TabsTrigger>
          <TabsTrigger value="resolved">Resolved ({resolvedIssues.length})</TabsTrigger>
          <TabsTrigger value="all">All Issues ({issues.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="open">
          <IssuesList 
            issues={openIssues} 
            onSelectIssue={setSelectedIssue}
            getSeverityIcon={getSeverityIcon}
            getIssueTypeIcon={getIssueTypeIcon}
            getSeverityColor={getSeverityColor}
            getStatusColor={getStatusColor}
          />
        </TabsContent>

        <TabsContent value="resolved">
          <IssuesList 
            issues={resolvedIssues} 
            onSelectIssue={setSelectedIssue}
            getSeverityIcon={getSeverityIcon}
            getIssueTypeIcon={getIssueTypeIcon}
            getSeverityColor={getSeverityColor}
            getStatusColor={getStatusColor}
          />
        </TabsContent>

        <TabsContent value="all">
          <IssuesList 
            issues={issues} 
            onSelectIssue={setSelectedIssue}
            getSeverityIcon={getSeverityIcon}
            getIssueTypeIcon={getIssueTypeIcon}
            getSeverityColor={getSeverityColor}
            getStatusColor={getStatusColor}
          />
        </TabsContent>
      </Tabs>

      {/* Issue Detail Modal */}
      {selectedIssue && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {getIssueTypeIcon(selectedIssue.issueType)}
                  Issue #{selectedIssue.id.slice(-6)}
                </CardTitle>
                <Button variant="ghost" onClick={() => setSelectedIssue(null)}>×</Button>
              </div>
              <CardDescription>{selectedIssue.title}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Badge variant="outline" className={getSeverityColor(selectedIssue.severity)}>
                  {getSeverityIcon(selectedIssue.severity)}
                  <span className="ml-1">{selectedIssue.severity}</span>
                </Badge>
                <Badge variant="outline" className={getStatusColor(selectedIssue.status)}>
                  {selectedIssue.status}
                </Badge>
                <Badge variant="outline">
                  <User className="h-3 w-3 mr-1" />
                  {selectedIssue.userRole}
                </Badge>
              </div>

              <div>
                <h4 className="font-medium mb-2">User Information</h4>
                <p className="text-sm text-gray-600">
                  <Mail className="h-3 w-3 inline mr-1" />
                  {selectedIssue.userEmail}
                </p>
                <p className="text-sm text-gray-600">
                  <Calendar className="h-3 w-3 inline mr-1" />
                  {formatDistanceToNow(new Date(selectedIssue.timestamp))} ago
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-2">Description</h4>
                <p className="text-sm text-gray-700">{selectedIssue.description}</p>
              </div>

              {selectedIssue.reproductionSteps.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Reproduction Steps</h4>
                  <ol className="text-sm text-gray-700 list-decimal list-inside space-y-1">
                    {selectedIssue.reproductionSteps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              {selectedIssue.recommendedActions.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Recommended Actions</h4>
                  <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                    {selectedIssue.recommendedActions.map((action, index) => (
                      <li key={index}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Update Status</label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select new status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="investigating">Investigating</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(newStatus === 'resolved' || newStatus === 'closed') && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Resolution Notes</label>
                    <Textarea
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      placeholder="Describe how this issue was resolved..."
                      className="min-h-[100px]"
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <Button 
                    onClick={handleUpdateIssue}
                    disabled={!newStatus || updateIssueMutation.isPending}
                  >
                    {updateIssueMutation.isPending ? 'Updating...' : 'Update Issue'}
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedIssue(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function IssuesList({ 
  issues, 
  onSelectIssue, 
  getSeverityIcon, 
  getIssueTypeIcon, 
  getSeverityColor, 
  getStatusColor 
}: {
  issues: TechnicalIssue[];
  onSelectIssue: (issue: TechnicalIssue) => void;
  getSeverityIcon: (severity: string) => React.ReactNode;
  getIssueTypeIcon: (type: string) => React.ReactNode;
  getSeverityColor: (severity: string) => string;
  getStatusColor: (status: string) => string;
}) {
  if (issues.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No issues found in this category.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {issues.map((issue) => (
        <Card key={issue.id} className="cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => onSelectIssue(issue)}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getIssueTypeIcon(issue.issueType)}
                <div>
                  <h4 className="font-medium">Issue #{issue.id.slice(-6)}</h4>
                  <p className="text-sm text-gray-600 truncate max-w-md">{issue.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">{issue.userEmail}</span>
                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(issue.timestamp))} ago
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={getSeverityColor(issue.severity)}>
                  {getSeverityIcon(issue.severity)}
                  <span className="ml-1">{issue.severity}</span>
                </Badge>
                <Badge variant="outline" className={getStatusColor(issue.status)}>
                  {issue.status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}