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
  Sun,
  Printer,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { 
  EducatorErrorBoundary, 
  EducatorLoadingState, 
  EducatorErrorState 
} from '@/components/educator/EducatorErrorBoundary';
import {
  WeekPlanBlockDetailSheet,
  type WeekPlanBlockDetail,
} from '@/components/schedule/WeekPlanBlockDetailSheet';

interface PlanBlockOverlay {
  id: number;
  title: string;
  blockType?: string;
  isCompleted: boolean;
  objectives?: string[];
  description?: string | null;
  lessonLink?: string | null;
  notes?: string | null;
  groups?: string[];
  startTime?: string;
  endTime?: string;
  dayOfWeek?: number;
}

/** Week Planner–style block type accents */
const BLOCK_TYPE_BORDER: Record<string, string> = {
  anchor: "border-l-indigo-500",
  curriculum: "border-l-emerald-500",
  flexible: "border-l-amber-500",
};

const BLOCK_TYPE_BG: Record<string, string> = {
  anchor: "bg-indigo-50/80",
  curriculum: "bg-emerald-50/80",
  flexible: "bg-amber-50/80",
};

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
  planBlocks?: PlanBlockOverlay[];
  planStatus?: 'published' | 'none';
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

/** Normalize to HH:MM 24h for sorting / row keys. */
function toTimeKey(timeStr: string | undefined | null): string {
  if (!timeStr) return "";
  const trimmed = String(timeStr).trim();
  const ampm = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampm) {
    let hour = parseInt(ampm[1], 10);
    const minute = ampm[2] ? parseInt(ampm[2], 10) : 0;
    const period = ampm[3].toLowerCase();
    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const m = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${String(parseInt(m[1], 10)).padStart(2, "0")}:${m[2]}`;
}

function formatTime(timeStr: string | undefined | null): string {
  const key = toTimeKey(timeStr);
  if (!key) {
    if (!timeStr || typeof timeStr !== "string") return "Time TBD";
    const trimmed = timeStr.trim();
    if (!trimmed) return "Time TBD";
    const ampm = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (ampm) {
      const hour = parseInt(ampm[1], 10);
      const minute = ampm[2] ? parseInt(ampm[2], 10) : 0;
      const period = ampm[3].toUpperCase();
      const hour12 = hour % 12 || 12;
      return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
    }
    return "Time TBD";
  }
  const [h, m] = key.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** ASA print sheet day-header palette (Mon / Wed / Fri style). */
const PRINT_DAY_HEADERS = [
  { background: "#C02D2E", color: "#ffffff" },
  { background: "#ffffff", color: "#111111" },
  { background: "#004B87", color: "#ffffff" },
];

function isBreakishTitle(title: string): boolean {
  return /recess|snack|break|lunch|clean\s*up|dismissal|arrival|transition/i.test(title);
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

type SelectedItem = 
  | { type: 'class'; data: ScheduleEntry }
  | { type: 'event'; data: EventEntry }
  | { type: 'holiday'; data: EventEntry }
  | { type: 'birthday'; data: BirthdayEvent }
  | null;

function WeeklyCalendarContent({ showBirthdays = false, showQuickActions = true }: WeeklyCalendarProps) {
  const [, navigate] = useLocation();
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailBlock, setDetailBlock] = useState<WeekPlanBlockDetail | null>(null);

  const handleItemClick = (item: SelectedItem) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const ws = params.get("weekStart");
      if (ws && /^\d{4}-\d{2}-\d{2}$/.test(ws)) return ws;
    }
    return getWeekStartDate(new Date());
  });

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

  const openPlanBlockDetail = (schedule: ScheduleEntry, block: PlanBlockOverlay) => {
    const dayName =
      schedule.dayOfWeek != null && schedule.dayOfWeek >= 0 && schedule.dayOfWeek < 7
        ? DAYS_OF_WEEK[schedule.dayOfWeek]
        : "";
    const blockStart = block.startTime || schedule.startTime;
    const blockEnd = block.endTime || schedule.endTime;
    setDetailBlock({
      title: block.title,
      description: block.description,
      blockType: block.blockType,
      isCompleted: block.isCompleted,
      objectives: block.objectives,
      groups: block.groups,
      notes: block.notes,
      lessonLink: block.lessonLink,
      timeLabel: `${dayName} · ${formatTime(blockStart)} – ${formatTime(blockEnd)}`,
    });
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

  /** Teaching days only (for ASA-style print grid). */
  const printColumns = weekDates
    .map((day) => {
      const schedules = getSchedulesForDay(day.date);
      if (schedules.length === 0) return null;
      const blocksByTime = new Map<string, PlanBlockOverlay>();
      for (const schedule of schedules) {
        for (const block of schedule.planBlocks || []) {
          const key = toTimeKey(block.startTime);
          if (key && !blocksByTime.has(key)) blocksByTime.set(key, block);
        }
      }
      return {
        day,
        className: schedules[0]?.className || "",
        blocksByTime,
      };
    })
    .filter((col): col is NonNullable<typeof col> => col != null);

  const printTimeKeys = Array.from(
    new Set(printColumns.flatMap((col) => Array.from(col.blocksByTime.keys()))),
  ).sort();

  const printClassTitle =
    printColumns.find((c) => c.className)?.className || "Weekly Schedule";
  const printClassShort = printClassTitle.split("|")[0]?.trim() || printClassTitle;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 no-print">
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
          <Button
            variant="outline"
            onClick={() => window.print()}
            data-testid="educator-schedule-print"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* ASA-style printable week grid (Time × teaching days) — print only */}
      <div className="schedule-print-root" data-testid="schedule-print-root" aria-hidden="true">
        <div className="asa-print-sheet">
          <div className="asa-print-brand-row">
            <div className="asa-print-brand-mark">
              <span className="asa-print-brand-line1">AMERICAN SEEKERS</span>
              <span className="asa-print-brand-line2">Academy</span>
            </div>
          </div>
          <h1 className="asa-print-title">{printClassShort}</h1>
          <div className="asa-print-week-rule" />
          <p className="asa-print-week-label">WEEK OF {weekRange.toUpperCase()}</p>

          {printColumns.length === 0 || printTimeKeys.length === 0 ? (
            <p className="asa-print-empty">No published lesson blocks for this week.</p>
          ) : (
            <table className="asa-print-table">
              <thead>
                <tr>
                  <th className="asa-print-th-time">Time</th>
                  {printColumns.map((col, idx) => {
                    const style = PRINT_DAY_HEADERS[idx % PRINT_DAY_HEADERS.length];
                    return (
                      <th
                        key={col.day.date}
                        style={{
                          background: style.background,
                          color: style.color,
                          borderColor: style.background === "#ffffff" ? "#111111" : style.background,
                        }}
                      >
                        {col.day.dayName.toUpperCase()}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {printTimeKeys.map((timeKey) => {
                  const rowBlocks = printColumns.map((col) => col.blocksByTime.get(timeKey));
                  const breakRow = rowBlocks.some((b) => b && isBreakishTitle(b.title));
                  return (
                    <tr key={timeKey} className={breakRow ? "asa-print-row-break" : undefined}>
                      <td className="asa-print-td-time">{formatTime(timeKey)}</td>
                      {printColumns.map((col) => {
                        const block = col.blocksByTime.get(timeKey);
                        return (
                          <td key={`${col.day.date}-${timeKey}`} className="asa-print-td-cell">
                            {block ? (
                              <div className="asa-print-cell-inner">
                                <div className="asa-print-cell-title">{block.title}</div>
                                {Array.isArray(block.objectives) && block.objectives[0] && (
                                  <div className="asa-print-cell-sub">{block.objectives[0]}</div>
                                )}
                                {block.lessonLink && (
                                  <div className="asa-print-cell-link">{block.lessonLink}</div>
                                )}
                              </div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="no-print grid grid-cols-1 md:grid-cols-7 gap-4">
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
                  {dayHolidays.map((holiday) => (
                    <div 
                      key={`holiday-${holiday.id}`}
                      className="p-2 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors no-print"
                      data-testid={`holiday-event-${holiday.id}`}
                      onClick={() => handleItemClick({ type: 'holiday', data: holiday })}
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

                  {dayEvents.map((event) => (
                    <div 
                      key={`event-${event.id}`}
                      className="p-2 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 cursor-pointer hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors no-print"
                      data-testid={`school-event-${event.id}`}
                      onClick={() => handleItemClick({ type: 'event', data: event })}
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

                  {dayBirthdays.map((birthday) => (
                    <div 
                      key={`birthday-${birthday.studentId}`}
                      className="p-2 rounded-md bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-200 cursor-pointer hover:bg-pink-200 dark:hover:bg-pink-900/50 transition-colors no-print"
                      data-testid={`birthday-event-${birthday.studentId}`}
                      onClick={() => handleItemClick({ type: 'birthday', data: birthday })}
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
                  
                  {daySchedules.map((schedule) => {
                    const planBlocks = schedule.planBlocks || [];
                    const showEmpty = planBlocks.length === 0;
                    return (
                      <div
                        key={`class-${schedule.id}-${schedule.classId}-${schedule.dayOfWeek}-${schedule.startTime}`}
                        className="space-y-1.5"
                        data-testid="schedule-class-card"
                      >
                        <button
                          type="button"
                          className="w-full text-left px-1.5 py-1 rounded-md hover:bg-muted/70 transition-colors print:px-0.5 print:py-0.5"
                          onClick={() => handleItemClick({ type: "class", data: schedule })}
                        >
                          <div className="flex items-center gap-1 min-w-0">
                            <BookOpen className="h-2.5 w-2.5 text-primary shrink-0 print:hidden" />
                            <p className="text-[11px] font-semibold truncate leading-tight print:text-[9px]">
                              {schedule.className}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5 pl-3.5 print:pl-0 print:text-[8px] print:mt-0">
                            <Clock className="h-2.5 w-2.5 shrink-0 print:hidden" />
                            <span>
                              {formatTime(schedule.startTime)} – {formatTime(schedule.endTime)}
                            </span>
                          </div>
                        </button>

                        {planBlocks.map((block) => {
                          const type = block.blockType || "flexible";
                          return (
                            <button
                              key={block.id}
                              type="button"
                              className={`schedule-print-block w-full text-left pl-1.5 pr-1 py-1 rounded-sm border-l-[3px] ${BLOCK_TYPE_BORDER[type] || "border-l-slate-300"} ${BLOCK_TYPE_BG[type] || "bg-slate-50"} hover:brightness-[0.98] transition-colors print:pl-1 print:pr-0.5 print:py-0.5 print:rounded-none`}
                              data-testid="schedule-plan-block"
                              onClick={(e) => {
                                e.stopPropagation();
                                openPlanBlockDetail(schedule, block);
                              }}
                            >
                              <div className="flex items-center gap-1 text-[9px] text-slate-500 leading-none mb-0.5 print:text-[7.5px] print:mb-0">
                                <Clock className="h-2 w-2 shrink-0 print:hidden" />
                                <span>
                                  {formatTime(block.startTime)} – {formatTime(block.endTime)}
                                </span>
                              </div>
                              <p className="text-[10px] font-medium text-slate-800 leading-snug line-clamp-2 print:text-[8px] print:leading-tight print:line-clamp-2">
                                {block.title}
                              </p>
                            </button>
                          );
                        })}

                        {showEmpty && (
                          <Badge
                            variant="outline"
                            className="ml-1 text-[9px] px-1.5 py-0 text-muted-foreground font-normal no-print"
                            data-testid="schedule-plan-empty"
                          >
                            No plan this week
                          </Badge>
                        )}
                      </div>
                    );
                  })}

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

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground no-print">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm border-l-[3px] border-l-indigo-500 bg-indigo-50" />
          <span>Anchor</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm border-l-[3px] border-l-emerald-500 bg-emerald-50" />
          <span>Curriculum</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm border-l-[3px] border-l-amber-500 bg-amber-50" />
          <span>Flexible</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-purple-200 rounded" />
          <span>Events</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-amber-200 rounded" />
          <span>Holidays</span>
        </div>
        {showBirthdays && (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 bg-pink-200 rounded" />
            <span>Birthdays</span>
          </div>
        )}
      </div>

      {showQuickActions && (
        <Card className="no-print">
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md no-print" data-testid="schedule-item-dialog">
          {selectedItem?.type === 'class' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  {selectedItem.data.className}
                </DialogTitle>
                <DialogDescription>Class Details</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{formatTime(selectedItem.data.startTime)} - {formatTime(selectedItem.data.endTime)}</span>
                </div>
                {selectedItem.data.classLocation && (
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedItem.data.classLocation}</span>
                  </div>
                )}
                {selectedItem.data.classStartDate && selectedItem.data.classEndDate && (
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {new Date(selectedItem.data.classStartDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - {new Date(selectedItem.data.classEndDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                )}
                {selectedItem.data.notes && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">{selectedItem.data.notes}</p>
                  </div>
                )}

                <div className="pt-2 border-t space-y-1.5 max-h-64 overflow-y-auto">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Lesson plan
                  </p>
                  {(selectedItem.data.planBlocks || []).length === 0 ? (
                    <Badge variant="outline" data-testid="schedule-plan-empty">
                      No plan this week
                    </Badge>
                  ) : (
                    (selectedItem.data.planBlocks || []).map((block) => {
                      const type = block.blockType || "flexible";
                      return (
                        <button
                          key={block.id}
                          type="button"
                          className={`w-full text-left pl-2 pr-2 py-1.5 rounded-sm border-l-[3px] ${BLOCK_TYPE_BORDER[type] || "border-l-slate-300"} ${BLOCK_TYPE_BG[type] || "bg-slate-50"} hover:brightness-[0.98]`}
                          data-testid="schedule-plan-block"
                          onClick={() => {
                            setDialogOpen(false);
                            openPlanBlockDetail(selectedItem.data, block);
                          }}
                        >
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            <span>
                              {formatTime(block.startTime)} – {formatTime(block.endTime)}
                            </span>
                          </div>
                          <p className="text-sm font-medium leading-snug">{block.title}</p>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="pt-4 flex gap-2">
                  <Button 
                    onClick={() => {
                      setDialogOpen(false);
                      navigate(`/educator/classes/${selectedItem.data.classId}`);
                    }}
                    data-testid="button-view-class-details"
                  >
                    View Full Details
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false);
                      navigate(`/educator/classes/${selectedItem.data.classId}/start-session`);
                    }}
                    data-testid="button-start-session"
                  >
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Start Session
                  </Button>
                </div>
              </div>
            </>
          )}

          {selectedItem?.type === 'event' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <PartyPopper className="h-5 w-5 text-purple-600" />
                  {selectedItem.data.title}
                </DialogTitle>
                <DialogDescription>School Event</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                {!selectedItem.data.isAllDay && (
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{new Date(selectedItem.data.startDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                )}
                {selectedItem.data.isAllDay && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <Badge variant="secondary">All Day Event</Badge>
                  </div>
                )}
                {selectedItem.data.location && (
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedItem.data.location}</span>
                  </div>
                )}
                {selectedItem.data.description && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">{selectedItem.data.description}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {selectedItem?.type === 'holiday' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sun className="h-5 w-5 text-amber-600" />
                  {selectedItem.data.title}
                </DialogTitle>
                <DialogDescription>Holiday / School Closure</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{new Date(selectedItem.data.calculatedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
                {selectedItem.data.description && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">{selectedItem.data.description}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {selectedItem?.type === 'birthday' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Cake className="h-5 w-5 text-pink-600" />
                  {selectedItem.data.studentName}
                </DialogTitle>
                <DialogDescription>Student Birthday</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{new Date(selectedItem.data.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                </div>
                <div className="flex items-center gap-3">
                  <PartyPopper className="h-4 w-4 text-muted-foreground" />
                  <span className="text-lg font-medium">Turning {selectedItem.data.age} years old!</span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <WeekPlanBlockDetailSheet
        open={!!detailBlock}
        onClose={() => setDetailBlock(null)}
        block={detailBlock}
      />

      <style>{`
        .schedule-print-root {
          display: none !important;
        }

        @media print {
          @page {
            size: letter portrait;
            margin: 0.4in 0.35in;
          }

          html, body {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .schedule-print-root,
          .schedule-print-root * {
            visibility: visible !important;
          }

          .schedule-print-root {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0 !important;
            color: #111;
            font-family: Georgia, "Times New Roman", Times, serif;
          }

          .no-print,
          nav,
          aside,
          header,
          footer,
          [data-radix-portal],
          [role="dialog"],
          [role="navigation"] {
            display: none !important;
            visibility: hidden !important;
          }

          .asa-print-sheet {
            width: 100%;
          }

          .asa-print-brand-row {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 0.15rem;
          }

          .asa-print-brand-mark {
            text-align: right;
            line-height: 1.05;
          }

          .asa-print-brand-line1 {
            display: block;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 0.04em;
            color: #004B87;
          }

          .asa-print-brand-line2 {
            display: block;
            font-family: Georgia, "Times New Roman", Times, serif;
            font-size: 14px;
            font-style: italic;
            color: #C02D2E;
          }

          .asa-print-title {
            text-align: center;
            font-family: Georgia, "Times New Roman", Times, serif;
            font-size: 28px;
            font-style: italic;
            font-weight: 700;
            color: #C02D2E;
            margin: 0.1rem 0 0.25rem;
            line-height: 1.1;
          }

          .asa-print-week-rule {
            border-top: 1px solid #94a3b8;
            margin: 0.15rem 0 0.35rem;
          }

          .asa-print-week-label {
            text-align: center;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.06em;
            margin: 0 0 0.45rem;
            color: #111;
          }

          .asa-print-empty {
            text-align: center;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11px;
            color: #64748b;
          }

          .asa-print-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-family: Arial, Helvetica, sans-serif;
          }

          .asa-print-table th,
          .asa-print-table td {
            border: 1px solid #94a3b8;
            vertical-align: top;
            padding: 3px 4px;
          }

          .asa-print-th-time,
          .asa-print-table thead th:first-child {
            width: 12%;
            background: #111111 !important;
            color: #ffffff !important;
            font-size: 10px;
            font-weight: 800;
            text-align: center;
            vertical-align: middle;
          }

          .asa-print-table thead th:not(:first-child) {
            width: auto;
            font-size: 11px;
            font-weight: 800;
            text-align: center;
            letter-spacing: 0.03em;
            padding: 5px 4px;
          }

          .asa-print-td-time {
            width: 12%;
            font-size: 9px;
            font-weight: 800;
            text-align: center;
            vertical-align: middle !important;
            white-space: nowrap;
            background: #fff;
          }

          .asa-print-td-cell {
            font-size: 8px;
            line-height: 1.2;
            text-align: center;
          }

          .asa-print-cell-inner {
            display: flex;
            flex-direction: column;
            gap: 1px;
            align-items: center;
          }

          .asa-print-cell-title {
            font-weight: 700;
            color: #111;
            max-width: 100%;
          }

          .asa-print-cell-sub {
            font-weight: 400;
            color: #334155;
            font-size: 7.5px;
          }

          .asa-print-cell-link {
            color: #1d4ed8;
            text-decoration: underline;
            font-size: 7px;
            word-break: break-all;
          }

          .asa-print-row-break td:not(.asa-print-td-time) {
            background: #e5e7eb !important;
          }

          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
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
