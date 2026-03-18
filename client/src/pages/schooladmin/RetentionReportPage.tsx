import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users,
  TrendingUp,
  UserPlus,
  UserMinus,
  Download,
  BarChart3,
} from 'lucide-react';

interface RetentionSummary {
  returningCount: number;
  returningPct: number;
  newCount: number;
  droppedCount: number;
  period1Total: number;
  period2Total: number;
}

interface RetentionRow {
  parentEmail: string;
  parentName: string;
  childNames: string;
  inPeriod1: boolean;
  period1Classes: string[];
  inPeriod2: boolean;
  period2Classes: string[];
  status: 'Returning' | 'New' | 'Dropped';
}

interface RetentionData {
  summary: RetentionSummary;
  rows: RetentionRow[];
}

interface QueryParams {
  period1Start: string;
  period1End: string;
  period2Start: string;
  period2End: string;
}

function buildQueryString(params: QueryParams): string {
  return `period1Start=${params.period1Start}&period1End=${params.period1End}&period2Start=${params.period2Start}&period2End=${params.period2End}`;
}

function RetentionRateCard({ pct }: { pct: number }) {
  let colorClass = 'text-red-600';
  let bgClass = 'bg-red-50';
  if (pct > 90) {
    colorClass = 'text-green-600';
    bgClass = 'bg-green-50';
  } else if (pct >= 80) {
    colorClass = 'text-yellow-600';
    bgClass = 'bg-yellow-50';
  }
  return (
    <Card className={bgClass}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Retention Rate</CardTitle>
        <TrendingUp className={`h-4 w-4 ${colorClass}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${colorClass}`}>{pct}%</div>
        <p className="text-xs text-muted-foreground">
          {pct > 90 ? 'Excellent retention' : pct >= 80 ? 'Good retention' : 'Needs attention'}
        </p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: 'Returning' | 'New' | 'Dropped' }) {
  if (status === 'Returning') {
    return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Returning</Badge>;
  }
  if (status === 'New') {
    return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">New</Badge>;
  }
  return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Dropped</Badge>;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-[100px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-[80px]" />
              <Skeleton className="h-3 w-[120px] mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-[200px]" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-16 flex flex-col items-center justify-center text-center">
      <BarChart3 className="h-16 w-16 text-muted-foreground/30 mb-4" />
      <h3 className="text-lg font-semibold text-gray-700 mb-1">Run a Retention Report</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Select two date periods above and click "Run Report" to compare family enrollment across sessions.
      </p>
    </div>
  );
}

function NoResultsState() {
  return (
    <div className="py-16 flex flex-col items-center justify-center text-center">
      <Users className="h-16 w-16 text-muted-foreground/30 mb-4" />
      <h3 className="text-lg font-semibold text-gray-700 mb-1">No Enrollment Data Found</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        No enrollments were found for the selected date ranges. Try adjusting the periods.
      </p>
    </div>
  );
}

export default function RetentionReportPage() {
  const { toast } = useToast();

  useEffect(() => {
    document.title = 'Retention Report | School Admin';
  }, []);

  const now = new Date();
  const currentYear = now.getFullYear();

  const [period1Start, setPeriod1Start] = useState(`${currentYear - 1}-09-01`);
  const [period1End, setPeriod1End] = useState(`${currentYear - 1}-11-30`);
  const [period2Start, setPeriod2Start] = useState(`${currentYear}-01-01`);
  const [period2End, setPeriod2End] = useState(`${currentYear}-03-31`);
  const [queryParams, setQueryParams] = useState<QueryParams | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const queryUrl = queryParams
    ? `/api/admin/retention/compare?${buildQueryString(queryParams)}`
    : null;

  const { data, isLoading } = useQuery<RetentionData>({
    queryKey: [queryUrl],
    enabled: !!queryParams,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!period1Start || !period1End || !period2Start || !period2End) {
      toast({ title: 'Missing dates', description: 'Please fill in all four date fields.', variant: 'destructive' });
      return;
    }
    setQueryParams({ period1Start, period1End, period2Start, period2End });
  };

  const handleExport = async () => {
    if (!queryParams) return;
    setIsExporting(true);
    try {
      const response = await apiRequest('GET', `/api/admin/retention/export?${buildQueryString(queryParams)}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `retention-report-${queryParams.period2Start}-${queryParams.period2End}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Export failed', description: err.message || 'Could not download the report.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const summary = data?.summary;
  const rows = data?.rows ?? [];
  const hasRun = !!queryParams;

  return (
    <SchoolAdminLayout pageTitle="Retention Report">
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Filter Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compare Enrollment Periods</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-gray-700">Period 1 (Earlier Session)</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="p1start" className="text-xs">Start Date</Label>
                      <input
                        id="p1start"
                        type="date"
                        value={period1Start}
                        onChange={e => setPeriod1Start(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        style={{ fontSize: '16px' }}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="p1end" className="text-xs">End Date</Label>
                      <input
                        id="p1end"
                        type="date"
                        value={period1End}
                        onChange={e => setPeriod1End(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        style={{ fontSize: '16px' }}
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-gray-700">Period 2 (Newer Session)</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="p2start" className="text-xs">Start Date</Label>
                      <input
                        id="p2start"
                        type="date"
                        value={period2Start}
                        onChange={e => setPeriod2Start(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        style={{ fontSize: '16px' }}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="p2end" className="text-xs">End Date</Label>
                      <input
                        id="p2end"
                        type="date"
                        value={period2End}
                        onChange={e => setPeriod2End(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        style={{ fontSize: '16px' }}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
              <Button type="submit" className="w-full md:w-auto">
                Run Report
              </Button>
            </form>
          </CardContent>
        </Card>

        {isLoading && <LoadingSkeleton />}

        {!isLoading && !hasRun && <EmptyState />}

        {!isLoading && hasRun && summary && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Returning Families</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.returningCount}</div>
                  <p className="text-xs text-muted-foreground">{summary.returningPct}% of Period 1</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">New Families</CardTitle>
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.newCount}</div>
                  <p className="text-xs text-muted-foreground">First time in Period 2</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Dropped Families</CardTitle>
                  <UserMinus className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.droppedCount}</div>
                  <p className="text-xs text-muted-foreground">Not in Period 2</p>
                </CardContent>
              </Card>
              <RetentionRateCard pct={summary.returningPct} />
            </div>

            {/* Family Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Family Details</CardTitle>
                {rows.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExport}
                    disabled={isExporting}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {isExporting ? 'Exporting...' : 'Export CSV'}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {rows.length === 0 ? (
                  <NoResultsState />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Parent Name / Email</TableHead>
                          <TableHead>Child(ren)</TableHead>
                          <TableHead>Period 1 Enrolled</TableHead>
                          <TableHead>Period 2 Enrolled</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map(row => (
                          <TableRow key={row.parentEmail}>
                            <TableCell>
                              <div className="font-medium text-sm">{row.parentName}</div>
                              <div className="text-xs text-muted-foreground">{row.parentEmail}</div>
                            </TableCell>
                            <TableCell className="text-sm">{row.childNames || '—'}</TableCell>
                            <TableCell>
                              {row.inPeriod1 ? (
                                <div>
                                  <span className="text-sm font-medium text-green-700">Yes</span>
                                  {row.period1Classes.length > 0 && (
                                    <div className="text-xs text-muted-foreground mt-0.5">{row.period1Classes.join(', ')}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">No</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {row.inPeriod2 ? (
                                <div>
                                  <span className="text-sm font-medium text-green-700">Yes</span>
                                  {row.period2Classes.length > 0 && (
                                    <div className="text-xs text-muted-foreground mt-0.5">{row.period2Classes.join(', ')}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">No</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={row.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </SchoolAdminLayout>
  );
}
