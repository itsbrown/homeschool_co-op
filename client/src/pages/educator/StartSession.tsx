import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation, useParams } from 'wouter';
import { PlayCircle, ArrowLeft, Clock, Users, AlertCircle, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { invalidateEducatorSessionQueries, createAndStartEducatorSession } from '@/lib/educator-queries';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  EducatorErrorBoundary, 
  EducatorLoadingState, 
  EducatorErrorState 
} from '@/components/educator/EducatorErrorBoundary';
import { useStaffGuide } from '@/contexts/StaffGuideContext';

interface ClassInfo {
  id: number;
  title: string;
  description?: string;
  location?: string;
  capacity?: number;
  enrollmentCount?: number;
  volunteerWaiverId?: number;
}

interface AssignedEducator {
  id: number;
  educatorId: number;
  educatorName: string;
  educatorEmail: string;
  role: string;
  isPrimary: boolean;
}

function StartSessionContent({ classId }: { classId: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { clearStep } = useStaffGuide();
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    clearStep();
  }, [clearStep]);

  const { data: classInfo, isLoading, error } = useQuery<ClassInfo>({
    queryKey: [`/api/educator/classes/${classId}`],
  });

  const { data: assignedEducators = [], isLoading: loadingAssignments } = useQuery<AssignedEducator[]>({
    queryKey: [`/api/educator/classes/${classId}/assignments`],
    enabled: !!classId,
  });

  const preAssignedAides = assignedEducators.filter(
    (e) => !e.isPrimary && (e.role?.toLowerCase() === 'aide' || e.role?.toLowerCase() === 'assistant')
  );

  const createAndStartMutation = useMutation({
    mutationFn: () => createAndStartEducatorSession(classId),
    onSuccess: (session) => {
      toast({
        title: 'Session started',
        description: 'Your class session has begun. Track attendance and manage your class.',
      });
      invalidateEducatorSessionQueries();
      navigate(`/educator/session/${session.id}`);
    },
    onError: (error: any) => {
      console.error('Failed to start session:', error);
      toast({
        title: 'Failed to start session',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
      setIsStarting(false);
    },
  });

  const handleStartSession = () => {
    setIsStarting(true);
    createAndStartMutation.mutate();
  };

  const handleGoBack = () => {
    navigate('/educator/my-classes');
  };

  if (isLoading) {
    return <EducatorLoadingState message="Loading class information..." />;
  }

  if (error || !classInfo) {
    return (
      <EducatorErrorState
        title="Couldn't load class"
        message="We couldn't find this class. Please go back and try again."
        onRetry={handleGoBack}
      />
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-2xl">
      <Button 
        variant="ghost" 
        onClick={handleGoBack}
        className="mb-4"
        data-testid="button-back"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to My Classes
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="h-6 w-6 text-emerald-600" />
            Start Session
          </CardTitle>
          <CardDescription>
            Begin a new session for this class
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-lg" data-testid="text-class-name">
              {classInfo.title}
            </h3>
            {classInfo.description && (
              <p className="text-sm text-muted-foreground">
                {classInfo.description}
              </p>
            )}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {classInfo.location && (
                <span className="flex items-center gap-1">
                  📍 {classInfo.location}
                </span>
              )}
              {classInfo.enrollmentCount !== undefined && (
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {classInfo.enrollmentCount} students
                </span>
              )}
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Starting a session will:
                </p>
                <ul className="mt-2 space-y-1 text-amber-700 dark:text-amber-300">
                  <li>• Record your check-in time for hour tracking</li>
                  <li>• Open the class roster so you can mark who is here</li>
                </ul>
              </div>
            </div>
          </div>

          {(loadingAssignments || preAssignedAides.length > 0) && (
            <div className="border rounded-lg p-4 space-y-3">
              <Label className="font-medium">Assigned aides</Label>
              <p className="text-xs text-muted-foreground">
                Aides listed on this class. Session volunteer check-in is not available yet.
              </p>
              {loadingAssignments ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                preAssignedAides.map((aide) => (
                  <div
                    key={aide.id}
                    className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30"
                    data-testid={`preassigned-aide-${aide.educatorId}`}
                  >
                    <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <UserCheck className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{aide.educatorName}</p>
                      <p className="text-xs text-muted-foreground">{aide.role}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              Current time: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleGoBack}
              className="flex-1"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleStartSession}
              disabled={isStarting || createAndStartMutation.isPending}
              className="flex-1 h-12 min-h-12 bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-start-session"
            >
              {isStarting || createAndStartMutation.isPending ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Start Session
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function StartSessionPage() {
  const params = useParams<{ id: string }>();
  const classId = parseInt(params.id || '0');

  if (!classId) {
    return (
      <EducatorErrorState
        title="Invalid class"
        message="No class ID provided."
      />
    );
  }

  return (
    <EducatorErrorBoundary>
      <StartSessionContent classId={classId} />
    </EducatorErrorBoundary>
  );
}
