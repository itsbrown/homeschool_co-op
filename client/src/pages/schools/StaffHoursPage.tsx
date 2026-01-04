import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Users, Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface EducatorInfo {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface SessionRecord {
  id: number;
  classId: number;
  className: string;
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  actualStartTime?: string;
  actualEndTime?: string;
  status: string;
}

interface StaffHoursEntry {
  educator: EducatorInfo;
  totalScheduledHours: number;
  totalActualHours: number;
  completedSessions: number;
  pendingSessions: number;
  sessions: SessionRecord[];
}

interface StaffHoursData {
  summary: {
    totalEducators: number;
    totalScheduledHours: number;
    totalActualHours: number;
    totalCompletedSessions: number;
    totalPendingSessions: number;
  };
  staffHours: StaffHoursEntry[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekStartDate(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  return formatDateLocal(d);
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function StaffHoursPage() {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStartDate(new Date()));
  const [expandedEducators, setExpandedEducators] = useState<Set<number>>(new Set());

  const endDate = new Date(currentWeekStart + 'T12:00:00');
  endDate.setDate(endDate.getDate() + 6);
  const endDateStr = formatDateLocal(endDate);

  const weekEndDisplay = new Date(currentWeekStart + 'T12:00:00');
  weekEndDisplay.setDate(weekEndDisplay.getDate() + 6);
  const weekRangeDisplay = `${new Date(currentWeekStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEndDisplay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const { data, isLoading, error } = useQuery<StaffHoursData>({
    queryKey: [`/api/school-admin/staff-hours?startDate=${currentWeekStart}&endDate=${endDateStr}`],
  });

  const navigateWeek = (direction: 'prev' | 'next') => {
    const current = new Date(currentWeekStart + 'T12:00:00');
    current.setDate(current.getDate() + (direction === 'prev' ? -7 : 7));
    setCurrentWeekStart(formatDateLocal(current));
  };

  const goToCurrentWeek = () => {
    setCurrentWeekStart(getWeekStartDate(new Date()));
  };

  const toggleEducator = (educatorId: number) => {
    setExpandedEducators(prev => {
      const next = new Set(prev);
      if (next.has(educatorId)) {
        next.delete(educatorId);
      } else {
        next.add(educatorId);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Staff Hours">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-48" />
            <div className="h-32 bg-muted rounded" />
            <div className="h-64 bg-muted rounded" />
          </div>
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error) {
    return (
      <SchoolAdminLayout pageTitle="Staff Hours">
        <div className="max-w-6xl mx-auto">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                <span>Failed to load staff hours. Please try again.</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </SchoolAdminLayout>
    );
  }

  const summary = data?.summary || {
    totalEducators: 0,
    totalScheduledHours: 0,
    totalActualHours: 0,
    totalCompletedSessions: 0,
    totalPendingSessions: 0
  };

  return (
    <SchoolAdminLayout pageTitle="Staff Hours">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <p className="text-muted-foreground">
            Track educator and mentor hours for your school
          </p>
        </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Week Navigation</CardTitle>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigateWeek('prev')}
                data-testid="button-prev-week"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium min-w-[180px] text-center" data-testid="text-week-range">
                {weekRangeDisplay}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigateWeek('next')}
                data-testid="button-next-week"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={goToCurrentWeek}
                data-testid="button-current-week"
              >
                Today
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold" data-testid="text-total-educators">{summary.totalEducators}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Users className="h-4 w-4" />
              Staff Members
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold" data-testid="text-scheduled-hours">
              {formatHours(summary.totalScheduledHours)}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Scheduled
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-emerald-600" data-testid="text-actual-hours">
              {formatHours(summary.totalActualHours)}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Actual Hours
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-green-600" data-testid="text-completed-sessions">
              {summary.totalCompletedSessions}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" />
              Completed
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-amber-600" data-testid="text-pending-sessions">
              {summary.totalPendingSessions}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Pending
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Staff Hours Details
          </CardTitle>
          <CardDescription>
            Click on a staff member to see their session details
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(!data?.staffHours || data.staffHours.length === 0) ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No staff hours recorded for this week</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.staffHours.map((entry) => (
                <Collapsible
                  key={entry.educator.id}
                  open={expandedEducators.has(entry.educator.id)}
                  onOpenChange={() => toggleEducator(entry.educator.id)}
                >
                  <CollapsibleTrigger asChild>
                    <div 
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                      data-testid={`row-educator-${entry.educator.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="font-medium" data-testid={`text-educator-name-${entry.educator.id}`}>
                            {entry.educator.firstName} {entry.educator.lastName}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {entry.educator.email}
                          </div>
                        </div>
                        <Badge variant="outline" className="capitalize">
                          {entry.educator.role}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="font-medium text-emerald-600" data-testid={`text-hours-${entry.educator.id}`}>
                            {formatHours(entry.totalActualHours)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            of {formatHours(entry.totalScheduledHours)} scheduled
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm">
                            <span className="text-green-600">{entry.completedSessions}</span>
                            {' / '}
                            <span className="text-amber-600">{entry.pendingSessions}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            completed / pending
                          </div>
                        </div>
                        {expandedEducators.has(entry.educator.id) ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 ml-4 mr-4 mb-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Class</TableHead>
                            <TableHead>Scheduled</TableHead>
                            <TableHead>Actual</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entry.sessions.map((session) => (
                            <TableRow key={session.id} data-testid={`row-session-${session.id}`}>
                              <TableCell>{formatDateDisplay(session.scheduledDate)}</TableCell>
                              <TableCell>{session.className}</TableCell>
                              <TableCell>
                                {formatTime(session.scheduledStartTime)} - {formatTime(session.scheduledEndTime)}
                              </TableCell>
                              <TableCell>
                                {session.actualStartTime && session.actualEndTime ? (
                                  <>
                                    {new Date(session.actualStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    {' - '}
                                    {new Date(session.actualEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant={session.status === 'completed' ? 'default' : 'secondary'}
                                  className={session.status === 'completed' ? 'bg-green-600' : ''}
                                >
                                  {session.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </SchoolAdminLayout>
  );
}
