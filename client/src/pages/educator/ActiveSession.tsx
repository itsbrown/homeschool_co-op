import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation, useParams } from 'wouter';
import { Clock, StopCircle, FileText, Users, ArrowLeft, AlertCircle, CheckCircle2, BookOpen } from 'lucide-react';
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
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  EducatorErrorBoundary, 
  EducatorLoadingState, 
  EducatorErrorState 
} from '@/components/educator/EducatorErrorBoundary';
import { AttendanceTracker } from '@/components/educator/AttendanceTracker';

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

interface DailyFlowEntry {
  id: number;
  title: string;
  description?: string;
  objectives?: string[];
  materials?: string[];
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

  const { data: session, isLoading, error, refetch } = useQuery<ClassSession>({
    queryKey: ['/api/educator/sessions', sessionId],
  });

  const { data: dailyFlow } = useQuery<DailyFlowEntry | null>({
    queryKey: ['/api/educator/daily-flow', session?.classId],
    enabled: !!session?.classId,
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
      return apiRequest('POST', `/api/educator/sessions/${sessionId}/end`, { notes: endNotes });
    },
    onSuccess: () => {
      toast({
        title: 'Session ended',
        description: 'Your session has been completed successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/educator'] });
      navigate('/educator');
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
      queryClient.invalidateQueries({ queryKey: ['/api/educator'] });
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
                className="gap-2 bg-red-600 hover:bg-red-700"
                disabled={endSessionMutation.isPending}
                data-testid="button-end-session"
              >
                <StopCircle className="h-4 w-4" />
                End Session
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

      {dailyFlow && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Today's Lesson Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <h3 className="font-medium mb-2">{dailyFlow.title}</h3>
            {dailyFlow.description && (
              <p className="text-sm text-muted-foreground mb-4">{dailyFlow.description}</p>
            )}
            
            {dailyFlow.objectives && dailyFlow.objectives.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium mb-2">Learning Objectives</h4>
                <ul className="list-disc list-inside space-y-1">
                  {dailyFlow.objectives.map((objective, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground">{objective}</li>
                  ))}
                </ul>
              </div>
            )}

            {dailyFlow.materials && dailyFlow.materials.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Materials Needed</h4>
                <ul className="list-disc list-inside space-y-1">
                  {dailyFlow.materials.map((material, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground">{material}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
              Are you sure you want to end this session? You can add notes about the session below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="session-notes">Session Notes (optional)</Label>
            <Textarea
              id="session-notes"
              placeholder="Add any notes about this session..."
              value={endNotes}
              onChange={(e) => setEndNotes(e.target.value)}
              className="mt-2"
              data-testid="input-session-notes"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-end">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => endSessionMutation.mutate()}
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
