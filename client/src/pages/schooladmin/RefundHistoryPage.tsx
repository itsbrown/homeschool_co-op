import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DollarSign, 
  Search, 
  Download, 
  RotateCcw,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  TrendingDown,
  Calculator
} from 'lucide-react';
import { format } from 'date-fns';

interface RefundRecord {
  id: number;
  schoolId: number;
  enrollmentId: number | null;
  paymentId: number | null;
  amount: number;
  reason: string | null;
  status: string;
  stripeRefundId: string | null;
  processedBy: number | null;
  adminComment: string | null;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  enrollment: {
    id: number;
    childName: string;
    className: string;
    parentEmail: string;
  } | null;
  payment: {
    id: number;
    amount: number;
    stripePaymentIntentId: string | null;
    paymentDate: string;
  } | null;
  processedByUser: {
    id: number;
    name: string;
    email: string;
  } | null;
}

interface RefundSummary {
  totalRefunds: number;
  totalAmountCents: number;
  completedRefunds: number;
  pendingRefunds: number;
  failedRefunds: number;
  last30DaysCount: number;
  last30DaysAmountCents: number;
  averageRefundCents: number;
}

interface RefundResponse {
  refunds: RefundRecord[];
  summary: RefundSummary;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Completed
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          <Clock className="mr-1 h-3 w-3" /> Pending
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          <XCircle className="mr-1 h-3 w-3" /> Failed
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function RefundHistoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, isLoading } = useQuery<RefundResponse>({
    queryKey: ['/api/admin/refunds'],
  });

  const refunds = data?.refunds || [];
  const summary = data?.summary || {
    totalRefunds: 0,
    totalAmountCents: 0,
    completedRefunds: 0,
    pendingRefunds: 0,
    failedRefunds: 0,
    last30DaysCount: 0,
    last30DaysAmountCents: 0,
    averageRefundCents: 0,
  };

  const filteredRefunds = refunds.filter((refund) => {
    const matchesSearch = 
      !searchQuery ||
      refund.enrollment?.childName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      refund.enrollment?.className?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      refund.enrollment?.parentEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      refund.reason?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      refund.stripeRefundId?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || refund.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleExportCSV = () => {
    const headers = ['Date', 'Student', 'Class', 'Amount', 'Reason', 'Status', 'Stripe ID', 'Processed By'];
    const rows = filteredRefunds.map((refund) => [
      format(new Date(refund.createdAt), 'yyyy-MM-dd HH:mm'),
      refund.enrollment?.childName || 'N/A',
      refund.enrollment?.className || 'N/A',
      (refund.amount / 100).toFixed(2),
      refund.reason || '',
      refund.status,
      refund.stripeRefundId || '',
      refund.processedByUser?.email || '',
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `refunds-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <SchoolAdminLayout pageTitle="Refund History">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Refund History</h1>
            <p className="text-muted-foreground">View and track all refunds processed for your school</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
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
        ) : summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Total Refunds
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.totalRefunds}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Total Refunded
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(summary.totalAmountCents)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-blue-600" />
                  Last 30 Days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(summary.last30DaysAmountCents)}
                </div>
                <p className="text-xs text-muted-foreground">{summary.last30DaysCount} refunds</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-purple-600" />
                  Avg. Refund
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  {formatCurrency(summary.averageRefundCents)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Completed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{summary.completedRefunds}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Pending/Failed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">
                  {summary.pendingRefunds + summary.failedRefunds}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Refund Records</CardTitle>
            <CardDescription>All refund transactions for your school</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search refunds..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-36">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={handleExportCSV} disabled={filteredRefunds.length === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredRefunds.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <RotateCcw className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No refunds found</p>
                <p className="text-sm mt-1">
                  {searchQuery || statusFilter !== 'all'
                    ? 'Try adjusting your search or filters'
                    : 'Refunds will appear here when processed'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Processed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRefunds.map((refund) => (
                      <TableRow key={refund.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(refund.createdAt), 'MMM d, yyyy')}
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(refund.createdAt), 'h:mm a')}
                          </div>
                        </TableCell>
                        <TableCell>
                          {refund.enrollment?.childName || 'N/A'}
                          <div className="text-xs text-muted-foreground">
                            {refund.enrollment?.parentEmail || ''}
                          </div>
                        </TableCell>
                        <TableCell>{refund.enrollment?.className || 'N/A'}</TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {formatCurrency(refund.amount)}
                        </TableCell>
                        <TableCell className="max-w-xs truncate" title={refund.reason || ''}>
                          {refund.reason || '-'}
                        </TableCell>
                        <TableCell>{getStatusBadge(refund.status)}</TableCell>
                        <TableCell>
                          {refund.processedByUser?.name || refund.processedByUser?.email || 'System'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SchoolAdminLayout>
  );
}
