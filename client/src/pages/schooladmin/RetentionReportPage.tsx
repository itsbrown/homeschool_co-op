import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, Users, UserCheck, UserMinus, UserPlus, BarChart3, Loader2, UserX } from 'lucide-react';

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
  reportVersion?: string;
  dateFieldNote?: string;
  summary: RetentionSummary;
  rows: RetentionRow[];
  generatedAt?: string;
}

interface LapsedRow {
  parentId: number | null;
  parentEmail: string;
  parentName: string;
  phone: string | null;
  lastEnrollmentDate: string | null;
}

interface LapsedData {
  reportVersion?: string;
  lookbackDays: number;
  sinceDate: string;
  dateFieldNote?: string;
  summary: {
    totalKnownFamilies: number;
    activeFamilies: number;
    lapsedFamilies: number;
  };
  rows: LapsedRow[];
  generatedAt?: string;
}

interface SubmittedParams {
  period1Start: string;
  period1End: string;
  period2Start: string;
  period2End: string;
}

function StatusBadge({ status }: { status: RetentionRow['status'] }) {
  if (status === 'Returning') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
        Returning
      </span>
    );
  }
  if (status === 'New') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
        New
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
      Dropped
    </span>
  );
}

function RetentionRateColor({ pct }: { pct: number }) {
  let color = 'text-red-600';
  if (pct > 90) color = 'text-green-600';
  else if (pct >= 80) color = 'text-yellow-600';
  return <span className={`text-2xl font-bold ${color}`}>{pct}%</span>;
}

export default function RetentionReportPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('cohort');
  const [isExporting, setIsExporting] = useState(false);
  const [isLapsedExporting, setIsLapsedExporting] = useState(false);

  const now = new Date();
  const currentYear = now.getFullYear();

  const [period1Start, setPeriod1Start] = useState(`${currentYear - 1}-09-01`);
  const [period1End, setPeriod1End] = useState(`${currentYear - 1}-12-31`);
  const [period2Start, setPeriod2Start] = useState(`${currentYear}-09-01`);
  const [period2End, setPeriod2End] = useState(`${currentYear}-12-31`);
  const [lookbackDays, setLookbackDays] = useState(90);

  const [submittedParams, setSubmittedParams] = useState<SubmittedParams | null>(null);
  const [lapsedSubmitted, setLapsedSubmitted] = useState(false);

  useEffect(() => {
    document.title = 'Retention Report | School Admin';
  }, []);

  const compareUrl = submittedParams
    ? `/api/admin/retention/compare?period1Start=${submittedParams.period1Start}&period1End=${submittedParams.period1End}&period2Start=${submittedParams.period2Start}&period2End=${submittedParams.period2End}`
    : null;

  const { data, isLoading, error } = useQuery<RetentionData>({
    queryKey: [compareUrl!],
    enabled: !!submittedParams && !!compareUrl && activeTab === 'cohort',
  });

  const lapsedUrl = lapsedSubmitted
    ? `/api/admin/retention/lapsed-families?lookbackDays=${lookbackDays}`
    : null;

  const {
    data: lapsedData,
    isLoading: lapsedLoading,
    error: lapsedError,
  } = useQuery<LapsedData>({
    queryKey: [lapsedUrl!],
    enabled: lapsedSubmitted && !!lapsedUrl && activeTab === 'lapsed',
  });

  const handleRunCohort = () => {
    if (!period1Start || !period1End || !period2Start || !period2End) {
      toast({ title: 'Missing dates', description: 'Please fill in all four date fields.', variant: 'destructive' });
      return;
    }
    setSubmittedParams({ period1Start, period1End, period2Start, period2End });
  };

  const handleRunLapsed = () => {
    if (lookbackDays < 1 || lookbackDays > 365) {
      toast({ title: 'Invalid lookback', description: 'Use 1–365 days.', variant: 'destructive' });
      return;
    }
    setLapsedSubmitted(true);
  };

  const handleExportCohort = async () => {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to download the report.';
      toast({ title: 'Export failed', description: message, variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportLapsed = async () => {
    setIsLapsedExporting(true);
    try {
      const exportUrl = `/api/admin/retention/lapsed-families/export?lookbackDays=${lookbackDays}`;
      const response = await apiRequest('GET', exportUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lapsed-families-${lookbackDays}d.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: 'Export complete', description: 'Lapsed families report downloaded.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to download the report.';
      toast({ title: 'Export failed', description: message, variant: 'destructive' });
    } finally {
      setIsLapsedExporting(false);
    }
  };

  const summary = data?.summary;
  const rows = data?.rows ?? [];
  const lapsedRows = lapsedData?.rows ?? [];

  return (
    <SchoolAdminLayout pageTitle="Retention Report">
      <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Retention Report</h1>
            <p className="text-muted-foreground">
              Compare enrollment cohorts or find families with no recent class sign-ups
            </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="cohort">Cohort comparison</TabsTrigger>
            <TabsTrigger value="lapsed">Lapsed families</TabsTrigger>
          </TabsList>

          <TabsContent value="cohort" className="space-y-6 mt-4">
            <div className="flex justify-end">
              {data && (
                <Button variant="outline" size="sm" onClick={handleExportCohort} disabled={isExporting}>
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
                <CardDescription>
                  Families enrolled in a period if enrollment or program start date falls within the range.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">Period 1 (Baseline)</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-muted-foreground">Start</label>
                        <input
                          type="date"
                          value={period1Start}
                          onChange={(e) => setPeriod1Start(e.target.value)}
                          className="border rounded px-3 py-2 text-sm w-full"
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-muted-foreground">End</label>
                        <input
                          type="date"
                          value={period1End}
                          onChange={(e) => setPeriod1End(e.target.value)}
                          className="border rounded px-3 py-2 text-sm w-full"
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">Period 2 (Comparison)</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-muted-foreground">Start</label>
                        <input
                          type="date"
                          value={period2Start}
                          onChange={(e) => setPeriod2Start(e.target.value)}
                          className="border rounded px-3 py-2 text-sm w-full"
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-muted-foreground">End</label>
                        <input
                          type="date"
                          value={period2End}
                          onChange={(e) => setPeriod2End(e.target.value)}
                          className="border rounded px-3 py-2 text-sm w-full"
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <Button onClick={handleRunCohort} disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Run cohort report
                  </Button>
                </div>
              </CardContent>
            </Card>

            {!submittedParams && (
              <div className="py-16 flex flex-col items-center justify-center text-center text-muted-foreground">
                <BarChart3 className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-lg font-medium">No report yet</p>
                <p className="text-sm">Select date ranges and run the cohort report.</p>
              </div>
            )}

            {error && submittedParams && (
              <div className="py-8 text-center text-red-600">
                <p>Failed to load retention data. Please try again.</p>
              </div>
            )}

            {isLoading && submittedParams && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                      <CardHeader className="pb-2">
                        <Skeleton className="h-4 w-[100px]" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-8 w-[80px]" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {!isLoading && data && (
              <>
                {data.dateFieldNote && (
                  <p className="text-xs text-muted-foreground">{data.dateFieldNote}</p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Returning Families</CardTitle>
                      <UserCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{summary?.returningCount ?? 0}</div>
                      <p className="text-xs text-muted-foreground">
                        {summary?.returningPct ?? 0}% of Period 1 families
                      </p>
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
                          {rows.map((row) => (
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
                                      <div className="text-xs text-muted-foreground">
                                        {row.period1Classes.join(', ')}
                                      </div>
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
                                      <div className="text-xs text-muted-foreground">
                                        {row.period2Classes.join(', ')}
                                      </div>
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
              </>
            )}
          </TabsContent>

          <TabsContent value="lapsed" className="space-y-6 mt-4">
            <div className="flex justify-end">
              {lapsedData && (
                <Button variant="outline" size="sm" onClick={handleExportLapsed} disabled={isLapsedExporting}>
                  {isLapsedExporting ? (
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
                <CardTitle className="text-base">Lapsed families</CardTitle>
                <CardDescription>
                  Parents in your school with no qualifying class enrollment in the lookback window.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">Lookback (days)</label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={lookbackDays}
                      onChange={(e) => setLookbackDays(parseInt(e.target.value, 10) || 90)}
                      className="border rounded px-3 py-2 text-sm w-32"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <Button onClick={handleRunLapsed} disabled={lapsedLoading}>
                    {lapsedLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Run lapsed report
                  </Button>
                </div>
              </CardContent>
            </Card>

            {!lapsedSubmitted && (
              <div className="py-16 flex flex-col items-center justify-center text-center text-muted-foreground">
                <UserX className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-lg font-medium">No report yet</p>
                <p className="text-sm">Choose a lookback window and run the lapsed families report.</p>
              </div>
            )}

            {lapsedError && lapsedSubmitted && (
              <div className="py-8 text-center text-red-600">
                <p>Failed to load lapsed families. Please try again.</p>
              </div>
            )}

            {lapsedLoading && lapsedSubmitted && (
              <Card>
                <CardContent className="pt-6">
                  <Skeleton className="h-[200px] w-full" />
                </CardContent>
              </Card>
            )}

            {!lapsedLoading && lapsedData && (
              <>
                {lapsedData.dateFieldNote && (
                  <p className="text-xs text-muted-foreground">{lapsedData.dateFieldNote}</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Known families</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {lapsedData.summary.totalKnownFamilies}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Active (recent)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-700">
                        {lapsedData.summary.activeFamilies}
                      </div>
                      <p className="text-xs text-muted-foreground">Since {lapsedData.sinceDate}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Lapsed</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-orange-600">
                        {lapsedData.summary.lapsedFamilies}
                      </div>
                      <p className="text-xs text-muted-foreground">No enrollment in window</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Families to re-engage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {lapsedRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        No lapsed families for this window — every known family has a recent enrollment.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Parent</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Phone</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {lapsedRows.map((row) => (
                              <TableRow key={row.parentEmail}>
                                <TableCell className="font-medium">{row.parentName}</TableCell>
                                <TableCell className="text-sm">{row.parentEmail}</TableCell>
                                <TableCell className="text-sm">{row.phone || '—'}</TableCell>
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
          </TabsContent>
        </Tabs>
      </div>
    </SchoolAdminLayout>
  );
}
