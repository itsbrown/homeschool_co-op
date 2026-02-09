import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Download, Calendar, Users, Clock, AlertTriangle, QrCode, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { apiRequest } from "@/lib/queryClient";
import { useSchoolAdmin } from "@/hooks/useSchoolAdmin";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr: string | null) {
  if (!timeStr) return '—';
  if (timeStr.includes('T') || timeStr.includes('Z')) {
    return new Date(timeStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${ampm}`;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    present: 'bg-green-100 text-green-800',
    absent: 'bg-red-100 text-red-800',
    late: 'bg-yellow-100 text-yellow-800',
    excused: 'bg-blue-100 text-blue-800',
    scheduled: 'bg-gray-100 text-gray-800',
    in_progress: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variants[status] || 'bg-gray-100 text-gray-800'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export default function AttendanceManagementPage() {
  const { schoolId, isLoading: schoolLoading } = useSchoolAdmin();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("summary");
  const [sessionFilters, setSessionFilters] = useState({
    classId: 'all',
    status: 'all',
    startDate: '',
    endDate: '',
  });
  const [recordFilters, setRecordFilters] = useState({
    classId: 'all',
    status: 'all',
    childId: '',
    startDate: '',
    endDate: '',
  });
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrData, setQrData] = useState<{ qrToken: string; sessionId: number; expiresAt: string } | null>(null);
  const [generatingQr, setGeneratingQr] = useState<number | null>(null);

  const buildQueryParams = (filters: Record<string, string>) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all') params.append(key, value);
    });
    return params.toString();
  };

  const { data: summary, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ['/api/school-admin/attendance/summary', sessionFilters.startDate, sessionFilters.endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sessionFilters.startDate) params.append('startDate', sessionFilters.startDate);
      if (sessionFilters.endDate) params.append('endDate', sessionFilters.endDate);
      const res = await fetch(`/api/school-admin/attendance/summary?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch summary');
      return res.json();
    },
    enabled: !!schoolId,
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery<any[]>({
    queryKey: ['/api/school-admin/attendance/sessions', sessionFilters],
    queryFn: async () => {
      const qs = buildQueryParams(sessionFilters);
      const res = await fetch(`/api/school-admin/attendance/sessions?${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch sessions');
      return res.json();
    },
    enabled: !!schoolId && activeTab === 'sessions',
  });

  const { data: records, isLoading: recordsLoading } = useQuery<any[]>({
    queryKey: ['/api/school-admin/attendance/records', recordFilters],
    queryFn: async () => {
      const qs = buildQueryParams(recordFilters);
      const res = await fetch(`/api/school-admin/attendance/records?${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch records');
      return res.json();
    },
    enabled: !!schoolId && activeTab === 'records',
  });

  const { data: classes } = useQuery<any[]>({
    queryKey: ['/api/school-admin/classes'],
    enabled: !!schoolId,
  });

  const handleGenerateQr = async (sessionId: number) => {
    setGeneratingQr(sessionId);
    try {
      const res = await apiRequest('POST', `/api/school-admin/sessions/${sessionId}/generate-qr`);
      const data = await res.json();
      setQrData({ qrToken: data.qrToken, sessionId, expiresAt: data.expiresAt });
      setQrDialogOpen(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to generate QR code", variant: "destructive" });
    } finally {
      setGeneratingQr(null);
    }
  };

  const handleExportCsv = async () => {
    try {
      const qs = buildQueryParams(recordFilters);
      const res = await fetch(`/api/school-admin/attendance/export?${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "CSV file downloaded successfully" });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    }
  };

  if (schoolLoading) {
    return (
      <SchoolAdminLayout pageTitle="Attendance">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </SchoolAdminLayout>
    );
  }

  if (!schoolId) {
    return (
      <SchoolAdminLayout pageTitle="Attendance">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No school associated with your account.</p>
        </div>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle="Attendance Management">
      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="summary">
              <BarChart3 className="h-4 w-4 mr-1" />
              Summary
            </TabsTrigger>
            <TabsTrigger value="sessions">
              <Calendar className="h-4 w-4 mr-1" />
              Sessions
            </TabsTrigger>
            <TabsTrigger value="records">
              <Users className="h-4 w-4 mr-1" />
              Records
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-6">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-sm text-muted-foreground">From</label>
                <Input
                  type="date"
                  value={sessionFilters.startDate}
                  onChange={(e) => setSessionFilters(f => ({ ...f, startDate: e.target.value }))}
                  className="w-40"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">To</label>
                <Input
                  type="date"
                  value={sessionFilters.endDate}
                  onChange={(e) => setSessionFilters(f => ({ ...f, endDate: e.target.value }))}
                  className="w-40"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>

            {summaryLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : summary ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{summary.totalSessions}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Average Attendance</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{summary.averageAttendanceRate}%</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Present</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">{summary.totalPresent}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Absent</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-600">{summary.totalAbsent}</div>
                    </CardContent>
                  </Card>
                </div>

                {summary.chronicAbsentees && summary.chronicAbsentees.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        Chronic Absenteeism Alerts
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Student</TableHead>
                            <TableHead>Total Sessions</TableHead>
                            <TableHead>Absences</TableHead>
                            <TableHead>Attendance Rate</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary.chronicAbsentees.map((s: any) => (
                            <TableRow key={s.childId}>
                              <TableCell className="font-medium">{s.childName}</TableCell>
                              <TableCell>{s.totalSessions}</TableCell>
                              <TableCell className="text-red-600">{s.absences}</TableCell>
                              <TableCell>
                                <Badge variant={s.attendanceRate < 80 ? "destructive" : "secondary"}>
                                  {s.attendanceRate}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {summary.educatorPunctuality && summary.educatorPunctuality.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Clock className="h-5 w-5 text-blue-500" />
                        Educator Punctuality
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Educator</TableHead>
                            <TableHead>Sessions</TableHead>
                            <TableHead>On Time</TableHead>
                            <TableHead>Late</TableHead>
                            <TableHead>Avg Delay</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary.educatorPunctuality.map((e: any) => (
                            <TableRow key={e.educatorId}>
                              <TableCell className="font-medium">{e.educatorName}</TableCell>
                              <TableCell>{e.totalSessions}</TableCell>
                              <TableCell className="text-green-600">{e.onTime}</TableCell>
                              <TableCell className="text-red-600">{e.late}</TableCell>
                              <TableCell>{e.avgDelayMinutes} min</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-center py-8">No attendance data available.</p>
            )}
          </TabsContent>

          <TabsContent value="sessions" className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-sm text-muted-foreground">Class</label>
                <Select value={sessionFilters.classId} onValueChange={(v) => setSessionFilters(f => ({ ...f, classId: v }))}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes?.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Status</label>
                <Select value={sessionFilters.status} onValueChange={(v) => setSessionFilters(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">From</label>
                <Input
                  type="date"
                  value={sessionFilters.startDate}
                  onChange={(e) => setSessionFilters(f => ({ ...f, startDate: e.target.value }))}
                  className="w-40"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">To</label>
                <Input
                  type="date"
                  value={sessionFilters.endDate}
                  onChange={(e) => setSessionFilters(f => ({ ...f, endDate: e.target.value }))}
                  className="w-40"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>

            {sessionsLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : sessions && sessions.length > 0 ? (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Educator</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Punctuality</TableHead>
                          <TableHead>Attended</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sessions.map((session: any) => (
                          <TableRow key={session.id}>
                            <TableCell>{formatDate(session.scheduledDate)}</TableCell>
                            <TableCell className="font-medium">{session.className || '—'}</TableCell>
                            <TableCell>{formatTime(session.scheduledStartTime)} - {formatTime(session.scheduledEndTime)}</TableCell>
                            <TableCell>{session.educatorName || '—'}</TableCell>
                            <TableCell><StatusBadge status={session.status} /></TableCell>
                            <TableCell>
                              {session.punctuality ? (
                                <Badge variant={session.punctuality === 'on_time' ? 'default' : session.punctuality === 'slightly_late' ? 'secondary' : 'destructive'}>
                                  {session.punctuality.replace(/_/g, ' ')}
                                </Badge>
                              ) : '—'}
                            </TableCell>
                            <TableCell>{session.presentCount ?? '—'}/{session.totalStudents ?? '—'}</TableCell>
                            <TableCell className="text-right">
                              {session.status === 'scheduled' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleGenerateQr(session.id)}
                                  disabled={generatingQr === session.id}
                                >
                                  {generatingQr === session.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <QrCode className="h-4 w-4" />
                                  )}
                                  <span className="ml-1 hidden sm:inline">QR</span>
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <p className="text-muted-foreground text-center py-8">No sessions found for the selected filters.</p>
            )}
          </TabsContent>

          <TabsContent value="records" className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-sm text-muted-foreground">Class</label>
                <Select value={recordFilters.classId} onValueChange={(v) => setRecordFilters(f => ({ ...f, classId: v }))}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes?.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Status</label>
                <Select value={recordFilters.status} onValueChange={(v) => setRecordFilters(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                    <SelectItem value="excused">Excused</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">From</label>
                <Input
                  type="date"
                  value={recordFilters.startDate}
                  onChange={(e) => setRecordFilters(f => ({ ...f, startDate: e.target.value }))}
                  className="w-40"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">To</label>
                <Input
                  type="date"
                  value={recordFilters.endDate}
                  onChange={(e) => setRecordFilters(f => ({ ...f, endDate: e.target.value }))}
                  className="w-40"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <Button variant="outline" onClick={handleExportCsv}>
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
            </div>

            {recordsLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : records && records.length > 0 ? (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Student</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Check-In</TableHead>
                          <TableHead>Check-Out</TableHead>
                          <TableHead>Tardy</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.map((record: any) => (
                          <TableRow key={record.id}>
                            <TableCell>{formatDate(record.sessionDate)}</TableCell>
                            <TableCell className="font-medium">{record.childName || '—'}</TableCell>
                            <TableCell>{record.className || '—'}</TableCell>
                            <TableCell><StatusBadge status={record.status} /></TableCell>
                            <TableCell>{formatTime(record.checkInTime)}</TableCell>
                            <TableCell>{formatTime(record.checkOutTime)}</TableCell>
                            <TableCell>{record.tardyMinutes ? `${record.tardyMinutes} min` : '—'}</TableCell>
                            <TableCell>
                              {record.locationVerified === true && <Badge variant="default">Verified</Badge>}
                              {record.locationVerified === false && <Badge variant="destructive">Failed</Badge>}
                              {record.locationVerified === null && '—'}
                            </TableCell>
                            <TableCell className="max-w-32 truncate">{record.notes || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <p className="text-muted-foreground text-center py-8">No attendance records found for the selected filters.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Session QR Code
            </DialogTitle>
          </DialogHeader>
          {qrData && (
            <div className="space-y-4 text-center">
              <div className="bg-white p-6 rounded-lg border-2 border-dashed">
                <div className="font-mono text-lg font-bold break-all">{qrData.qrToken}</div>
                <p className="text-sm text-muted-foreground mt-2">
                  Share this code with the educator to check in
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Expires: {new Date(qrData.expiresAt).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                This is a one-time use token. Generate a new one if needed.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SchoolAdminLayout>
  );
}
