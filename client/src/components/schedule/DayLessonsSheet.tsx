import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, Clock, MapPin, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { DayLessonChild, DayLessonRow, DayLessonsForDate } from "@/lib/day-lessons";
import { WeekPlanBlockDetailBody } from "@/components/schedule/WeekPlanBlockDetailSheet";

export type DaySheetClassMeeting = {
  id: string;
  title: string;
  timeLabel: string;
  location: string;
  childName: string;
  instructorName?: string;
};

export type DaySheetSchoolEvent = {
  id: string;
  title: string;
  meta?: string;
  description?: string | null;
  whenLabel?: string;
  location?: string | null;
  typeLabel?: string;
};

function childLessonCount(child: DayLessonChild): number {
  return child.sections.reduce((total, section) => total + section.lessons.length, 0);
}

/**
 * Height-capped day sheet. The header stays pinned; only the list scrolls.
 * `family-day-sheet` is the existing calendar test id.
 */
export function DayLessonsSheet({
  open,
  onOpenChange,
  date,
  grouped,
  classMeetings = [],
  schoolEvents = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  grouped: DayLessonsForDate;
  classMeetings?: DaySheetClassMeeting[];
  schoolEvents?: DaySheetSchoolEvent[];
}) {
  const [activeChildId, setActiveChildId] = useState<number | null>(null);
  const [selected, setSelected] = useState<DayLessonRow | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);

  useEffect(() => {
    setSelected(null);
    setActiveChildId(grouped.children[0]?.childId ?? null);
    savedScroll.current = 0;
  }, [date]);

  useEffect(() => {
    if (activeChildId != null && grouped.children.some((child) => child.childId === activeChildId)) {
      return;
    }
    setActiveChildId(grouped.children[0]?.childId ?? null);
  }, [grouped.children, activeChildId]);

  useEffect(() => {
    if (selected) return;
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = savedScroll.current;
  }, [selected]);

  const active =
    grouped.children.find((child) => child.childId === activeChildId) ?? grouped.children[0] ?? null;
  const visibleCount = active ? childLessonCount(active) : 0;
  const countLabel =
    visibleCount > 0
      ? `${visibleCount} lesson${visibleCount === 1 ? "" : "s"}`
      : classMeetings.length + schoolEvents.length > 0
        ? "Class days and school events"
        : "This day";

  function openLesson(lesson: DayLessonRow) {
    savedScroll.current = listRef.current?.scrollTop ?? 0;
    setSelected(lesson);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-testid="family-day-sheet"
        className="flex h-[90dvh] max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:rounded-t-xl"
      >
          <SheetHeader
            data-testid="day-lessons-header"
            className="shrink-0 space-y-1 border-b px-4 pb-3 pr-12 pt-4 text-left"
          >
            <SheetTitle>{date ? format(date, "EEEE, MMMM d") : "Lessons"}</SheetTitle>
            <SheetDescription>{countLabel}</SheetDescription>
            {grouped.showChildChips && (
              <div className="flex flex-wrap gap-2 pt-2">
                {grouped.children.map((child) => {
                  const pressed = child.childId === active?.childId;
                  return (
                    <button
                      key={child.childId}
                      type="button"
                      data-testid={`day-lessons-child-${child.childId}`}
                      aria-pressed={pressed}
                      className={cn(
                        "min-h-11 rounded-full border px-3 text-sm",
                        pressed
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background",
                      )}
                      onClick={() => {
                        setSelected(null);
                        setActiveChildId(child.childId);
                      }}
                    >
                      {child.childName} · {childLessonCount(child)}
                    </button>
                  );
                })}
              </div>
            )}
          </SheetHeader>

          {selected && (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
              <Button
                type="button"
                variant="ghost"
                className="mb-2 -ml-2 min-h-11"
                data-testid="day-lessons-back"
                onClick={() => setSelected(null)}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              <WeekPlanBlockDetailBody block={selected.detail} />
            </div>
          )}

          <div
            ref={listRef}
            data-testid="day-lessons-list"
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6",
              selected && "hidden",
            )}
          >
            {classMeetings.map((meeting) => (
              <div key={meeting.id} className="mt-3 rounded-md border p-3 space-y-1" data-testid="day-sheet-class">
                <p className="font-medium">{meeting.title}</p>
                <p className="text-sm flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {meeting.timeLabel}
                </p>
                <p className="text-sm flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {meeting.location}
                </p>
                <p className="text-sm flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {meeting.childName}
                  {meeting.instructorName ? ` · ${meeting.instructorName}` : ""}
                </p>
              </div>
            ))}

            {schoolEvents.length > 0 && (
              <section data-testid="day-lessons-school-events">
                <p className="px-1 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  School events
                </p>
                {schoolEvents.map((event) => (
                  <div key={event.id} className="mt-2 rounded-md border p-3 space-y-2" data-testid="day-sheet-school-event">
                    {event.typeLabel ? <Badge variant="outline">{event.typeLabel}</Badge> : null}
                    <p className="font-medium">{event.title}</p>
                    {event.description ? <p className="text-sm whitespace-pre-wrap">{event.description}</p> : null}
                    {(event.whenLabel || event.meta) && (
                      <p className="text-sm flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {event.whenLabel || event.meta}
                      </p>
                    )}
                    {event.location ? (
                      <p className="text-sm flex items-center gap-1 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {event.location}
                      </p>
                    ) : null}
                  </div>
                ))}
              </section>
            )}

            {active?.sections.map((section) => (
              <section key={section.classId} data-testid={`day-lessons-section-${section.classId}`}>
                <p className="px-1 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.classTitle}
                </p>
                <ul>
                  {section.lessons.map((lesson) => (
                    <li key={lesson.blockId}>
                      <button
                        type="button"
                        data-testid={`day-lessons-row-${lesson.blockId}`}
                        className="flex min-h-11 w-full items-center border-b px-1 text-left text-sm font-medium"
                        onClick={() => openLesson(lesson)}
                      >
                        {lesson.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
      </SheetContent>
    </Sheet>
  );
}
