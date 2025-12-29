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
  PlayCircle,
  Cake,
  CalendarDays,
  PartyPopper,
  Sun
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
  type: 'class';
  assignmentId: number;
  educatorId: number;
  classId: number;
  className: string;
  classLocation?: string;
  classStartDate?: string;
  classEndDate?: string;
  scheduleType: 'recurring' | 'one_time' | 'adhoc';
  dayOfWeek?: number;
  scheduledDate?: string;
  startTime: string;
  endTime: string;
  calculatedDate?: string;
  isActive: boolean;
  notes?: string;
}

interface EventEntry {
  id: number;
  type: 'event' | 'holiday';
  title: string;
  description?: string;
  location?: string;
  startDate: string;
  endDate: string;
  isAllDay?: boolean;
  eventType: string;
  color?: string;
  calculatedDate: string;
  schoolId: number;
}

interface WeekScheduleData {
  weekStart: string;
  weekEnd: string;
  schedules: ScheduleEntry[];
  events: EventEntry[];
  holidays: EventEntry[];
}

interface Student {
  id: number;
  firstName: string;
  lastName: string;
  birthdate?: string;
}

interface BirthdayEvent {
  studentId: number;
  studentName: string;
  date: string;
  age: number;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_ABBREV = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekStartDate(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return formatDateLocal(d);
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function parseDateLocal(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00');
}

function calculateAgeOnDate(birthdate: string, targetDate: string): number {
  const target = parseDateLocal(targetDate);
  const bday = parseDateLocal(birthdate);
  return target.getFullYear() - bday.getFullYear();
}

interface WeeklyCalendarProps {
  showBirthdays?: boolean;
  showQuickActions?: boolean;
}

function WeeklyCalendarContent({ showBirthdays = false, showQuickActions = true }: WeeklyCalendarProps) {
  const [, navigate] = useLocation();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStartDate(new Date()));

  const { data: weekData, isLoading, error, refetch } = useQuery<WeekScheduleData>({
    queryKey: [`/api/educator/schedules/week?weekStart=${currentWeekStart}`],
  });

  const { data: studentsResponse } = useQuery<{ students: Student[] }>({
    queryKey: ["/api/educator/my-students"],
    enabled: showBirthdays,
  });

  const goToPreviousWeek = () => {
    const prev = new Date(currentWeekStart + 'T12:00:00');
    prev.setDate(prev.getDate() - 7);
    setCurrentWeekStart(formatDateLocal(prev));
  };

  const goToNextWeek = () => {
    const next = new Date(currentWeekStart + 'T12:00:00');
    next.setDate(next.getDate() + 7);
    setCurrentWeekStart(formatDateLocal(next));
  };

  const goToCurrentWeek = () => {
    setCurrentWeekStart(getWeekStartDate(new Date()));
  };

  const getWeekDates = () => {
    const dates = [];
    const start = new Date(currentWeekStart + 'T12:00:00');
    const todayStr = formatDateLocal(new Date());
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = formatDateLocal(d);
      dates.push({
        dayIndex: i,
        dayName: DAYS_OF_WEEK[i],
        dayAbbrev: DAY_ABBREV[i],
        date: dateStr,
        dateNum: d.getDate(),
        isToday: dateStr === todayStr
      });
    }
    return dates;
  };

  const getSchedulesForDay = (dateStr: string) => {
    if (!weekData?.schedules) return [];
    return weekData.schedules.filter(s => s.calculatedDate === dateStr);
  };

  const getEventsForDay = (dateStr: string): EventEntry[] => {
    if (!weekData?.events) return [];
    return weekData.events.filter(e => e.calculatedDate === dateStr);
  };

  const getHolidaysForDay = (dateStr: string): EventEntry[] => {
    if (!weekData?.holidays) return [];
    return weekData.holidays.filter(h => h.calculatedDate === dateStr);
  };

  const getBirthdaysForDay = (dateStr: string): BirthdayEvent[] => {
    if (!showBirthdays || !studentsResponse?.students) return [];
    
    const targetDate = parseDateLocal(dateStr);
    const targetMonth = targetDate.getMonth();
    const targetDay = targetDate.getDate();
    
    return studentsResponse.students
      .filter(student => {
        if (!student.birthdate) return false;
        const bday = parseDateLocal(student.birthdate);
        return bday.getMonth() === targetMonth && bday.getDate() === targetDay;
      })
      .map(student => ({
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        date: dateStr,
        age: calculateAgeOnDate(student.birthdate!, dateStr)
      }));
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

  const weekStartParsed = new Date(currentWeekStart + 'T12:00:00');
  const weekEndDate = new Date(currentWeekStart + 'T12:00:00');
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekRange = `${weekStartParsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            {showBirthdays ? 'My Schedule' : 'Weekly Schedule'}
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
          const dayEvents = getEventsForDay(day.date);
          const dayHolidays = getHolidaysForDay(day.date);
          const dayBirthdays = getBirthdaysForDay(day.date);
          const isHoliday = dayHolidays.length > 0;
          const hasContent = daySchedules.length > 0 || dayEvents.length > 0 || dayHolidays.length > 0 || dayBirthdays.length > 0;
          
          return (
            <Card 
              key={day.date} 
              className={`${day.isToday ? 'border-primary border-2' : ''} ${isHoliday ? 'bg-amber-50 dark:bg-amber-900/10' : ''}`}
              data-testid={`calendar-day-${day.dayIndex}`}
            >
              <CardHeader className={`pb-2 ${day.isToday ? 'bg-primary/10' : ''} ${isHoliday ? 'bg-amber-100 dark:bg-amber-900/20' : ''}`}>
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
                {/* Holidays */}
                {dayHolidays.map((holiday) => (
                  <div 
                    key={`holiday-${holiday.id}`}
                    className="p-2 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200"
                    data-testid={`holiday-event-${holiday.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <Sun className="h-3 w-3 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{holiday.title}</p>
                        {holiday.description && (
                          <p className="text-xs opacity-75 truncate">{holiday.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Events */}
                {dayEvents.map((event) => (
                  <div 
                    key={`event-${event.id}`}
                    className="p-2 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200"
                    data-testid={`school-event-${event.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <PartyPopper className="h-3 w-3 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{event.title}</p>
                        {!event.isAllDay && (
                          <div className="flex items-center gap-1 text-xs opacity-75">
                            <Clock className="h-3 w-3" />
                            <span>{new Date(event.startDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                          </div>
                        )}
                        {event.location && (
                          <div className="flex items-center gap-1 text-xs opacity-75 mt-0.5">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{event.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Birthdays */}
                {dayBirthdays.map((birthday) => (
                  <div 
                    key={`birthday-${birthday.studentId}`}
                    className="p-2 rounded-md bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-200"
                    data-testid={`birthday-event-${birthday.studentId}`}
                  >
                    <div className="flex items-start gap-2">
                      <Cake className="h-3 w-3 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{birthday.studentName}</p>
                        <p className="text-xs opacity-75">Turns {birthday.age}!</p>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Classes */}
                {daySchedules.map((schedule) => (
                  <div 
                    key={`class-${schedule.id}-${schedule.classId}`}
                    className="p-2 rounded-md bg-muted hover:bg-muted/80 cursor-pointer transition-colors"
                    onClick={() => navigate(`/educator/classes/${schedule.classId}`)}
                    data-testid={`schedule-item-${schedule.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <BookOpen className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{schedule.className}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}</span>
                        </div>
                        {schedule.classLocation && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{schedule.classLocation}</span>
                          </div>
                        )}
                        {schedule.classStartDate && schedule.classEndDate && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <CalendarDays className="h-3 w-3" />
                            <span className="truncate">
                              {new Date(schedule.classStartDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(schedule.classEndDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {!hasContent && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No events
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-muted rounded" />
          <span>Classes</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-purple-200 dark:bg-purple-900/30 rounded" />
          <span>Events</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-amber-200 dark:bg-amber-900/30 rounded" />
          <span>Holidays</span>
        </div>
        {showBirthdays && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-pink-200 dark:bg-pink-900/30 rounded" />
            <span>Birthdays</span>
          </div>
        )}
      </div>

      {showQuickActions && (
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
              onClick={() => navigate('/educator/classes')}
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
      )}
    </div>
  );
}

interface WeeklyCalendarPageProps {
  showBirthdays?: boolean;
  showQuickActions?: boolean;
}

export { WeeklyCalendarContent };

export default function WeeklyCalendar({ showBirthdays = false, showQuickActions = true }: WeeklyCalendarPageProps) {
  return (
    <EducatorErrorBoundary>
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <WeeklyCalendarContent showBirthdays={showBirthdays} showQuickActions={showQuickActions} />
      </div>
    </EducatorErrorBoundary>
  );
}
