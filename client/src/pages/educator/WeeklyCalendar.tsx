import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { 
  Calendar, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  MapPin,
  BookOpen,
  PlayCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  EducatorErrorBoundary, 
  EducatorLoadingState, 
  EducatorEmptyState,
  EducatorErrorState 
} from '@/components/educator/EducatorErrorBoundary';

interface ScheduleEntry {
  id: number;
  assignmentId: number;
  educatorId: number;
  classId: number;
  className: string;
  classLocation?: string;
  scheduleType: 'recurring' | 'one_time' | 'adhoc';
  dayOfWeek?: number;
  scheduledDate?: string;
  startTime: string;
  endTime: string;
  calculatedDate?: string;
  isActive: boolean;
  notes?: string;
}

interface WeekScheduleData {
  weekStart: string;
  schedules: ScheduleEntry[];
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_ABBREV = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

function WeeklyCalendarContent() {
  const [, navigate] = useLocation();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStartDate(new Date()));

  const { data: weekData, isLoading, error, refetch } = useQuery<WeekScheduleData>({
    queryKey: ['/api/educator/schedules/week', currentWeekStart],
    queryFn: async () => {
      const response = await fetch(`/api/educator/schedules/week?weekStart=${currentWeekStart}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch schedule');
      return response.json();
    }
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

  const getWeekDates = () => {
    const dates = [];
    const start = new Date(currentWeekStart);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dates.push({
        dayIndex: i,
        dayName: DAYS_OF_WEEK[i],
        dayAbbrev: DAY_ABBREV[i],
        date: d.toISOString().split('T')[0],
        dateNum: d.getDate(),
        isToday: d.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]
      });
    }
    return dates;
  };

  const getSchedulesForDay = (dateStr: string) => {
    if (!weekData?.schedules) return [];
    return weekData.schedules.filter(s => s.calculatedDate === dateStr);
  };

  const weekDates = getWeekDates();

  if (isLoading) {
    return <EducatorLoadingState message="Loading your weekly schedule..." />;
  }

  if (error) {
    return (
      <EducatorErrorState 
        message="We couldn't load your schedule. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  const weekEndDate = new Date(currentWeekStart);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekRange = `${new Date(currentWeekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Weekly Schedule
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
            Today
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

      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {weekDates.map((day) => {
          const daySchedules = getSchedulesForDay(day.date);
          
          return (
            <Card 
              key={day.date} 
              className={`${day.isToday ? 'border-primary border-2' : ''}`}
              data-testid={`calendar-day-${day.dayIndex}`}
            >
              <CardHeader className={`pb-2 ${day.isToday ? 'bg-primary/10' : ''}`}>
                <CardTitle className="text-sm font-medium flex flex-col items-center">
                  <span className="text-xs text-muted-foreground">{day.dayAbbrev}</span>
                  <span className={`text-lg ${day.isToday ? 'text-primary font-bold' : ''}`}>
                    {day.dateNum}
                  </span>
                  {day.isToday && (
                    <Badge variant="default" className="mt-1 text-xs">Today</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2 space-y-2">
                {daySchedules.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No classes
                  </p>
                ) : (
                  daySchedules.map((schedule) => (
                    <div 
                      key={schedule.id}
                      className="p-2 rounded-md bg-muted hover:bg-muted/80 cursor-pointer transition-colors"
                      onClick={() => navigate(`/educator/my-classes`)}
                      data-testid={`schedule-item-${schedule.id}`}
                    >
                      <div className="flex items-start gap-2">
                        <BookOpen className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{schedule.className}</p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{formatTime(schedule.startTime)}</span>
                          </div>
                          {schedule.classLocation && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{schedule.classLocation}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <PlayCircle className="h-5 w-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            onClick={() => navigate('/educator')}
            data-testid="button-back-dashboard"
          >
            Back to Dashboard
          </Button>
          <Button 
            variant="outline" 
            onClick={() => navigate('/educator/my-classes')}
            data-testid="button-view-classes"
          >
            View All Classes
          </Button>
          <Button 
            variant="outline" 
            onClick={() => navigate('/educator/my-hours')}
            data-testid="button-view-hours"
          >
            View My Hours
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function WeeklyCalendar() {
  return (
    <EducatorErrorBoundary>
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <WeeklyCalendarContent />
      </div>
    </EducatorErrorBoundary>
  );
}
