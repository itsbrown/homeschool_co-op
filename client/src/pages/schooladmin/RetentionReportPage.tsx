import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, Users, UserCheck, UserMinus, UserPlus, BarChart3, Loader2 } from 'lucide-react';

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

interface SubmittedParams {
  period1Start: string;
  period1End: string;
  period2Start: string;
  period2End: string;
}

function StatusBadge({ status }: { status: RetentionRow['status'] }) {
  if (status === 'Returning') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Returning</span>;
  }
  if (status === 'New') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">New</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Dropped</span>;
}

function RetentionRateColor({ pct }: { pct: number }) {
  let color = 'text-red-600';
  if (pct > 90) color = 'text-green-600';
  else if (pct >= 80) color = 'text-yellow-600';
  return <span className={`text-2xl font-bold ${color}`}>{pct}%</span>;
}

export default function RetentionReportPage() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const now = new Date();
  const currentYear = now.getFullYear();

  const [period1Start, setPeriod1Start] = useState(`${currentYear - 1}-09-01`);
  const [period1End, setPeriod1End] = useState(`${currentYear - 1}-12-31`);
  const [period2Start, setPeriod2Start] = useState(`${currentYear}-09-01`);
  const [period2End, setPeriod2End] = useState(`${currentYear}-12-31`);

  const [submittedParams, setSubmittedParams] = useState<SubmittedParams | null>(null);

  useEffect(() => {
    document.title = 'Retention Report | School Admin';
  }, []);

  const compareUrl = submittedParams
    ? `/api/admin/retention/compare?period1Start=${submittedParams.period1Start}&period1End=${submittedParams.period1End}&period2Start=${submittedParams.period2Start}&period2End=${submittedParams.period2End}`
    : null;

  const { data, isLoading, error } = useQuery<RetentionData>({
    queryKey: [compareUrl!],
    enabled: !!submittedParams && !!compareUrl,
  });

  const handleRunReport = () => {
    if (!period1Start || !period1End || !period2Start || !period2End) {
      toast({ title: 'Missing dates', description: 'Please fill in all four date fields.', variant: 'destructive' });
      return;
    }
    setSubmittedParams({ period1Start, period1End, period2Start, period2End });
  };

  const handleExport = async () => {
    if (!submittedParams) return;
    setIsExporting(true);
    try {
      const exportUrl = `/api/admin/retention/export?period1Start=${submittedParams.period1Start}&period1End=${submittedParams.period1End}&period2Start=${submittedParams.period2Start}&period2End=${submittedParams.period2End}`;
      const response = await apiRequest('GET', exportUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `retention-report-${submittedParams.period1Start}-vs-${submittedParams.period2Start}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: 'Export complete', description: 'Retention report downloaded successfully.' });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err.message || 'Failed to download the report.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const summary = data?.summary;
  const rows = data?.rows ?? [];

  return (
    <SchoolAdminLayout pageTitle="Retention Report">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Retention Report</h1>
            <p className="text-muted-foreground">Compare family enrollment across two time periods</p>
          </div>
          {data && (
            <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export CSV
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select Periods</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Period 1 (Baseline)</p>
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-xs text-muted-foreground">Start</label>
                    <input
                      type="date"
                      value={period1Start}
                      onChange={e => setPeriod1Start(e.target.value)}
                      className="border rounded px-3 py-2 text-sm w-full"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-xs text-muted-foreground">End</label>
                    <input
                      type="date"
                      value={period1End}
                      onChange={e => setPeriod1End(e.target.value)}
                      className="border rounded px-3 py-2 text-sm w-full"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Period 2 (Comparison)</p>
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-xs text-muted-foreground">Start</label>
                    <input
                      type="date"
                      value={period2Start}
                      onChange={e => setPeriod2Start(e.target.value)}
                      className="border rounded px-3 py-2 text-sm w-full"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-xs text-muted-foreground">End</label>
                    <input
                      type="date"
                      value={period2End}
                      onChange={e => setPeriod2End(e.target.value)}
                      className="border rounded px-3 py-2 text-sm w-full"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <Button onClick={handleRunReport} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Run Report
              </Button>
            </div>
          </CardContent>
        </Card>

        {!submittedParams && (
          <div className="py-16 flex flex-col items-center justify-center text-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">No report yet</p>
            <p className="text-sm">Select date ranges above and click "Run Report" to see retention data.</p>
          </div>
        )}

        {isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-[100px]" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-[80px]" />
                    <Skeleton className="h-3 w-[60px] mt-2" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardContent className="pt-6">
                <Skeleton className="h-[300px] w-full" />
              </CardContent>
            </Card>
          </div>
        )}

        {error && submittedParams && (
          <div className="py-8 text-center text-red-600">
            <p>Failed to load retention data. Please try again.</p>
          </div>
        )}

        {!isLoading && data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Returning Families</CardTitle>
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary?.returningCount ?? 0}</div>
                  <p className="text-xs text-muted-foreground">{summary?.returningPct ?? 0}% of Period 1 families</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">New Families</CardTitle>
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary?.newCount ?? 0}</div>
                  <p className="text-xs text-muted-foreground">First time in Period 2</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Dropped Families</CardTitle>
                  <UserMinus className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary?.droppedCount ?? 0}</div>
                  <p className="text-xs text-muted-foreground">Did not return in Period 2</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Retention Rate</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <RetentionRateColor pct={summary?.returningPct ?? 0} />
                  <p className="text-xs text-muted-foreground">
                    {summary?.returningCount ?? 0} of {summary?.period1Total ?? 0} from Period 1
                  </p>
                </CardContent>
              </Card>
            </div>

            {rows.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center text-muted-foreground">
                <Users className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-lg font-medium">No families found</p>
                <p className="text-sm">No enrollment data matches the selected periods.</p>
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Family Detail</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Parent</TableHead>
                          <TableHead>Child(ren)</TableHead>
                          <TableHead>Period 1</TableHead>
                          <TableHead>Period 2</TableHead>
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
                            <TableCell className="text-sm">{row.childNames}</TableCell>
                            <TableCell>
                              {row.inPeriod1 ? (
                                <div>
                                  <div className="text-xs font-medium text-green-700">Yes</div>
                                  {row.period1Classes.length > 0 && (
                                    <div className="text-xs text-muted-foreground">{row.period1Classes.join(', ')}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">No</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {row.inPeriod2 ? (
                                <div>
                                  <div className="text-xs font-medium text-green-700">Yes</div>
                                  {row.period2Classes.length > 0 && (
                                    <div className="text-xs text-muted-foreground">{row.period2Classes.join(', ')}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">No</span>
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
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </SchoolAdminLayout>
  );
}
