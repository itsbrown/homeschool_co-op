import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation, useParams } from 'wouter';
import { Clock, StopCircle, FileText, Users, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { invalidateEducatorSessionQueries } from '@/lib/educator-queries';
import { 
  EducatorErrorBoundary, 
  EducatorLoadingState, 
  EducatorErrorState 
} from '@/components/educator/EducatorErrorBoundary';
import { AttendanceTracker } from '@/components/educator/AttendanceTracker';
import { Checkbox } from '@/components/ui/checkbox';

interface ClassSession {
  id: number;
  classId: number;
  schoolId: number;
  educatorId: number;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  actualStartTime?: string;
  actualEndTime?: string;
  dailyFlowEntryId?: number;
  notes?: string;
  className?: string;
}

function formatDuration(startTime: string): string {
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function ActiveSessionContent({ sessionId }: { sessionId: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [elapsedTime, setElapsedTime] = useState('0m');
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [endNotes, setEndNotes] = useState('');
  const [markRemainingAbsent, setMarkRemainingAbsent] = useState(false);

  const { data: session, isLoading, error, refetch } = useQuery<ClassSession>({
    queryKey: ['/api/educator/sessions', sessionId],
  });

  const { data: roster = [] } = useQuery<Array<{ childId: number; attendance?: { status?: string } | null }>>({
    queryKey: ['/api/educator/sessions', sessionId, 'roster'],
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (!session?.actualStartTime) return;
    
    const updateElapsed = () => {
      setElapsedTime(formatDuration(session.actualStartTime!));
    };
    
    updateElapsed();
    const interval = setInterval(updateElapsed, 60000);
    return () => clearInterval(interval);
  }, [session?.actualStartTime]);

  const endSessionMutation = useMutation({
    mutationFn: async () => {
      if (markRemainingAbsent) {
        const unmarked = roster.filter((row) => !row.attendance?.status);
        if (unmarked.length > 0) {
          await apiRequest('POST', '/api/educator/attendance/bulk', {
            sessionId,
            attendance: unmarked.map((row) => ({ childId: row.childId, status: 'absent' })),
          });
        }
      }
      return apiRequest('POST', `/api/educator/sessions/${sessionId}/end`, { notes: endNotes });
    },
    onSuccess: () => {
      toast({
        title: 'Session ended',
        description: 'Hours are logged. Review who was here, then go back when you are ready.',
      });
      invalidateEducatorSessionQueries();
      refetch();
    },
    onError: (error: any) => {
      console.error('[EducatorDashboard] End session error:', error);
      toast({
        title: 'Failed to end session',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const cancelSessionMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/educator/sessions/${sessionId}/cancel`, { reason: 'Cancelled by educator' });
    },
    onSuccess: () => {
      toast({
        title: 'Session cancelled',
        description: 'The session has been cancelled.',
      });
      invalidateEducatorSessionQueries();
      navigate('/educator');
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to cancel session',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return <EducatorLoadingState message="Loading session..." />;
  }

  if (error) {
    return (
      <EducatorErrorState 
        message="We couldn't load this session. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  if (!session) {
    return (
      <EducatorErrorState 
        title="Session not found"
        message="This session may have been deleted or doesn't exist."
      />
    );
  }

  const isInProgress = session.status === 'in_progress';
  const isCompleted = session.status === 'completed';
  const unmarkedCount = roster.filter((row) => !row.attendance?.status).length;
  const presentCount = roster.filter((row) => row.attendance?.status === 'present' || row.attendance?.status === 'late').length;
  const absentCount = roster.filter((row) => row.attendance?.status === 'absent' || row.attendance?.status === 'excused').length;

  return (
    <div className="space-y-6">
      <Card className={isInProgress ? 'border-green-500' : isCompleted ? 'border-blue-500' : ''}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={isInProgress ? 'default' : 'secondary'}>
                  {session.status === 'in_progress' ? 'In Progress' : 
                   session.status === 'completed' ? 'Completed' : 
                   session.status === 'cancelled' ? 'Cancelled' : 'Scheduled'}
                </Badge>
                {isInProgress && (
                  <div className="flex items-center gap-1 text-sm text-green-600">
                    <div className="animate-pulse h-2 w-2 rounded-full bg-green-500" />
                    Live
                  </div>
                )}
              </div>
              <CardTitle className="text-xl">{session.className || `Class ${session.classId}`}</CardTitle>
              <CardDescription>
                {new Date(session.scheduledDate).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </CardDescription>
            </div>
            {isInProgress && (
              <div className="text-right">
                <div className="text-3xl font-bold text-green-600">{elapsedTime}</div>
                <div className="text-sm text-muted-foreground">Elapsed</div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">Scheduled Start</span>
              <span className="font-medium">{session.scheduledStartTime}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">Scheduled End</span>
              <span className="font-medium">{session.scheduledEndTime}</span>
            </div>
            {session.actualStartTime && (
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground">Actual Start</span>
                <span className="font-medium">
                  {new Date(session.actualStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
            {session.actualEndTime && (
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground">Actual End</span>
                <span className="font-medium">
                  {new Date(session.actualEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
          </div>

          {isInProgress && (
            <div className="flex gap-2">
              <Button 
                onClick={() => setShowEndDialog(true)}
                className="gap-2 bg-red-600 hover:bg-red-700 h-12 min-h-12"
                disabled={endSessionMutation.isPending}
                data-testid="button-end-session"
              >
                <StopCircle className="h-4 w-4" />
                End Session
              </Button>
            </div>
          )}

          {isCompleted && (
            <div
              className="mt-4 p-4 rounded-lg border bg-blue-50 border-blue-200 text-blue-900"
              data-testid="session-end-summary"
            >
              <p className="font-medium">
                {presentCount} present / {absentCount} absent
                {unmarkedCount > 0 ? ` / ${unmarkedCount} unmarked` : ''}
              </p>
              <p className="text-sm mt-1">Session complete. Hours are on My Hours.</p>
              <Button
                variant="outline"
                className="mt-3 h-12 min-h-12"
                onClick={() => navigate('/educator/dashboard')}
                data-testid="button-back-to-dashboard"
              >
                Back to dashboard
              </Button>
            </div>
          )}
          {isCompleted && session.notes && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4" />
                Session Notes
              </h4>
              <p className="text-sm">{session.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {(isInProgress || isCompleted) && (
        <AttendanceTracker 
          sessionId={sessionId} 
          isSessionActive={isInProgress}
          schoolId={session.schoolId}
        />
      )}

      <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Session</AlertDialogTitle>
            <AlertDialogDescription>
              {unmarkedCount > 0
                ? `${unmarkedCount} student${unmarkedCount !== 1 ? 's are' : ' is'} still unmarked.`
                : 'Hours will be logged when you end this session.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            {unmarkedCount > 0 && (
              <label className="flex items-start gap-3 text-sm" htmlFor="mark-remaining-absent">
                <Checkbox
                  id="mark-remaining-absent"
                  checked={markRemainingAbsent}
                  onCheckedChange={(checked) => setMarkRemainingAbsent(checked === true)}
                  data-testid="checkbox-mark-remaining-absent"
                />
                <span>Mark remaining unmarked students absent</span>
              </label>
            )}
            <div>
            <Label htmlFor="session-notes">Session Notes (optional)</Label>
            <Textarea
              id="session-notes"
              placeholder="Add any notes about this session..."
              value={endNotes}
              onChange={(e) => setEndNotes(e.target.value)}
              className="mt-2"
              style={{ fontSize: '16px' }}
              data-testid="input-session-notes"
            />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-end">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowEndDialog(false);
                endSessionMutation.mutate();
              }}
              className="bg-red-600 hover:bg-red-700"
              disabled={endSessionMutation.isPending}
              data-testid="button-confirm-end"
            >
              {endSessionMutation.isPending ? 'Ending...' : 'End Session'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function ActiveSession() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const sessionId = parseInt(params.id || '0');

  if (!sessionId) {
    return (
      <div className="container mx-auto py-6 px-4">
        <EducatorErrorState 
          title="Invalid session"
          message="No session ID provided."
        />
      </div>
    );
  }

  return (
    <EducatorErrorBoundary>
      <div className="container mx-auto py-6 px-4">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            size="sm" 
            className="mb-2 gap-2"
            onClick={() => navigate('/educator')}
            data-testid="button-back-to-dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          <h1 className="text-2xl font-bold" data-testid="text-session-title">
            Session Details
          </h1>
        </div>
        <ActiveSessionContent sessionId={sessionId} />
      </div>
    </EducatorErrorBoundary>
  );
}
