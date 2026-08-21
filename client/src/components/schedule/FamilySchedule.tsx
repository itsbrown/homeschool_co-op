import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, List, Grid3X3, Clock, MapPin, User, Download } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  parseISO,
} from "date-fns";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { normalizeParentChildrenResponse } from "@/lib/parent-children-api";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ParentWeekPlanGrid, { getMondayWeekStart } from "@/components/schedule/ParentWeekPlanGrid";

type HubView = "month" | "week" | "list";

const EVENT_TYPE_LABELS: Record<string, string> = {
  class: "Class",
  meeting: "Meeting",
  holiday: "Holiday",
  deadline: "Deadline",
  special: "Special Event",
  workshop: "Workshop",
  camp: "Camp",
  other: "Other",
};

function schoolEventWhenLabel(event: { isAllDay: boolean; startDate: string; endDate: string }): string {
  if (event.isAllDay) return "All day";
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  return `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`;
}

interface ScheduleEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  type: "class";
  childId: string;
  childName: string;
  color: string;
  description?: string;
  programName?: string;
  instructorName?: string;
}

interface SchoolEvent {
  id: number;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  eventType: string;
  color: string | null;
  isAllDay: boolean;
  location: string | null;
  locationId: number | null;
}

interface WeekPlanBlock {
  title?: string | null;
  dayOfWeek?: number;
  isCompleted?: boolean;
}

interface ChildWeekEntry {
  childId: number;
  childName: string;
  classTitle: string;
  blocks?: WeekPlanBlock[];
  skeletonBlocks?: Array<{ dayOfWeek: number; defaultTitle?: string | null }>;
}

function formatTime(timeString: string) {
  if (!timeString) return "";
  const [hours, minutes] = timeString.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, "0")} ${period}`;
}

function viewFromSearch(): HubView {
  const params = new URLSearchParams(window.location.search);
  const v = params.get("view");
  if (v === "week" || v === "list" || v === "month") return v;
  return "month";
}

export default function FamilySchedule() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [childFilter, setChildFilter] = useState("all");
  const [viewMode, setViewMode] = useState<HubView>(viewFromSearch);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  useEffect(() => {
    setViewMode(viewFromSearch());
  }, [location]);

  const scheduleUrl =
    childFilter !== "all" ? `/api/schedule?childId=${encodeURIComponent(childFilter)}` : "/api/schedule";
  const { data: classEvents = [], isLoading: loadingClasses } = useQuery<ScheduleEvent[]>({
    queryKey: [scheduleUrl],
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const eventsUrl = `/api/calendar-events/parent/events?start=${encodeURIComponent(monthStart.toISOString())}&end=${encodeURIComponent(monthEnd.toISOString())}`;
  const { data: schoolEvents = [] } = useQuery<SchoolEvent[]>({
    queryKey: [eventsUrl],
  });

  const { data: children = [] } = useQuery({
    queryKey: ["/api/parent/children"],
    select: (raw: unknown) => normalizeParentChildrenResponse(raw),
  });

  const selectedWeekStart = selectedDay ? getMondayWeekStart(selectedDay) : getMondayWeekStart(currentDate);
  const weekPlansUrl = `/api/schedule-builder/parent/my-week-plans?weekStart=${encodeURIComponent(selectedWeekStart)}`;
  const { data: weekPlans } = useQuery<{ children: ChildWeekEntry[] }>({
    queryKey: [weekPlansUrl],
    enabled: Boolean(selectedDay) || viewMode === "week",
  });

  const daysInMonth = useMemo(
    () => eachDayOfInterval({ start: monthStart, end: monthEnd }),
    [monthStart, monthEnd],
  );

  const classEventsForDay = (day: Date) =>
    classEvents.filter((event) => isSameDay(parseISO(event.date), day));

  const schoolEventsForDay = (day: Date) =>
    schoolEvents.filter((event) => {
      const start = new Date(event.startDate);
      const end = new Date(event.endDate);
      return isSameDay(start, day) || (start <= day && end >= day);
    });

  const monthHasAnything = classEvents.some((e) => isSameMonth(parseISO(e.date), currentDate)) || schoolEvents.length > 0;

  const listRows = useMemo(() => {
    const rows: Array<{ key: string; date: Date; title: string; subtitle: string; kind: "class" | "school" }> = [];
    for (const ev of classEvents) {
      rows.push({
        key: ev.id,
        date: parseISO(ev.date),
        title: ev.title,
        subtitle: `${ev.childName} · ${formatTime(ev.startTime)}–${formatTime(ev.endTime)}`,
        kind: "class",
      });
    }
    for (const ev of schoolEvents) {
      rows.push({
        key: `school-${ev.id}`,
        date: new Date(ev.startDate),
        title: ev.title,
        subtitle: ev.isAllDay ? "All day" : format(new Date(ev.startDate), "h:mm a"),
        kind: "school",
      });
    }
    return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [classEvents, schoolEvents]);

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/calendar/feed-token", {});
      return res.json() as Promise<{ token: string }>;
    },
    onSuccess: async ({ token }) => {
      const httpUrl = `${window.location.origin}/api/calendar/feed/${token}`;
      const webcalUrl = httpUrl.replace(/^https:/, "webcal:").replace(/^http:/, "webcal:");
      try {
        await navigator.clipboard.writeText(webcalUrl);
      } catch {
        // clipboard optional in some browsers / e2e
      }
      toast({
        title: "Subscribe URL ready",
        description: "Copied a webcal link when clipboard is available. Use Subscribe again to re-download.",
      });
      const icsRes = await fetch(httpUrl);
      const blob = await icsRes.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "asa-family-calendar.ics";
      a.click();
      URL.revokeObjectURL(objectUrl);
    },
    onError: () => {
      toast({ title: "Could not create calendar feed", variant: "destructive" });
    },
  });

  const setView = (next: HubView) => {
    setViewMode(next);
    const path = next === "month" ? "/schedule" : `/schedule?view=${next}`;
    if (location !== path && !location.startsWith("/schedule")) {
      setLocation(path);
    } else {
      window.history.replaceState(null, "", path);
      setLocation(path);
    }
  };

  const dayClassEvents = selectedDay ? classEventsForDay(selectedDay) : [];
  const daySchoolEvents = selectedDay ? schoolEventsForDay(selectedDay) : [];
  const dayLessonTitles = (weekPlans?.children || []).flatMap((entry) => {
    const fromBlocks = (entry.blocks || []).flatMap((b) => {
      const skel = (entry.skeletonBlocks || []).find((s: any) => s.id === (b as any).skeletonBlockId);
      if (skel && skel.dayOfWeek === (selectedDay?.getDay() ?? -1)) {
        return [b.title].filter(Boolean) as string[];
      }
      return [];
    });
    const fromSkeleton = (entry.skeletonBlocks || [])
      .filter((b) => b.dayOfWeek === (selectedDay?.getDay() ?? -1))
      .map((b) => b.defaultTitle)
      .filter(Boolean) as string[];
    const titles = fromBlocks.length ? fromBlocks : fromSkeleton;
    return titles.map((title) => ({ childName: entry.childName, classTitle: entry.classTitle, title }));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="family-calendar-heading">
            Calendar
          </h1>
          <p className="text-muted-foreground">Class days and school events for your family</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => subscribeMutation.mutate()}
            disabled={subscribeMutation.isPending}
            data-testid="button-subscribe-calendar"
          >
            <Download className="mr-2 h-4 w-4" />
            Subscribe
          </Button>
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === "month" ? "default" : "ghost"}
              size="sm"
              className="rounded-none rounded-l-md"
              onClick={() => setView("month")}
              data-testid="button-view-month"
            >
              <Grid3X3 className="mr-2 h-4 w-4" />
              Month
            </Button>
            <Button
              variant={viewMode === "week" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setView("week")}
              data-testid="button-view-week"
            >
              Week
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="rounded-none rounded-r-md"
              onClick={() => setView("list")}
              data-testid="button-view-list"
            >
              <List className="mr-2 h-4 w-4" />
              List
            </Button>
          </div>
        </div>
      </div>

      {viewMode !== "week" && (
        <div className="w-full md:w-64">
          <Select value={childFilter} onValueChange={setChildFilter}>
            <SelectTrigger data-testid="select-child-filter">
              <SelectValue placeholder="Filter by child" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Children</SelectItem>
              {Array.isArray(children) &&
                (children as Array<{ id: number; firstName: string; lastName: string }>).map((child) => (
                  <SelectItem key={child.id} value={child.id.toString()}>
                    {child.firstName} {child.lastName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {viewMode === "week" ? (
        <ParentWeekPlanGrid compact />
      ) : viewMode === "list" ? (
        <div className="space-y-3" data-testid="family-calendar-list">
          {listRows.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No class days this month.{" "}
                <Link href="/parent/programs" className="underline">
                  Browse programs
                </Link>
              </CardContent>
            </Card>
          ) : (
            listRows.map((row) => (
              <Card key={row.key} data-testid={`list-row-${row.kind}`}>
                <CardContent className="py-3 flex justify-between gap-3">
                  <div>
                    <p className="font-medium">{row.title}</p>
                    <p className="text-sm text-muted-foreground">{row.subtitle}</p>
                  </div>
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {format(row.date, "EEE, MMM d")}
                  </span>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle data-testid="text-current-month">{format(currentDate, "MMMM yyyy")}</CardTitle>
                <CardDescription>
                  {loadingClasses ? "Loading…" : monthHasAnything ? "Class days and school events" : "No class days this month"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))} data-testid="button-prev-month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} data-testid="button-today">
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))} data-testid="button-next-month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="text-center text-sm font-medium py-1">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1" data-testid="family-calendar-month-grid">
              {Array.from({ length: daysInMonth[0].getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square p-1" />
              ))}
              {daysInMonth.map((day) => {
                const dayClasses = classEventsForDay(day);
                const daySchools = schoolEventsForDay(day);
                const isToday = isSameDay(day, new Date());
                return (
                  <button
                    type="button"
                    key={day.toISOString()}
                    className={cn(
                      "min-h-[88px] p-1 rounded-md border text-left align-top",
                      isToday && "ring-2 ring-primary",
                      !isSameMonth(day, currentDate) && "opacity-50",
                    )}
                    data-testid={`calendar-day-${format(day, "yyyy-MM-dd")}`}
                    onClick={() => setSelectedDay(day)}
                  >
                    <div className="text-xs mb-1">{format(day, "d")}</div>
                    <div className="space-y-0.5">
                      {dayClasses.slice(0, 2).map((ev) => (
                        <div
                          key={ev.id}
                          className="text-[10px] truncate rounded px-1 bg-blue-100 text-blue-800"
                          data-testid="class-chip"
                        >
                          {ev.title}
                        </div>
                      ))}
                      {daySchools.slice(0, 1).map((ev) => (
                        <div
                          key={ev.id}
                          className="text-[10px] truncate rounded px-1 bg-red-100 text-red-800"
                          data-testid="school-event-chip"
                        >
                          {ev.title}
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
            {!loadingClasses && !monthHasAnything && (
              <p className="text-sm text-muted-foreground text-center mt-4">
                No class days this month.{" "}
                <Link href="/parent/programs" className="underline">
                  Browse programs
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(selectedDay)} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent data-testid="family-day-sheet">
          <DialogHeader>
            <DialogTitle>{selectedDay ? format(selectedDay, "EEEE, MMMM d") : "Day"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {dayClassEvents.length === 0 && daySchoolEvents.length === 0 && (
              <p className="text-sm text-muted-foreground">No class days on this date.</p>
            )}
            {dayClassEvents.map((ev) => (
              <div key={ev.id} className="border rounded-md p-3 space-y-1" data-testid="day-sheet-class">
                <p className="font-medium">{ev.title}</p>
                <p className="text-sm flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatTime(ev.startTime)} – {formatTime(ev.endTime)}
                </p>
                <p className="text-sm flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {ev.location}
                </p>
                <p className="text-sm flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {ev.childName}
                  {ev.instructorName ? ` · ${ev.instructorName}` : ""}
                </p>
              </div>
            ))}
            {daySchoolEvents.map((ev) => (
              <div key={ev.id} className="border rounded-md p-3 space-y-2" data-testid="day-sheet-school-event">
                <Badge variant="outline">{EVENT_TYPE_LABELS[ev.eventType] || ev.eventType}</Badge>
                <p className="font-medium">{ev.title}</p>
                {ev.description ? <p className="text-sm whitespace-pre-wrap">{ev.description}</p> : null}
                <p className="text-sm flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {schoolEventWhenLabel(ev)}
                </p>
                {ev.location ? (
                  <p className="text-sm flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {ev.location}
                  </p>
                ) : null}
              </div>
            ))}
            {dayLessonTitles.length > 0 && (
              <div data-testid="day-sheet-lessons">
                <p className="text-sm font-medium mb-1">This day’s lessons</p>
                <ul className="text-sm space-y-1">
                  {dayLessonTitles.map((row, i) => (
                    <li key={`${row.title}-${i}`}>
                      {row.title}{" "}
                      <span className="text-muted-foreground">
                        ({row.childName} · {row.classTitle})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
