import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Lock
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

  if (summaryError && (summaryError as any)?.message?.includes('not enabled')) {
    return <FeatureDisabledState />;
  }

  const summary = summaryData?.summary;
  const trends = trendsData?.trends || [];
  const balances = balancesData?.balances || [];
  const plans = plansData?.activePlans || [];
  const transactions = transactionsData?.transactions || [];

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

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overview">Recent Transactions</TabsTrigger>
                <TabsTrigger value="balances">Outstanding Balances</TabsTrigger>
                <TabsTrigger value="plans">Payment Plans</TabsTrigger>
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
                    <CardTitle>Outstanding Balances</CardTitle>
                    <CardDescription>Pending payments due from families</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {balancesLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                      </div>
                    ) : balances.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Due Date</TableHead>
                            <TableHead>Family</TableHead>
                            <TableHead>Student</TableHead>
                            <TableHead>Class</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {balances.map((balance) => (
                            <TableRow key={balance.id}>
                              <TableCell>{format(new Date(balance.scheduledDate), 'MMM d, yyyy')}</TableCell>
                              <TableCell>{balance.parent?.name || balance.parentEmail}</TableCell>
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
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
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
            </Tabs>
          </>
        )}
      </div>
    </SchoolAdminLayout>
  );
}
