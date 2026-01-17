import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  DollarSign, 
  Download, 
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  PieChart,
  BarChart3,
  Users,
  Calendar,
  RefreshCw,
  Lock,
  Brain,
  Sparkles,
  ArrowRight,
  Mail,
  Loader2,
  Send
} from 'lucide-react';
import { format } from 'date-fns';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

interface FinancialSummary {
  totalRevenueCents: number;
  last30DaysRevenueCents: number;
  ytdRevenueCents: number;
  totalPayments: number;
  outstandingBalanceCents: number;
  overduePayments: number;
  overdueAmountCents: number;
  totalRefundedCents: number;
  refundCount: number;
  activePaymentPlans: number;
  totalEnrollments: number;
}

interface RevenueTrend {
  month: string;
  revenueCents: number;
  paymentCount: number;
  refundedCents: number;
  refundCount: number;
  netRevenueCents: number;
}

interface OutstandingBalance {
  id: number;
  parentEmail: string;
  amount: number;
  scheduledDate: string;
  isOverdue: boolean;
  daysOverdue: number;
  parent: { id: number; name: string; email: string; phone: string | null } | null;
  enrollment: { id: number; childName: string | null; className: string | null } | null;
}

interface PaymentPlan {
  enrollmentId: number;
  parent: { id: number; name: string; email: string } | null;
  enrollment: { id: number; childName: string | null; className: string | null } | null;
  totalInstallments: number;
  completedInstallments: number;
  pendingInstallments: number;
  progressPercent: number;
  isOverdue: boolean;
  overdueCount: number;
  overdueAmountCents: number;
  totalAmountCents: number;
  paidAmountCents: number;
  remainingAmountCents: number;
  nextPaymentDate: string | null;
}

interface RecentTransaction {
  id: number;
  type: 'payment' | 'refund';
  amount: number;
  status: string;
  createdAt: string;
  enrollment: { id: number; childName: string; className: string; parentEmail: string } | null;
}

interface CFOInsight {
  category: 'revenue' | 'collections' | 'risk' | 'opportunity' | 'forecast';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  metric?: string;
  recommendation?: string;
}

interface CFOAnalysisResult {
  insights: CFOInsight[];
  executiveSummary: string;
  generatedAt: string;
  aiAvailable: boolean;
}

interface ReminderLog {
  id: number;
  schoolId: number;
  scheduledPaymentId: number | null;
  parentEmail: string;
  parentName: string | null;
  childName: string | null;
  className: string | null;
  amountCents: number;
  reminderType: string;
  status: string;
  isManual: boolean;
  sentBy: number | null;
  errorMessage: string | null;
  sentAt: string;
}

interface GroupedBalance {
  parentEmail: string;
  parentName: string;
  parentPhone: string | null;
  totalAmount: number;
  balanceCount: number;
  oldestOverdue: number;
  hasOverdue: boolean;
  balances: OutstandingBalance[];
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function SummaryCard({ title, value, subtitle, icon: Icon, trend, trendValue }: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        {trend && trendValue && (
          <p className={`text-xs flex items-center ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'}`}>
            {trend === 'up' ? <TrendingUp className="h-3 w-3 mr-1" /> : trend === 'down' ? <TrendingDown className="h-3 w-3 mr-1" /> : null}
            {trendValue}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-[100px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-[120px]" />
              <Skeleton className="h-3 w-[80px] mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-[200px]" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function FeatureDisabledState() {
  return (
    <SchoolAdminLayout pageTitle="Financial Reports">
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="p-4 rounded-full bg-gray-100">
          <Lock className="h-12 w-12 text-gray-400" />
        </div>
        <h2 className="text-2xl font-semibold text-gray-900">Financial Reports Not Available</h2>
        <p className="text-gray-600 text-center max-w-md">
          This premium feature is not enabled for your school. Please contact your administrator to request access to advanced financial reporting and analytics.
        </p>
        <Button variant="outline" onClick={() => window.history.back()}>
          Go Back
        </Button>
      </div>
    </SchoolAdminLayout>
  );
}

export default function FinancialReportsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [groupByParent, setGroupByParent] = useState(false);
  const [sendingReminderId, setSendingReminderId] = useState<number | null>(null);
  const [sendingSummaryEmail, setSendingSummaryEmail] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: summaryData, isLoading: summaryLoading, error: summaryError } = useQuery<{ summary: FinancialSummary }>({
    queryKey: ['/api/admin/financial-reports/summary'],
  });

  const { data: trendsData, isLoading: trendsLoading } = useQuery<{ trends: RevenueTrend[] }>({
    queryKey: ['/api/admin/financial-reports/revenue-trends'],
  });

  const { data: balancesData, isLoading: balancesLoading } = useQuery<{ balances: OutstandingBalance[]; summary: any }>({
    queryKey: ['/api/admin/financial-reports/outstanding-balances'],
  });

  const { data: plansData, isLoading: plansLoading } = useQuery<{ activePlans: PaymentPlan[]; summary: any }>({
    queryKey: ['/api/admin/financial-reports/payment-plans'],
  });

  const { data: transactionsData, isLoading: transactionsLoading } = useQuery<{ transactions: RecentTransaction[] }>({
    queryKey: ['/api/admin/financial-reports/recent-transactions'],
  });

  const { data: aiInsightsData, isLoading: aiInsightsLoading, refetch: refetchAIInsights } = useQuery<CFOAnalysisResult>({
    queryKey: ['/api/admin/financial-reports/ai-insights'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: reminderHistoryData, isLoading: reminderHistoryLoading } = useQuery<ReminderLog[]>({
    queryKey: ['/api/admin/financial-reports/reminder-history'],
    enabled: activeTab === 'reminders',
  });

  const sendReminderMutation = useMutation({
    mutationFn: async (scheduledPaymentId: number) => {
      const response = await apiRequest('POST', '/api/admin/financial-reports/send-reminder', {
        scheduledPaymentId
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Reminder sent',
        description: 'Payment reminder email has been sent successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/reminder-history'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to send reminder',
        description: error.message || 'An error occurred while sending the reminder.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setSendingReminderId(null);
    }
  });

  const handleSendReminder = (scheduledPaymentId: number) => {
    setSendingReminderId(scheduledPaymentId);
    sendReminderMutation.mutate(scheduledPaymentId);
  };

  const sendSummaryMutation = useMutation({
    mutationFn: async (parentEmail: string) => {
      const response = await apiRequest('POST', '/api/admin/financial-reports/send-summary-reminder', {
        parentEmail
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Summary reminder sent',
        description: 'Consolidated payment reminder has been sent successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/reminder-history'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to send summary',
        description: error.message || 'An error occurred while sending the summary reminder.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setSendingSummaryEmail(null);
    }
  });

  const handleSendSummaryReminder = (parentEmail: string) => {
    setSendingSummaryEmail(parentEmail);
    sendSummaryMutation.mutate(parentEmail);
  };

  const [isReconciling, setIsReconciling] = useState(false);

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/financial-reports/reconcile-scheduled-payments', {});
      return response.json();
    },
    onSuccess: (data) => {
      const count = data.summary?.paymentsMarkedPaid || 0;
      toast({
        title: 'Data reconciled',
        description: count > 0 
          ? `Fixed ${count} scheduled payment(s) to match enrollment balances.`
          : 'All scheduled payments already match enrollment balances.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/outstanding-balances'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/summary'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Reconciliation failed',
        description: error.message || 'An error occurred while reconciling data.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsReconciling(false);
    }
  });

  const handleReconcile = () => {
    setIsReconciling(true);
    reconcileMutation.mutate();
  };

  if (summaryError && (summaryError as any)?.message?.includes('not enabled')) {
    return <FeatureDisabledState />;
  }

  const summary = summaryData?.summary;
  const trends = trendsData?.trends || [];
  const balances = balancesData?.balances || [];
  const plans = plansData?.activePlans || [];
  const transactions = transactionsData?.transactions || [];
  const reminderHistory = reminderHistoryData || [];

  // Group balances by parent email
  const groupedBalances: GroupedBalance[] = balances.reduce((groups: GroupedBalance[], balance) => {
    const existing = groups.find(g => g.parentEmail === balance.parentEmail);
    if (existing) {
      existing.totalAmount += balance.amount;
      existing.balanceCount += 1;
      if (balance.isOverdue && balance.daysOverdue > existing.oldestOverdue) {
        existing.oldestOverdue = balance.daysOverdue;
      }
      if (balance.isOverdue) existing.hasOverdue = true;
      existing.balances.push(balance);
    } else {
      groups.push({
        parentEmail: balance.parentEmail,
        parentName: balance.parent?.name || balance.parentEmail,
        parentPhone: balance.parent?.phone || null,
        totalAmount: balance.amount,
        balanceCount: 1,
        oldestOverdue: balance.isOverdue ? balance.daysOverdue : 0,
        hasOverdue: balance.isOverdue,
        balances: [balance],
      });
    }
    return groups;
  }, []);

  const chartData = trends.map(t => ({
    month: t.month,
    revenue: t.revenueCents / 100,
    refunds: t.refundedCents / 100,
    net: t.netRevenueCents / 100,
  }));

  const handleExport = async (type: string) => {
    window.open(`/api/admin/financial-reports/export?type=${type}`, '_blank');
  };

  const isLoading = summaryLoading || trendsLoading;

  return (
    <SchoolAdminLayout pageTitle="Financial Reports">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Financial Reports</h1>
            <p className="text-muted-foreground">CFO-grade analytics and financial insights for your school</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport('payments')}>
              <Download className="h-4 w-4 mr-2" />
              Export Payments
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('outstanding')}>
              <Download className="h-4 w-4 mr-2" />
              Export Balances
            </Button>
          </div>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                title="Total Revenue"
                value={formatCurrency(summary?.totalRevenueCents || 0)}
                subtitle={`${summary?.totalPayments || 0} payments processed`}
                icon={DollarSign}
              />
              <SummaryCard
                title="Last 30 Days"
                value={formatCurrency(summary?.last30DaysRevenueCents || 0)}
                subtitle="Recent revenue"
                icon={TrendingUp}
                trend="up"
                trendValue="Active period"
              />
              <SummaryCard
                title="Outstanding Balance"
                value={formatCurrency(summary?.outstandingBalanceCents || 0)}
                subtitle={`${summary?.overduePayments || 0} overdue payments`}
                icon={Clock}
                trend={summary?.overduePayments ? 'down' : 'neutral'}
                trendValue={summary?.overduePayments ? `${formatCurrency(summary?.overdueAmountCents || 0)} overdue` : 'All on track'}
              />
              <SummaryCard
                title="Active Payment Plans"
                value={String(summary?.activePaymentPlans || 0)}
                subtitle={`${summary?.totalEnrollments || 0} total enrollments`}
                icon={CreditCard}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Revenue Trends</CardTitle>
                  <CardDescription>Monthly revenue and refund tracking</CardDescription>
                </CardHeader>
                <CardContent>
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value: number) => formatCurrency(value * 100)}
                        />
                        <Legend />
                        <Area 
                          type="monotone" 
                          dataKey="revenue" 
                          name="Revenue"
                          stackId="1" 
                          stroke="#22c55e" 
                          fill="#22c55e" 
                          fillOpacity={0.6}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="refunds" 
                          name="Refunds"
                          stackId="2" 
                          stroke="#ef4444" 
                          fill="#ef4444" 
                          fillOpacity={0.6}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                      No revenue data available yet
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Stats</CardTitle>
                  <CardDescription>Financial health indicators</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">YTD Revenue</span>
                    <span className="font-semibold">{formatCurrency(summary?.ytdRevenueCents || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Refunded</span>
                    <span className="font-semibold text-red-600">{formatCurrency(summary?.totalRefundedCents || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Refund Count</span>
                    <span className="font-semibold">{summary?.refundCount || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Collection Rate</span>
                    <span className="font-semibold">
                      {summary?.totalRevenueCents && summary?.outstandingBalanceCents 
                        ? `${Math.round((summary.totalRevenueCents / (summary.totalRevenueCents + summary.outstandingBalanceCents)) * 100)}%`
                        : '100%'
                      }
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* AI CFO Insights Panel */}
            <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-600" />
                  <div>
                    <CardTitle className="text-lg">AI Financial Insights</CardTitle>
                    <CardDescription>CFO-grade analysis powered by AI</CardDescription>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => refetchAIInsights()}
                  disabled={aiInsightsLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${aiInsightsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {aiInsightsLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-16 w-full" />
                    <div className="grid gap-3 md:grid-cols-2">
                      <Skeleton className="h-24" />
                      <Skeleton className="h-24" />
                    </div>
                  </div>
                ) : aiInsightsData ? (
                  <div className="space-y-4">
                    {/* Executive Summary */}
                    <div className="p-4 bg-white rounded-lg border border-purple-100">
                      <div className="flex items-start gap-3">
                        <Sparkles className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <h4 className="font-medium text-gray-900 mb-1">Executive Summary</h4>
                          <p className="text-sm text-gray-700">{aiInsightsData.executiveSummary}</p>
                        </div>
                      </div>
                    </div>

                    {/* Insights Grid */}
                    {aiInsightsData.insights && aiInsightsData.insights.length > 0 && (
                      <div className="grid gap-3 md:grid-cols-2">
                        {aiInsightsData.insights.map((insight, idx) => (
                          <div 
                            key={idx} 
                            className={`p-4 rounded-lg border ${
                              insight.priority === 'high' 
                                ? 'bg-red-50 border-red-200' 
                                : insight.priority === 'medium' 
                                  ? 'bg-yellow-50 border-yellow-200' 
                                  : 'bg-green-50 border-green-200'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                  insight.category === 'risk' 
                                    ? 'bg-red-100 text-red-700 border-red-300' 
                                    : insight.category === 'revenue' 
                                      ? 'bg-green-100 text-green-700 border-green-300'
                                      : insight.category === 'collections'
                                        ? 'bg-blue-100 text-blue-700 border-blue-300'
                                        : insight.category === 'opportunity'
                                          ? 'bg-purple-100 text-purple-700 border-purple-300'
                                          : 'bg-gray-100 text-gray-700 border-gray-300'
                                }`}
                              >
                                {insight.category}
                              </Badge>
                              {insight.metric && (
                                <span className="text-sm font-semibold text-gray-700">{insight.metric}</span>
                              )}
                            </div>
                            <h5 className="font-medium text-gray-900 mb-1">{insight.title}</h5>
                            <p className="text-sm text-gray-600">{insight.description}</p>
                            {insight.recommendation && (
                              <div className="mt-2 flex items-start gap-1 text-xs text-gray-500">
                                <ArrowRight className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                <span>{insight.recommendation}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between text-xs text-gray-500 pt-2">
                      <span>
                        {aiInsightsData.aiAvailable 
                          ? 'Powered by AI analysis' 
                          : 'Basic analysis (AI unavailable)'}
                      </span>
                      {aiInsightsData.generatedAt && (
                        <span>Generated {format(new Date(aiInsightsData.generatedAt), 'MMM d, h:mm a')}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    <Brain className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p>No insights available yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overview">Recent Transactions</TabsTrigger>
                <TabsTrigger value="balances">Outstanding Balances</TabsTrigger>
                <TabsTrigger value="plans">Payment Plans</TabsTrigger>
                <TabsTrigger value="reminders">
                  <Mail className="h-4 w-4 mr-1" />
                  Reminders
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Transactions</CardTitle>
                    <CardDescription>Latest payments and refunds</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {transactionsLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                      </div>
                    ) : transactions.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Student</TableHead>
                            <TableHead>Class</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.slice(0, 10).map((tx) => (
                            <TableRow key={`${tx.type}-${tx.id}`}>
                              <TableCell>{format(new Date(tx.createdAt), 'MMM d, yyyy')}</TableCell>
                              <TableCell>
                                <Badge variant={tx.type === 'payment' ? 'default' : 'destructive'}>
                                  {tx.type === 'payment' ? 'Payment' : 'Refund'}
                                </Badge>
                              </TableCell>
                              <TableCell>{tx.enrollment?.childName || 'N/A'}</TableCell>
                              <TableCell>{tx.enrollment?.className || 'N/A'}</TableCell>
                              <TableCell className={tx.type === 'refund' ? 'text-red-600' : ''}>
                                {tx.type === 'refund' ? '-' : ''}{formatCurrency(tx.amount)}
                              </TableCell>
                              <TableCell>
                                <Badge variant={tx.status === 'completed' ? 'outline' : 'secondary'}>
                                  {tx.status === 'completed' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
                                  {tx.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No transactions found
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="balances" className="mt-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Outstanding Balances</CardTitle>
                        <CardDescription>Pending payments due from families</CardDescription>
                      </div>
                      <div className="flex items-center space-x-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleReconcile}
                          disabled={isReconciling}
                          title="Sync scheduled payments with enrollment balances"
                        >
                          {isReconciling ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-1" />
                          )}
                          Reconcile Data
                        </Button>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="group-by-parent"
                            checked={groupByParent}
                            onCheckedChange={setGroupByParent}
                          />
                          <Label htmlFor="group-by-parent" className="text-sm cursor-pointer">
                            <Users className="h-4 w-4 inline mr-1" />
                            Group by Parent
                          </Label>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {balancesLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                      </div>
                    ) : balances.length > 0 ? (
                      groupByParent ? (
                        <div className="space-y-4">
                          {groupedBalances.map((group) => (
                            <div key={group.parentEmail} className="border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <p className="font-medium">{group.parentName}</p>
                                  <p className="text-sm text-muted-foreground">{group.parentEmail}</p>
                                  {group.parentPhone && (
                                    <p className="text-sm text-muted-foreground">{group.parentPhone}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-right">
                                    <p className="font-semibold">{formatCurrency(group.totalAmount)}</p>
                                    <p className="text-sm text-muted-foreground">{group.balanceCount} payment{group.balanceCount > 1 ? 's' : ''}</p>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleSendSummaryReminder(group.parentEmail)}
                                    disabled={sendingSummaryEmail === group.parentEmail}
                                    title="Send consolidated reminder for all payments"
                                  >
                                    {sendingSummaryEmail === group.parentEmail ? (
                                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                    ) : (
                                      <Mail className="h-4 w-4 mr-1" />
                                    )}
                                    Send Summary
                                  </Button>
                                </div>
                              </div>
                              {group.hasOverdue && (
                                <Badge variant="destructive" className="mb-3">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Up to {group.oldestOverdue} days overdue
                                </Badge>
                              )}
                              <div className="space-y-2 mt-2">
                                {group.balances.map((balance) => (
                                  <div key={balance.id} className="flex items-center justify-between bg-gray-50 rounded p-2 text-sm">
                                    <div>
                                      <span className="font-medium">{balance.enrollment?.childName}</span>
                                      <span className="text-muted-foreground"> - {balance.enrollment?.className}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span>{formatCurrency(balance.amount)}</span>
                                      <span className="text-muted-foreground">
                                        Due {format(new Date(balance.scheduledDate), 'MMM d')}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleSendReminder(balance.id)}
                                        disabled={sendingReminderId === balance.id}
                                        className="h-7 px-2"
                                      >
                                        {sendingReminderId === balance.id ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Send className="h-3 w-3" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Due Date</TableHead>
                              <TableHead>Family</TableHead>
                              <TableHead>Phone</TableHead>
                              <TableHead>Student</TableHead>
                              <TableHead>Class</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="w-[80px]">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {balances.map((balance) => (
                              <TableRow key={balance.id}>
                                <TableCell>{format(new Date(balance.scheduledDate), 'MMM d, yyyy')}</TableCell>
                                <TableCell>{balance.parent?.name || balance.parentEmail}</TableCell>
                                <TableCell className="text-muted-foreground">{balance.parent?.phone || '-'}</TableCell>
                                <TableCell>{balance.enrollment?.childName || 'N/A'}</TableCell>
                                <TableCell>{balance.enrollment?.className || 'N/A'}</TableCell>
                                <TableCell>{formatCurrency(balance.amount)}</TableCell>
                                <TableCell>
                                  {balance.isOverdue ? (
                                    <Badge variant="destructive">
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                      {balance.daysOverdue} days overdue
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                      <Clock className="h-3 w-3 mr-1" />
                                      Pending
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleSendReminder(balance.id)}
                                    disabled={sendingReminderId === balance.id}
                                    className="h-8 px-2"
                                    title="Send payment reminder"
                                  >
                                    {sendingReminderId === balance.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Send className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                        No outstanding balances - all payments are up to date!
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="plans" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Active Payment Plans</CardTitle>
                    <CardDescription>Payment plan progress for families</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {plansLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                      </div>
                    ) : plans.length > 0 ? (
                      <div className="space-y-4">
                        {plans.map((plan) => (
                          <div key={plan.enrollmentId} className="border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="font-medium">{plan.parent?.name || 'Unknown'}</p>
                                <p className="text-sm text-muted-foreground">
                                  {plan.enrollment?.childName} - {plan.enrollment?.className}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold">{formatCurrency(plan.paidAmountCents)} / {formatCurrency(plan.totalAmountCents)}</p>
                                <p className="text-sm text-muted-foreground">
                                  {plan.completedInstallments} of {plan.totalInstallments} payments
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <Progress value={plan.progressPercent} className="flex-1" />
                              <span className="text-sm font-medium w-12">{plan.progressPercent}%</span>
                              {plan.isOverdue && (
                                <Badge variant="destructive">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  {plan.overdueCount} overdue
                                </Badge>
                              )}
                            </div>
                            {plan.nextPaymentDate && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Next payment: {format(new Date(plan.nextPaymentDate), 'MMM d, yyyy')} ({formatCurrency(plan.remainingAmountCents / plan.pendingInstallments)})
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No active payment plans
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="reminders" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Payment Reminder History
                    </CardTitle>
                    <CardDescription>
                      All automatic and manual payment reminders sent to families
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {reminderHistoryLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                      </div>
                    ) : reminderHistory.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date Sent</TableHead>
                            <TableHead>Parent</TableHead>
                            <TableHead>Student</TableHead>
                            <TableHead>Class</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reminderHistory.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell>{format(new Date(log.sentAt), 'MMM d, yyyy h:mm a')}</TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{log.parentName || log.parentEmail.split('@')[0]}</p>
                                  <p className="text-xs text-muted-foreground">{log.parentEmail}</p>
                                </div>
                              </TableCell>
                              <TableCell>{log.childName || 'N/A'}</TableCell>
                              <TableCell>{log.className || 'N/A'}</TableCell>
                              <TableCell>{formatCurrency(log.amountCents)}</TableCell>
                              <TableCell>
                                <Badge variant={log.isManual ? 'default' : 'secondary'}>
                                  {log.isManual ? 'Manual' : log.reminderType.replace(/_/g, ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {log.status === 'sent' ? (
                                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Sent
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    Failed
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Mail className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        No reminders have been sent yet
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </SchoolAdminLayout>
  );
}
