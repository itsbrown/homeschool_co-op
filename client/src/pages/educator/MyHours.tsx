import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { 
  Clock, 
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Timer,
  TrendingUp,
  ArrowLeft
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  EducatorErrorBoundary, 
  EducatorLoadingState, 
  EducatorEmptyState,
  EducatorErrorState 
} from '@/components/educator/EducatorErrorBoundary';

interface SessionData {
  id: number;
  classId: number;
  className: string;
  status: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  actualStartTime?: string;
  actualEndTime?: string;
  scheduledMinutes: number;
  actualMinutes: number;
  notes?: string;
}

interface DailySession {
  date: string;
  sessions: SessionData[];
}

interface HoursSummary {
  totalScheduledMinutes: number;
  totalScheduledHours: number;
  totalActualMinutes: number;
  totalActualHours: number;
  completedSessions: number;
  cancelledSessions: number;
  totalSessions: number;
}

interface MyHoursData {
  startDate: string;
  endDate: string;
  summary: HoursSummary;
  sessionsByDate: DailySession[];
}

function getWeekStartDate(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'scheduled': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
}

function MyHoursContent() {
  const [, navigate] = useLocation();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStartDate(new Date()));

  const weekEnd = new Date(currentWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const endDateStr = weekEnd.toISOString().split('T')[0];

  const { data: hoursData, isLoading, error, refetch } = useQuery<MyHoursData>({
    queryKey: [`/api/educator/my-hours?startDate=${currentWeekStart}&endDate=${endDateStr}`],
  });

  const goToPreviousWeek = () => {
    const prev = new Date(currentWeekStart);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeekStart(prev.toISOString().split('T')[0]);
  };

  const goToNextWeek = () => {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() + 7);
    setCurrentWeekStart(next.toISOString().split('T')[0]);
  };

  const goToCurrentWeek = () => {
    setCurrentWeekStart(getWeekStartDate(new Date()));
  };

  if (isLoading) {
    return <EducatorLoadingState message="Loading your hours..." />;
  }

  if (error) {
    return (
      <EducatorErrorState 
        message="We couldn't load your hours. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  const weekRange = `${new Date(currentWeekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const summary = hoursData?.summary || {
    totalScheduledMinutes: 0,
    totalScheduledHours: 0,
    totalActualMinutes: 0,
    totalActualHours: 0,
    completedSessions: 0,
    cancelledSessions: 0,
    totalSessions: 0
  };

  const completionRate = summary.totalScheduledMinutes > 0 
    ? Math.round((summary.totalActualMinutes / summary.totalScheduledMinutes) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => navigate('/educator')}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6" />
            My Hours
          </h1>
          <p className="text-muted-foreground">{weekRange}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={goToPreviousWeek}
            data-testid="button-prev-week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline"
            onClick={goToCurrentWeek}
            data-testid="button-current-week"
          >
            This Week
          </Button>
          <Button 
            variant="outline" 
            size="icon"
            onClick={goToNextWeek}
            data-testid="button-next-week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Scheduled Hours</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalScheduledHours}h</div>
            <p className="text-xs text-muted-foreground">
              {formatMinutes(summary.totalScheduledMinutes)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Actual Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary.totalActualHours}h</div>
            <p className="text-xs text-muted-foreground">
              {formatMinutes(summary.totalActualMinutes)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sessions</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.completedSessions}/{summary.totalSessions}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.cancelledSessions} cancelled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completion</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionRate}%</div>
            <Progress value={completionRate} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Session Details
          </CardTitle>
          <CardDescription>
            View your sessions for the selected week
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(!hoursData?.sessionsByDate || hoursData.sessionsByDate.length === 0) ? (
            <EducatorEmptyState 
              title="No sessions recorded for this week"
              description="Sessions will appear here once you start and complete classes."
            />
          ) : (
            <div className="space-y-6">
              {hoursData.sessionsByDate.map((day) => (
                <div key={day.date} className="space-y-2">
                  <h3 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {new Date(day.date).toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </h3>
                  <div className="space-y-2 ml-6">
                    {day.sessions.map((session) => (
                      <div 
                        key={session.id}
                        className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                        data-testid={`session-${session.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="font-medium">{session.className}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-4">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTime(session.scheduledStartTime)} - {formatTime(session.scheduledEndTime)}
                              </span>
                              <span className="text-xs">
                                Scheduled: {formatMinutes(session.scheduledMinutes)}
                              </span>
                              {session.actualMinutes > 0 && (
                                <span className="text-xs text-green-600">
                                  Actual: {formatMinutes(session.actualMinutes)}
                                </span>
                              )}
                            </div>
                            {session.notes && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Notes: {session.notes}
                              </p>
                            )}
                          </div>
                          <Badge className={getStatusColor(session.status)}>
                            {session.status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                            {session.status === 'cancelled' && <XCircle className="h-3 w-3 mr-1" />}
                            {session.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MyHours() {
  return (
    <EducatorErrorBoundary>
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <MyHoursContent />
      </div>
    </EducatorErrorBoundary>
  );
}
