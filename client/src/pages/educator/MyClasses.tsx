import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Calendar, Users, MapPin, Clock, PlayCircle, ChevronRight, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  validFrom?: string;
  validTo?: string;
  className: string;
  classDescription?: string;
  classSchedule?: string;
  classLocation?: string;
  capacity?: number;
  enrollmentCount: number;
  schoolId: number;
}

function MyClassesContent() {
  const [, navigate] = useLocation();

  const { data: classes, isLoading, error, refetch } = useQuery<ClassAssignment[]>({
    queryKey: ['/api/educator/my-classes'],
  });

  const { data: activeSessionData } = useQuery<{ activeSession: { id: number; classId: number } | null }>({
    queryKey: ['/api/educator/active-session'],
  });

  if (isLoading) {
    return <EducatorLoadingState message="Loading your classes..." />;
  }

  if (error) {
    return (
      <EducatorErrorState 
        message="We couldn't load your classes. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  if (!classes || classes.length === 0) {
    return (
      <EducatorEmptyState
        title="No Classes Assigned"
        description="You haven't been assigned to any classes yet. Contact your school administrator to get started."
      />
    );
  }

  const hasActiveSession = !!activeSessionData?.activeSession;

  return (
    <div className="grid gap-4">
      {classes.map((classItem) => {
        const isActiveClass = activeSessionData?.activeSession?.classId === classItem.classId;
        
        return (
          <Card 
            key={classItem.assignmentId} 
            className={isActiveClass ? 'border-green-500 bg-green-50 dark:bg-green-950' : ''}
            data-testid={`class-card-${classItem.classId}`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{classItem.className}</CardTitle>
                    {classItem.isPrimary && (
                      <Badge variant="secondary">Primary</Badge>
                    )}
                    {isActiveClass && (
                      <Badge className="bg-green-500">In Session</Badge>
                    )}
                  </div>
                  {classItem.classDescription && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {classItem.classDescription}
                    </p>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {classItem.classSchedule && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{classItem.classSchedule}</span>
                  </div>
                )}
                {classItem.classLocation && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{classItem.classLocation}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>
                    {classItem.enrollmentCount}
                    {classItem.capacity ? ` / ${classItem.capacity}` : ''} students
                  </span>
                </div>
                {classItem.validFrom && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Since {new Date(classItem.validFrom).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {classItem.canStartSession && !hasActiveSession && (
                  <Button 
                    className="gap-2"
                    onClick={() => navigate(`/educator/classes/${classItem.classId}/start-session`)}
                    data-testid={`button-start-session-${classItem.classId}`}
                  >
                    <PlayCircle className="h-4 w-4" />
                    Start Session
                  </Button>
                )}
                {isActiveClass && (
                  <Button 
                    variant="default"
                    className="gap-2 bg-green-600 hover:bg-green-700"
                    onClick={() => navigate(`/educator/session/${activeSessionData?.activeSession?.id}`)}
                    data-testid="button-view-active-session"
                  >
                    View Active Session
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  className="gap-2"
                  onClick={() => navigate(`/educator/classes/${classItem.classId}`)}
                  data-testid={`button-view-class-${classItem.classId}`}
                >
                  View Details
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function MyClasses() {
  const [, navigate] = useLocation();

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
          <h1 className="text-2xl font-bold" data-testid="text-my-classes-title">
            My Classes
          </h1>
          <p className="text-muted-foreground">
            All classes you're assigned to teach
          </p>
        </div>
        <MyClassesContent />
      </div>
    </EducatorErrorBoundary>
  );
}
