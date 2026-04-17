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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import CardManagementPanel from '@/components/payments/CardManagementPanel';
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
  Send,
  Zap,
  XCircle,
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
  totalCompedCents: number;
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
  scheduledDate: string | null;
  isOverdue: boolean;
  daysOverdue: number;
  type?: string;
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

interface ClassBreakdownItem {
  className: string;
  classStartDate: string | null;
  classEndDate: string | null;
  enrollmentCount: number;
  totalExpectedCents: number;
  totalCollectedCents: number;
  totalOutstandingCents: number;
  totalCompedCents: number;
}

interface ClassBreakdownResponse {
  classes: ClassBreakdownItem[];
  totals: {
    totalExpectedCents: number;
    totalCollectedCents: number;
    totalOutstandingCents: number;
    totalCompedCents: number;
  };
}

const CLASS_PRESETS: Record<string, { label: string; startDate: string; endDate: string }> = {
  'fall-2025':   { label: 'Fall 2025',   startDate: '2025-09-01', endDate: '2025-11-30' },
  'winter-2026': { label: 'Winter 2026', startDate: '2026-01-01', endDate: '2026-03-31' },
  'spring-2026': { label: 'Spring 2026', startDate: '2026-04-01', endDate: '2026-06-30' },
};

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

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const STARTER_QUESTIONS = [
  'What is our current collection rate?',
  'Which families have the largest outstanding balances?',
  'How does this month compare to last month?',
  'What percentage of enrollments are fully paid?',
];

export default function FinancialReportsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [groupByParent, setGroupByParent] = useState(false);
  const [sendingReminderId, setSendingReminderId] = useState<number | null>(null);
  const [sendingSummaryEmail, setSendingSummaryEmail] = useState<string | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');

  // Auto-Pay History filters
  const now = new Date();
  const defaultApStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultApEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const [apStartDate, setApStartDate] = useState(defaultApStartDate);
  const [apEndDate, setApEndDate] = useState(defaultApEndDate);
  const [apStatus, setApStatus] = useState('all');
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

  const [manageCardsParent, setManageCardsParent] = useState<{ id: number; name: string } | null>(null);

  const [classDateFilter, setClassDateFilter] = useState<string>('all');
  const classBreakdownPreset = CLASS_PRESETS[classDateFilter];
  const classBreakdownUrl = classBreakdownPreset
    ? `/api/admin/financial-reports/class-breakdown?startDate=${classBreakdownPreset.startDate}&endDate=${classBreakdownPreset.endDate}`
    : '/api/admin/financial-reports/class-breakdown';
  const { data: classBreakdownData, isLoading: classBreakdownLoading } = useQuery<ClassBreakdownResponse>({
    queryKey: [classBreakdownUrl],
    enabled: activeTab === 'classes',
  });

  const { data: autoPayData, isLoading: autoPayLoading } = useQuery<{ records: any[]; summary: any }>({
    queryKey: ['/api/admin/financial-reports/auto-pay-history', apStartDate, apEndDate, apStatus],
    enabled: activeTab === 'autopay',
  });
  const autoPayRecords = autoPayData?.records ?? [];
  const autoPaySummary = autoPayData?.summary ?? { totalChargedCents: 0, totalFailedCents: 0, chargedCount: 0, failedCount: 0, skippedCount: 0 };
  const autoPaySuccessRate = (autoPaySummary.chargedCount + autoPaySummary.failedCount) > 0
    ? Math.round(autoPaySummary.chargedCount / (autoPaySummary.chargedCount + autoPaySummary.failedCount) * 100)
    : 100;

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

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/financial-reports/reconcile-scheduled-payments', {});
      return response.json();
    },
    onSuccess: (data: any) => {
      const cleaned = data.summary?.totalCleaned || 0;
      const updated = data.summary?.paymentsMarkedCompleted || 0;
      const parts = [];
      if (cleaned > 0) {
        parts.push(`Removed ${cleaned} duplicate/orphaned payment(s)`);
      }
      if (updated > 0) {
        parts.push(`Updated ${updated} payment status(es)`);
      }
      const description = parts.length > 0 ? parts.join('. ') + '.' : 'No changes needed.';
      
      toast({
        title: 'Data synced successfully',
        description,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/outstanding-balances'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/payment-plans'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Sync failed',
        description: error.message || 'An error occurred while syncing data.',
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

  const aiChatMutation = useMutation({
    mutationFn: async (data: { message: string; history: ChatMessage[] }) => {
      const response = await apiRequest('POST', '/api/admin/financial-reports/ai-chat', data);
      return response.json() as Promise<{ response: string; aiAvailable: boolean }>;
    },
    onSuccess: (data) => {
      setChatHistory(prev => [...prev, { role: 'assistant', content: data.response }]);
    },
    onError: () => {
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: 'I encountered an issue. Please try again in a moment.',
      }]);
    },
  });

  const handleChatSend = (message: string) => {
    if (!message.trim() || aiChatMutation.isPending) return;
    const newHistory = [...chatHistory, { role: 'user' as const, content: message }];
    setChatHistory(newHistory);
    setChatInput('');
    aiChatMutation.mutate({ message, history: chatHistory });
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

  const [isExporting, setIsExporting] = useState<string | null>(null);

  const handleExport = async (type: string) => {
    setIsExporting(type);
    try {
      const response = await apiRequest('GET', `/api/admin/financial-reports/export?type=${type}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financial-${type}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: 'Export complete',
        description: `${type === 'payments' ? 'Payments' : 'Outstanding balances'} exported successfully.`,
      });
    } catch (error: any) {
      toast({
        title: 'Export failed',
        description: error.message || 'Failed to download the report.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(null);
    }
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
            <Button variant="outline" size="sm" onClick={() => handleExport('payments')} disabled={isExporting !== null}>
              {isExporting === 'payments' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export Payments
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('outstanding')} disabled={isExporting !== null}>
              {isExporting === 'outstanding' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
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
                  {(summary?.totalCompedCents || 0) > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Comped</span>
                      <span className="font-semibold text-green-600">{formatCurrency(summary?.totalCompedCents || 0)}</span>
                    </div>
                  )}
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
                <TabsTrigger value="classes">By Class</TabsTrigger>
                <TabsTrigger value="ask-ai">
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Ask AI
                </TabsTrigger>
                <TabsTrigger value="reminders">
                  <Mail className="h-4 w-4 mr-1" />
                  Reminders
                </TabsTrigger>
                <TabsTrigger value="autopay">
                  <Zap className="h-3.5 w-3.5 mr-1.5" />
                  Auto-Pay
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
                          title="Sync scheduled payments with actual payment data"
                        >
                          {isReconciling ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-1" />
                          )}
                          Sync Data
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
                                <div className="flex items-center gap-2">
                                  <div className="text-right mr-2">
                                    <p className="font-semibold">{formatCurrency(group.totalAmount)}</p>
                                    <p className="text-sm text-muted-foreground">{group.balanceCount} payment{group.balanceCount > 1 ? 's' : ''}</p>
                                  </div>
                                  {(() => {
                                    const parentId = group.balances[0]?.parent?.id;
                                    return parentId ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setManageCardsParent({ id: parentId, name: group.parentName })}
                                        title="Manage saved cards for this parent"
                                      >
                                        <CreditCard className="h-4 w-4 mr-1" />
                                        Cards
                                      </Button>
                                    ) : null;
                                  })()}
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
                                      {balance.type === 'unscheduled' ? (
                                        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">
                                          No Payment Plan
                                        </Badge>
                                      ) : (
                                        <span className="text-muted-foreground">
                                          Due {balance.scheduledDate ? format(new Date(balance.scheduledDate), 'MMM d') : '—'}
                                        </span>
                                      )}
                                      {balance.type !== 'unscheduled' && (
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
                                      )}
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
                              <TableHead className="w-[120px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {balances.map((balance) => (
                              <TableRow key={balance.id}>
                                <TableCell>
                                  {balance.scheduledDate
                                    ? format(new Date(balance.scheduledDate), 'MMM d, yyyy')
                                    : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell>{balance.parent?.name || balance.parentEmail}</TableCell>
                                <TableCell className="text-muted-foreground">{balance.parent?.phone || '-'}</TableCell>
                                <TableCell>{balance.enrollment?.childName || 'N/A'}</TableCell>
                                <TableCell>{balance.enrollment?.className || 'N/A'}</TableCell>
                                <TableCell>{formatCurrency(balance.amount)}</TableCell>
                                <TableCell>
                                  {balance.type === 'unscheduled' ? (
                                    <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                                      No Payment Plan
                                    </Badge>
                                  ) : balance.isOverdue ? (
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
                                  {balance.type === 'unscheduled' ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2"
                                      title="No scheduled payment to remind about"
                                      disabled
                                    >
                                      <Send className="h-4 w-4 opacity-30" />
                                    </Button>
                                  ) : (
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
                                  )}
                                  {balance.parent?.id && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setManageCardsParent({ id: balance.parent!.id, name: balance.parent!.name })}
                                      className="h-8 px-2"
                                      title="Manage saved cards for this parent"
                                    >
                                      <CreditCard className="h-4 w-4" />
                                    </Button>
                                  )}
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

              <TabsContent value="classes" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Revenue by Class</CardTitle>
                    <CardDescription>Expected, collected, and outstanding amounts per class</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 mb-6">
                      <Button
                        variant={classDateFilter === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setClassDateFilter('all')}
                      >
                        All Classes
                      </Button>
                      {Object.entries(CLASS_PRESETS).map(([key, preset]) => (
                        <Button
                          key={key}
                          variant={classDateFilter === key ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setClassDateFilter(key)}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>

                    {classBreakdownLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                      </div>
                    ) : !classBreakdownData?.classes?.length ? (
                      <div className="text-center py-10 text-muted-foreground">
                        <BarChart3 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p>No classes found for this period</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Class</TableHead>
                            <TableHead>Dates</TableHead>
                            <TableHead className="text-center">Students</TableHead>
                            <TableHead className="text-right">Expected</TableHead>
                            <TableHead className="text-right">Collected</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                            <TableHead className="text-right">Comped</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {classBreakdownData.classes.map((cls) => (
                            <TableRow key={cls.className}>
                              <TableCell className="font-medium">{cls.className}</TableCell>
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                {cls.classStartDate && cls.classEndDate
                                  ? `${format(new Date(cls.classStartDate), 'MMM d')} – ${format(new Date(cls.classEndDate), 'MMM d, yyyy')}`
                                  : cls.classStartDate
                                  ? format(new Date(cls.classStartDate), 'MMM d, yyyy')
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-center">{cls.enrollmentCount}</TableCell>
                              <TableCell className="text-right">{formatCurrency(cls.totalExpectedCents)}</TableCell>
                              <TableCell className="text-right text-green-700">{formatCurrency(cls.totalCollectedCents)}</TableCell>
                              <TableCell className="text-right">
                                {cls.totalOutstandingCents > 0 ? (
                                  <span className="text-amber-600 font-medium">{formatCurrency(cls.totalOutstandingCents)}</span>
                                ) : (
                                  <span className="text-green-600">$0.00</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {cls.totalCompedCents > 0 ? formatCurrency(cls.totalCompedCents) : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-t-2 font-bold bg-slate-50">
                            <TableCell colSpan={3}>Totals</TableCell>
                            <TableCell className="text-right">{formatCurrency(classBreakdownData.totals.totalExpectedCents)}</TableCell>
                            <TableCell className="text-right text-green-700">{formatCurrency(classBreakdownData.totals.totalCollectedCents)}</TableCell>
                            <TableCell className="text-right text-amber-600">{formatCurrency(classBreakdownData.totals.totalOutstandingCents)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{formatCurrency(classBreakdownData.totals.totalCompedCents)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ask-ai" className="mt-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-purple-500" />
                          Ask AI About Your Finances
                        </CardTitle>
                        <CardDescription>Ask natural language questions about your school's financial data</CardDescription>
                      </div>
                      {chatHistory.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => setChatHistory([])}>
                          Clear conversation
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {chatHistory.length === 0 && (
                      <div className="mb-6">
                        <p className="text-sm text-muted-foreground mb-3">Try asking:</p>
                        <div className="flex flex-wrap gap-2">
                          {STARTER_QUESTIONS.map((q) => (
                            <button
                              key={q}
                              className="text-sm px-3 py-1.5 rounded-full border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-colors text-left"
                              onClick={() => handleChatSend(q)}
                              disabled={aiChatMutation.isPending}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-4 mb-4 max-h-[400px] overflow-y-auto">
                      {chatHistory.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                              msg.role === 'user'
                                ? 'bg-primary text-primary-foreground ml-4'
                                : 'bg-gray-100 text-gray-900 mr-4'
                            }`}
                          >
                            {msg.role === 'assistant' ? (
                              <div className="flex items-start gap-2">
                                <Sparkles className="h-3.5 w-3.5 mt-0.5 text-purple-500 shrink-0" />
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                              </div>
                            ) : (
                              <p>{msg.content}</p>
                            )}
                          </div>
                        </div>
                      ))}
                      {aiChatMutation.isPending && (
                        <div className="flex justify-start">
                          <div className="bg-gray-100 rounded-lg px-4 py-2.5 text-sm text-gray-500 flex items-center gap-2 mr-4">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Analyzing your data...
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <textarea
                        className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                        placeholder="Ask a question about your finances..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        disabled={aiChatMutation.isPending}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleChatSend(chatInput);
                          }
                        }}
                        style={{ fontSize: '16px' }}
                      />
                      <Button
                        onClick={() => handleChatSend(chatInput)}
                        disabled={!chatInput.trim() || aiChatMutation.isPending}
                        size="sm"
                        className="self-end"
                      >
                        {aiChatMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Press Enter to send, Shift+Enter for new line</p>
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

              <TabsContent value="autopay" className="mt-4">
                {/* Filter bar */}
                <Card className="mb-4">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Zap className="h-5 w-5 text-amber-500" />
                          Auto-Pay Charge History
                        </CardTitle>
                        <CardDescription>All installments charged automatically by the auto-pay scheduler</CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const url = `/api/admin/financial-reports/export?type=autopay&startDate=${apStartDate}&endDate=${apEndDate}`;
                          window.location.href = url;
                        }}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Export CSV
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium whitespace-nowrap">From</label>
                        <input
                          type="date"
                          value={apStartDate}
                          onChange={(e) => setApStartDate(e.target.value)}
                          style={{ fontSize: '16px' }}
                          className="border rounded px-2 py-1 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium whitespace-nowrap">To</label>
                        <input
                          type="date"
                          value={apEndDate}
                          onChange={(e) => setApEndDate(e.target.value)}
                          style={{ fontSize: '16px' }}
                          className="border rounded px-2 py-1 text-sm"
                        />
                      </div>
                      <select
                        value={apStatus}
                        onChange={(e) => setApStatus(e.target.value)}
                        style={{ fontSize: '16px' }}
                        className="border rounded px-2 py-1 text-sm"
                      >
                        <option value="all">All Statuses</option>
                        <option value="completed">Charged</option>
                        <option value="failed">Failed</option>
                        <option value="skipped">Skipped</option>
                      </select>
                    </div>
                  </CardContent>
                </Card>

                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total Charged</p>
                          <p className="font-semibold">{formatCurrency(autoPaySummary.totalChargedCents)}</p>
                          <p className="text-xs text-muted-foreground">{autoPaySummary.chargedCount} charge{autoPaySummary.chargedCount !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                          <XCircle className="h-5 w-5 text-red-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total Failed</p>
                          <p className="font-semibold">{formatCurrency(autoPaySummary.totalFailedCents)}</p>
                          <p className="text-xs text-muted-foreground">{autoPaySummary.failedCount} failure{autoPaySummary.failedCount !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <TrendingUp className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Success Rate</p>
                          <p className="font-semibold">{autoPaySuccessRate}%</p>
                          <p className="text-xs text-muted-foreground">{autoPaySummary.skippedCount} skipped</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Data table */}
                <Card>
                  <CardContent className="pt-4">
                    {autoPayLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                      </div>
                    ) : autoPayRecords.length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground">
                        <Zap className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p className="font-medium">No auto-pay activity found for this period</p>
                        <p className="text-sm mt-1">Auto-pay charges will appear here once the scheduler has run</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Charged On</TableHead>
                            <TableHead>Parent</TableHead>
                            <TableHead>Child</TableHead>
                            <TableHead>Class</TableHead>
                            <TableHead>Installment</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {autoPayRecords.map((r: any) => (
                            <TableRow key={r.id}>
                              <TableCell className="text-sm">
                                {r.processedAt
                                  ? format(new Date(r.processedAt), 'MMM d, yyyy h:mm a')
                                  : format(new Date(r.scheduledDate), 'MMM d, yyyy')}
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-sm">
                                    {[r.parentFirstName, r.parentLastName].filter(Boolean).join(' ') || r.parentEmail?.split('@')[0] || 'Unknown'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{r.parentEmail}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{r.childName || 'N/A'}</TableCell>
                              <TableCell className="text-sm">{r.className || 'N/A'}</TableCell>
                              <TableCell className="text-sm">{r.installmentNumber} of {r.totalInstallments}</TableCell>
                              <TableCell className="text-right font-semibold text-sm">{formatCurrency(r.amount)}</TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  {r.status === 'completed' && (
                                    <Badge className="bg-green-100 text-green-800 border-0">Charged</Badge>
                                  )}
                                  {r.status === 'failed' && (
                                    <Badge className="bg-red-100 text-red-800 border-0">Failed</Badge>
                                  )}
                                  {r.status === 'skipped' && (
                                    <Badge className="bg-gray-100 text-gray-800 border-0">Skipped</Badge>
                                  )}
                                  {r.status === 'processing' && (
                                    <Badge className="bg-yellow-100 text-yellow-800 border-0">Processing</Badge>
                                  )}
                                  {!['completed', 'failed', 'skipped', 'processing'].includes(r.status) && (
                                    <Badge variant="outline">{r.status}</Badge>
                                  )}
                                  {r.failureReason && (
                                    <p className="text-xs text-red-600">{r.failureReason}</p>
                                  )}
                                  {r.retryCount > 0 && (
                                    <Badge variant="outline" className="text-xs">
                                      {r.retryCount} retr{r.retryCount === 1 ? 'y' : 'ies'}
                                    </Badge>
                                  )}
                                </div>
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
          </>
        )}
      </div>

      {/* Manage Cards Dialog (admin mode) */}
      <Dialog
        open={!!manageCardsParent}
        onOpenChange={(open) => !open && setManageCardsParent(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Methods</DialogTitle>
            <DialogDescription>
              View and manage saved cards for this parent. You can add a new card or remove existing ones.
            </DialogDescription>
          </DialogHeader>
          {manageCardsParent && (
            <CardManagementPanel
              targetUserId={manageCardsParent.id}
              targetUserName={manageCardsParent.name}
            />
          )}
        </DialogContent>
      </Dialog>
    </SchoolAdminLayout>
  );
}
