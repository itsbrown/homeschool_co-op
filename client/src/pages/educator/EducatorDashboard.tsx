import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Calendar, Clock, BookOpen, Users, PlayCircle, StopCircle, ChevronRight, Timer, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { createAndStartEducatorSession, invalidateEducatorSessionQueries } from '@/lib/educator-queries';
import { 
  EducatorErrorBoundary, 
  EducatorLoadingState, 
  EducatorEmptyState,
  EducatorErrorState 
} from '@/components/educator/EducatorErrorBoundary';

interface ClassAssignment {
  assignmentId: number;
  classId: number;
  isPrimary: boolean;
  canStartSession: boolean;
  className: string;
  classDescription?: string;
  classSchedule?: string;
  enrollmentCount: number;
  schoolId: number;
  meetsToday?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  minutesUntilStart?: number | null;
}

interface ActiveSession {
  id: number;
  classId: number;
  className: string;
  status: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  actualStartTime?: string;
}

interface DashboardData {
  todayClasses: ClassAssignment[];
  assignedClassCount?: number;
  activeSession: ActiveSession | null;
  upcomingSessions: number;
  completedToday: number;
}

function startsInLabel(minutesUntil: number | null | undefined): string | null {
  if (minutesUntil == null) return null;
  if (minutesUntil > 120) return null;
  if (minutesUntil > 1) return `Starts in ${minutesUntil} min`;
  if (minutesUntil >= -15) return 'Starting now';
  if (minutesUntil >= -180) return 'Meeting window';
  return null;
}

function DashboardContent() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: dashboardData, isLoading, error, refetch } = useQuery<DashboardData>({
    queryKey: ['/api/educator/dashboard'],
  });

  const { data: activeSessionData } = useQuery<{ activeSession: ActiveSession | null }>({
    queryKey: ['/api/educator/active-session'],
    refetchInterval: 30000,
  });

  const startMutation = useMutation({
    mutationFn: (classId: number) => createAndStartEducatorSession(classId),
    onSuccess: (session) => {
      invalidateEducatorSessionQueries();
      toast({
        title: 'Session started',
        description: 'Take attendance on this screen.',
      });
      navigate(`/educator/session/${session.id}`);
    },
    onError: (err: Error) => {
      toast({
        title: 'Could not start session',
        description: err.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return <EducatorLoadingState message="Loading your dashboard..." />;
  }

  if (error) {
    return (
      <EducatorErrorState 
        message="We couldn't load your dashboard. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  const activeSession = activeSessionData?.activeSession || dashboardData?.activeSession;
  const assignedCount = dashboardData?.assignedClassCount ?? dashboardData?.todayClasses?.length ?? 0;

  return (
    <div className="space-y-6">
      {activeSession && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-green-800 dark:text-green-200 flex items-center gap-2">
                <div className="relative">
                  <div className="animate-ping absolute h-3 w-3 rounded-full bg-green-400 opacity-75" />
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                </div>
                Session in Progress
              </CardTitle>
              <Badge variant="outline" className="bg-green-100 text-green-800">
                Active
              </Badge>
            </div>
            <CardDescription className="text-green-700 dark:text-green-300">
              {activeSession.className}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-4 text-sm text-green-700 dark:text-green-300">
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Started: {activeSession.actualStartTime 
                    ? new Date(activeSession.actualStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'N/A'}
                </span>
              </div>
              <Button 
                onClick={() => navigate(`/educator/session/${activeSession.id}`)}
                className="gap-2 h-12 min-h-12 w-full sm:w-auto"
                data-testid="button-view-session"
              >
                <StopCircle className="h-4 w-4" />
                Continue session
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today's Classes</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-today-class-count">
              {dashboardData?.todayClasses?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Meet on today's weekday</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData?.completedToday || 0}</div>
            <p className="text-xs text-muted-foreground">Sessions finished</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData?.upcomingSessions || 0}</div>
            <p className="text-xs text-muted-foreground">Sessions scheduled</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Today's Schedule</CardTitle>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/educator/my-classes')}
              data-testid="button-view-all-classes"
            >
              View All Classes
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!dashboardData?.todayClasses || dashboardData.todayClasses.length === 0 ? (
            <EducatorEmptyState
              title={assignedCount > 0 ? 'Nothing meets today' : 'No Classes Today'}
              description={
                assignedCount > 0
                  ? 'None of your assigned classes meet on this weekday. Open My Classes to start a session anyway.'
                  : "You don't have any classes scheduled for today. Check your full class list for upcoming sessions."
              }
              action={
                <Button 
                  variant="outline"
                  onClick={() => navigate('/educator/my-classes')}
                  data-testid="button-browse-classes"
                >
                  Browse My Classes
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {dashboardData.todayClasses.map((classItem) => {
                const when = startsInLabel(classItem.minutesUntilStart);
                const startingThisClass = startMutation.isPending && startMutation.variables === classItem.classId;
                return (
                <div 
                  key={classItem.assignmentId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  data-testid={`class-card-${classItem.classId}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium">{classItem.className}</h4>
                      {classItem.isPrimary && (
                        <Badge variant="secondary" className="text-xs">Primary</Badge>
                      )}
                      {when && (
                        <Badge variant="outline" className="text-xs" data-testid={`text-starts-in-${classItem.classId}`}>
                          {when}
                        </Badge>
                      )}
                    </div>
                    {classItem.classSchedule && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {classItem.classSchedule}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{classItem.enrollmentCount} students enrolled</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {classItem.canStartSession && !activeSession && (
                      <Button 
                        className="gap-2 h-12 min-h-12 flex-1 sm:flex-none"
                        onClick={() => startMutation.mutate(classItem.classId)}
                        disabled={startMutation.isPending}
                        data-testid={`button-start-session-${classItem.classId}`}
                      >
                        {startingThisClass ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <PlayCircle className="h-4 w-4" />
                        )}
                        Start
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="h-12 min-h-12"
                      onClick={() => navigate(`/educator/classes/${classItem.classId}`)}
                      data-testid={`button-view-class-${classItem.classId}`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button 
            variant="outline"
            onClick={() => navigate('/educator/weekly-calendar')}
            data-testid="button-weekly-calendar"
            className="gap-2"
          >
            <Calendar className="h-4 w-4" />
            Weekly Calendar
          </Button>
          <Button 
            variant="outline"
            onClick={() => navigate('/educator/my-hours')}
            data-testid="button-my-hours"
            className="gap-2"
          >
            <Timer className="h-4 w-4" />
            My Hours
          </Button>
          <Button 
            variant="outline"
            onClick={() => navigate('/educator/my-classes')}
            data-testid="button-all-classes"
            className="gap-2"
          >
            <BookOpen className="h-4 w-4" />
            All My Classes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EducatorDashboard() {
  return (
    <EducatorErrorBoundary>
      <div className="container mx-auto py-6 px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" data-testid="text-educator-dashboard-title">
            Educator Dashboard
          </h1>
          <p className="text-muted-foreground">
            Manage your classes and track your sessions
          </p>
        </div>
        <DashboardContent />
      </div>
    </EducatorErrorBoundary>
  );
}
