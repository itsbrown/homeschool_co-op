import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, CalendarDays, CheckCircle2, Loader2, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import type { WeekPlan, WeekPlanBlock, WeeklySkeleton, SkeletonBlock } from "@shared/schema";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMondayWeekStart(from: Date = new Date()): string {
  const d = new Date(from);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shiftWeekStart(weekStart: string, deltaWeeks: number): string {
  const d = new Date(weekStart + "T00:00:00");
  d.setDate(d.getDate() + deltaWeeks * 7);
  return getMondayWeekStart(d);
}

function formatTime(time: string): string {
  if (!time) return "";
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function formatWeekDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface WeekPlanWithDetails extends WeekPlan {
  blocks: WeekPlanBlock[];
}

interface ChildWeekEntry {
  childId: number;
  childName: string;
  classId: number;
  classTitle: string;
  weekPlan: WeekPlan | null;
  blocks?: WeekPlanBlock[];
  skeleton?: WeeklySkeleton | null;
  skeletonBlocks?: SkeletonBlock[];
}

interface MyWeekPlansResponse {
  weekStart: string;
  children: ChildWeekEntry[];
}

interface ScheduleGridProps {
  weekPlan: WeekPlanWithDetails;
  skeleton: WeeklySkeleton;
  skeletonBlocks: SkeletonBlock[];
}

function ScheduleGrid({ weekPlan, skeleton, skeletonBlocks }: ScheduleGridProps) {
  const operatingDays = skeleton.operatingDays || [];
  const dayIndices = operatingDays
    .map((day: string) => DAY_NAMES.indexOf(day))
    .filter((i: number) => i >= 0)
    .sort((a: number, b: number) => a - b);

  const timeSlots = skeletonBlocks
    .filter((sb: SkeletonBlock) => dayIndices.includes(sb.dayOfWeek))
    .reduce((acc: Map<string, SkeletonBlock>, sb: SkeletonBlock) => {
      const key = `${sb.startTime}-${sb.endTime}-${sb.sortOrder}`;
      if (!acc.has(key)) acc.set(key, sb);
      return acc;
    }, new Map<string, SkeletonBlock>());

  const uniqueTimeSlots = Array.from(timeSlots.values()).sort(
    (a: SkeletonBlock, b: SkeletonBlock) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.startTime.localeCompare(b.startTime);
    }
  );

  const blocksBySkeletonBlockId = new Map<number, WeekPlanBlock>();
  weekPlan.blocks.forEach((b: WeekPlanBlock) => {
    blocksBySkeletonBlockId.set(b.skeletonBlockId, b);
  });

  const skeletonBlocksByDayAndTime = new Map<string, SkeletonBlock>();
  skeletonBlocks.forEach((sb: SkeletonBlock) => {
    const key = `${sb.dayOfWeek}-${sb.startTime}-${sb.endTime}-${sb.sortOrder}`;
    skeletonBlocksByDayAndTime.set(key, sb);
  });

  return (
    <div className="schedule-grid-container">
      <div className="hidden md:block print:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse schedule-table">
            <thead>
              <tr>
                <th className="border border-slate-200 bg-gradient-to-b from-blue-50 to-blue-100 px-3 py-3 text-left text-sm font-semibold text-blue-900 w-28 print:bg-blue-50">
                  Time
                </th>
                {dayIndices.map((dayIdx: number) => (
                  <th
                    key={dayIdx}
                    className="border border-slate-200 bg-gradient-to-b from-blue-50 to-blue-100 px-3 py-3 text-center text-sm font-semibold text-blue-900 print:bg-blue-50"
                  >
                    <span className="hidden lg:inline print:inline">{DAY_NAMES[dayIdx]}</span>
                    <span className="lg:hidden print:hidden">{DAY_NAMES_SHORT[dayIdx]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {uniqueTimeSlots.map((slot: SkeletonBlock, idx: number) => (
                <tr key={`${slot.startTime}-${slot.endTime}-${idx}`} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                  <td className="border border-slate-200 px-3 py-2 text-xs text-slate-600 font-medium whitespace-nowrap align-top">
                    <div>{formatTime(slot.startTime)}</div>
                    <div className="text-slate-400">to {formatTime(slot.endTime)}</div>
                  </td>
                  {dayIndices.map((dayIdx: number) => {
                    const key = `${dayIdx}-${slot.startTime}-${slot.endTime}-${slot.sortOrder}`;
                    const skelBlock = skeletonBlocksByDayAndTime.get(key);
                    const planBlock = skelBlock ? blocksBySkeletonBlockId.get(skelBlock.id) : null;

                    const title = planBlock?.title || skelBlock?.defaultTitle || "";
                    const description = planBlock?.description || skelBlock?.defaultDescription || "";
                    const isCompleted = planBlock?.isCompleted || false;
                    const blockType = skelBlock?.blockType || "flexible";

                    if (!skelBlock) {
                      return (
                        <td key={dayIdx} className="border border-slate-200 px-3 py-2 text-center text-slate-300 text-xs">
                          —
                        </td>
                      );
                    }

                    return (
                      <td key={dayIdx} className={`border border-slate-200 px-3 py-2 align-top ${isCompleted ? "bg-green-50/50" : ""}`}>
                        <div className="flex items-start gap-1">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-medium text-slate-800 leading-tight">
                                {title}
                              </span>
                              {isCompleted && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 print:text-green-700" />
                              )}
                            </div>
                            {description && (
                              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 print:line-clamp-none">
                                {description}
                              </p>
                            )}
                            {blockType === "anchor" && (
                              <Badge variant="outline" className="mt-1 text-[10px] px-1.5 py-0 border-blue-200 text-blue-600 print:border-blue-400">
                                Core
                              </Badge>
                            )}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="md:hidden print:hidden space-y-3">
        {dayIndices.map((dayIdx: number) => {
          const dayBlocks = skeletonBlocks
            .filter((sb: SkeletonBlock) => sb.dayOfWeek === dayIdx)
            .sort((a: SkeletonBlock, b: SkeletonBlock) => {
              if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
              return a.startTime.localeCompare(b.startTime);
            });

          if (dayBlocks.length === 0) return null;

          return (
            <Card key={dayIdx} className="border-slate-200">
              <CardHeader className="py-3 px-4 bg-gradient-to-r from-blue-50 to-green-50">
                <CardTitle className="text-base font-semibold text-blue-900">
                  {DAY_NAMES[dayIdx]}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {dayBlocks.map((sb: SkeletonBlock) => {
                  const planBlock = blocksBySkeletonBlockId.get(sb.id);
                  const title = planBlock?.title || sb.defaultTitle;
                  const description = planBlock?.description || sb.defaultDescription || "";
                  const isCompleted = planBlock?.isCompleted || false;

                  return (
                    <div
                      key={sb.id}
                      className={`px-4 py-3 border-b last:border-b-0 border-slate-100 ${isCompleted ? "bg-green-50/30" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">
                          {formatTime(sb.startTime)} – {formatTime(sb.endTime)}
                        </span>
                        {isCompleted && (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                      <div className="text-sm font-medium text-slate-800 mt-1">{title}</div>
                      {description && (
                        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                      )}
                      {sb.blockType === "anchor" && (
                        <Badge variant="outline" className="mt-1 text-[10px] px-1.5 py-0 border-blue-200 text-blue-600">
                          Core
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Fallback when nested skeleton/blocks are not in the list response — fetches detail via existing GETs. */
function WeekPlanView({ weekPlan }: { weekPlan: WeekPlan }) {
  const { data: planDetails, isLoading: loadingDetails } = useQuery<WeekPlanWithDetails>({
    queryKey: ["/api/schedule-builder/week-plans", weekPlan.id],
  });

  const { data: skeleton, isLoading: loadingSkeleton } = useQuery<WeeklySkeleton>({
    queryKey: ["/api/schedule-builder/skeletons", weekPlan.skeletonId],
    enabled: !!weekPlan.skeletonId,
  });

  const { data: skelBlocks, isLoading: loadingSkelBlocks } = useQuery<SkeletonBlock[]>({
    queryKey: ["/api/schedule-builder/skeletons", weekPlan.skeletonId, "blocks"],
    enabled: !!weekPlan.skeletonId,
  });

  if (loadingDetails || loadingSkeleton || loadingSkelBlocks) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="ml-2 text-slate-500">Loading schedule...</span>
      </div>
    );
  }

  if (!planDetails || !skeleton || !skelBlocks) {
    return (
      <div className="text-center py-8 text-slate-500">
        Unable to load schedule details.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:mb-2">
        <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50">
          {skeleton.gradeLevel}
        </Badge>
        <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">
          Week {weekPlan.weekNumber}
        </Badge>
        <span className="text-sm text-slate-500">
          Starting {formatWeekDate(weekPlan.weekStartDate || "")}
        </span>
      </div>
      {weekPlan.notes && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 print:bg-amber-50">
          <strong>Note:</strong> {weekPlan.notes}
        </div>
      )}
      <ScheduleGrid
        weekPlan={planDetails}
        skeleton={skeleton}
        skeletonBlocks={skelBlocks}
      />
    </div>
  );
}

function ChildWeekSection({ entry }: { entry: ChildWeekEntry }) {
  const heading = `${entry.childName} — ${entry.classTitle}`;

  if (!entry.weekPlan) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-800">{heading}</h2>
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <BookOpen className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-slate-500 text-sm">
              No published schedule for this week.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  const hasNested =
    entry.skeleton &&
    Array.isArray(entry.skeletonBlocks) &&
    Array.isArray(entry.blocks);

  return (
    <section className="space-y-3" data-testid={`child-week-section-${entry.childId}-${entry.classId}`}>
      <h2 className="text-lg font-semibold text-slate-800" data-testid={`child-week-heading-${entry.childId}-${entry.classId}`}>
        {heading}
      </h2>
      {hasNested ? (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2 print:mb-2">
            {entry.skeleton!.gradeLevel && (
              <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50">
                {entry.skeleton!.gradeLevel}
              </Badge>
            )}
            <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">
              Week {entry.weekPlan.weekNumber}
            </Badge>
            <span className="text-sm text-slate-500">
              Starting {formatWeekDate(entry.weekPlan.weekStartDate || "")}
            </span>
          </div>
          {entry.weekPlan.notes && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 print:bg-amber-50">
              <strong>Note:</strong> {entry.weekPlan.notes}
            </div>
          )}
          <ScheduleGrid
            weekPlan={{ ...entry.weekPlan, blocks: entry.blocks! }}
            skeleton={entry.skeleton!}
            skeletonBlocks={entry.skeletonBlocks!}
          />
        </div>
      ) : (
        <WeekPlanView weekPlan={entry.weekPlan} />
      )}
    </section>
  );
}

export default function WeeklySchedulePage() {
  const [weekStart, setWeekStart] = useState(() => getMondayWeekStart());

  const { data, isLoading } = useQuery<MyWeekPlansResponse>({
    queryKey: ["/api/schedule-builder/parent/my-week-plans", weekStart],
    queryFn: async () => {
      const res = await fetch(
        `/api/schedule-builder/parent/my-week-plans?weekStart=${encodeURIComponent(weekStart)}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to load weekly schedules");
      }
      return res.json();
    },
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-3 text-lg text-slate-500">Loading schedules...</span>
        </div>
      </div>
    );
  }

  const children = data?.children || [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto weekly-schedule-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 no-print">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-2">
          <CalendarDays className="h-7 w-7 text-blue-600" />
          Weekly Schedule
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-1.5"
            data-testid="weekly-schedule-print"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print / Save as PDF</span>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-6 no-print">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekStart((w) => shiftWeekStart(w, -1))}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>
        <div className="text-sm font-medium text-slate-700">
          Week of {formatWeekDate(weekStart)}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekStart((w) => shiftWeekStart(w, 1))}
          className="gap-1"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="schedule-print-root" data-testid="schedule-print-root">
        <div className="print-header hidden print:block mb-4">
          <h1 className="text-2xl font-bold text-slate-900">Weekly Schedule</h1>
          <p className="text-sm text-slate-600">Week of {formatWeekDate(weekStart)}</p>
        </div>

        {children.length === 0 ? (
          <Card className="border-dashed border-2 border-slate-200">
            <CardContent className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <BookOpen className="h-16 w-16 text-slate-300 mb-4" />
              <h3 className="text-xl font-semibold text-slate-600 mb-2">
                No Schedules Available
              </h3>
              <p className="text-slate-500 max-w-md">
                No children or class enrollments found for this week. Check back soon!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-10">
            {children.map((entry) => (
              <ChildWeekSection
                key={`${entry.childId}-${entry.classId}`}
                entry={entry}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 0.5in;
          }

          body * {
            visibility: hidden;
          }

          .schedule-print-root,
          .schedule-print-root * {
            visibility: visible;
          }

          .schedule-print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0 !important;
          }

          .no-print,
          nav,
          header,
          footer,
          aside,
          [role="navigation"],
          [data-sidebar],
          .sidebar,
          button {
            display: none !important;
          }

          .print-header {
            display: block !important;
          }

          .schedule-table {
            font-size: 11px;
            page-break-inside: avoid;
          }

          .schedule-table th {
            background-color: #eff6ff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .schedule-table td {
            padding: 6px 8px !important;
            border: 1px solid #cbd5e1 !important;
          }

          .schedule-grid-container > div:first-child {
            display: block !important;
          }

          .schedule-grid-container > div:last-child {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
