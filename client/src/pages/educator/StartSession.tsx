import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation, useParams } from 'wouter';
import { PlayCircle, ArrowLeft, Clock, Users, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  EducatorErrorBoundary, 
  EducatorLoadingState, 
  EducatorErrorState 
} from '@/components/educator/EducatorErrorBoundary';

interface ClassInfo {
  id: number;
  title: string;
  description?: string;
  location?: string;
  capacity?: number;
  enrollmentCount?: number;
}

interface CreatedSession {
  id: number;
  classId: number;
  status: string;
}

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeLocal(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function StartSessionContent({ classId }: { classId: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isStarting, setIsStarting] = useState(false);

  const { data: classInfo, isLoading, error } = useQuery<ClassInfo>({
    queryKey: [`/api/educator/classes/${classId}`],
  });

  const createAndStartMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      
      const sessionData = {
        classId,
        scheduledDate: formatDateLocal(now),
        scheduledStartTime: formatTimeLocal(now),
        scheduledEndTime: formatTimeLocal(endTime),
      };

      const createResponse = await apiRequest('POST', '/api/educator/sessions', sessionData);
      const createdSession: CreatedSession = await createResponse.json();
      
      await apiRequest('POST', `/api/educator/sessions/${createdSession.id}/start`);
      
      return createdSession;
    },
    onSuccess: (session) => {
      toast({
        title: 'Session started',
        description: 'Your class session has begun. Track attendance and manage your class.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/educator'] });
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
                  <li>• Allow you to take attendance</li>
                  <li>• Access the daily lesson plan</li>
                </ul>
              </div>
            </div>
          </div>

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
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
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
