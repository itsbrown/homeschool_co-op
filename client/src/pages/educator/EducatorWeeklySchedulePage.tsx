import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Printer,
  CalendarDays,
  BookOpen,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Users,
  Target,
} from "lucide-react";
import type { WeekPlan, WeekPlanBlock, WeeklySkeleton, SkeletonBlock } from "@shared/schema";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(time: string): string {
  if (!time) return "";
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function formatWeekDate(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatWeekRange(dateStr: string, operatingDays: string[]): string {
  if (!dateStr) return "";
  const start = new Date(dateStr + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function blockTypeBadge(blockType: string) {
  if (blockType === "anchor") {
    return (
      <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">
        Core
      </Badge>
    );
  }
  if (blockType === "curriculum") {
    return (
      <Badge className="text-[10px] px-1.5 py-0 bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100">
        Curriculum
      </Badge>
    );
  }
  return (
    <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100">
      Flexible
    </Badge>
  );
}

interface WeekPlanWithDetails extends WeekPlan {
  blocks: WeekPlanBlock[];
}

interface ScheduleGridProps {
  weekPlan: WeekPlanWithDetails;
  skeleton: WeeklySkeleton;
  skeletonBlocks: SkeletonBlock[];
}

function ScheduleGrid({ weekPlan, skeleton, skeletonBlocks }: ScheduleGridProps) {
  const operatingDays: string[] = skeleton.operatingDays || [];
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
      {/* Desktop table view */}
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

                    if (!skelBlock) {
                      return (
                        <td key={dayIdx} className="border border-slate-200 px-3 py-2 text-center text-slate-300 text-xs">
                          —
                        </td>
                      );
                    }

                    const title = planBlock?.title || skelBlock?.defaultTitle || "";
                    const description = planBlock?.description || skelBlock?.defaultDescription || "";
                    const isCompleted = planBlock?.isCompleted || false;
                    const blockType = skelBlock?.blockType || "flexible";
                    const objectives: string[] = Array.isArray(planBlock?.objectives) ? planBlock.objectives as string[] : [];
                    const groups: string[] = Array.isArray(planBlock?.groups) ? planBlock.groups as string[] : [];
                    const lessonLink = planBlock?.lessonLink || "";

                    return (
                      <td key={dayIdx} className={`border border-slate-200 px-3 py-2 align-top ${isCompleted ? "bg-green-50/40" : ""}`}>
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex items-start gap-1">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 flex-wrap">
                                {blockTypeBadge(blockType)}
                                {isCompleted && (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 print:text-green-700" />
                                )}
                              </div>
                              {title && (
                                <p className="text-sm font-semibold text-slate-800 mt-1 leading-tight">
                                  {title}
                                </p>
                              )}
                              {description && (
                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-3 print:line-clamp-none">
                                  {description}
                                </p>
                              )}
                            </div>
                          </div>

                          {objectives.length > 0 && (
                            <div className="mt-1 print:mt-0.5">
                              <div className="flex items-center gap-1 mb-0.5">
                                <Target className="h-3 w-3 text-purple-400 print:hidden" />
                                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Objectives</span>
                              </div>
                              <ul className="space-y-0.5">
                                {objectives.map((obj: string, i: number) => (
                                  <li key={i} className="text-xs text-slate-600 flex gap-1">
                                    <span className="text-slate-400 flex-shrink-0">•</span>
                                    <span className="line-clamp-2 print:line-clamp-none">{obj}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {groups.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap mt-0.5">
                              <Users className="h-3 w-3 text-amber-400 flex-shrink-0 print:hidden" />
                              {groups.map((g: string, i: number) => (
                                <Badge key={i} className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">
                                  {g}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {lessonLink && (
                            <a
                              href={lessonLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 underline mt-0.5 print:hidden"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Lesson Link
                            </a>
                          )}
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

      {/* Mobile card view */}
      <div className="md:hidden print:hidden space-y-4">
        {dayIndices.map((dayIdx: number) => {
          const dayBlocks = skeletonBlocks
            .filter((sb: SkeletonBlock) => sb.dayOfWeek === dayIdx)
            .sort((a: SkeletonBlock, b: SkeletonBlock) => {
              if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
              return a.startTime.localeCompare(b.startTime);
            });

          if (dayBlocks.length === 0) return null;

          return (
            <Card key={dayIdx} className="border-slate-200 shadow-sm">
              <CardHeader className="py-3 px-4 bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardTitle className="text-base font-semibold text-blue-900">
                  {DAY_NAMES[dayIdx]}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {dayBlocks.map((sb: SkeletonBlock) => {
                  const planBlock = blocksBySkeletonBlockId.get(sb.id);
                  const title = planBlock?.title || sb.defaultTitle || "";
                  const description = planBlock?.description || sb.defaultDescription || "";
                  const isCompleted = planBlock?.isCompleted || false;
                  const objectives: string[] = Array.isArray(planBlock?.objectives) ? planBlock.objectives as string[] : [];
                  const groups: string[] = Array.isArray(planBlock?.groups) ? planBlock.groups as string[] : [];
                  const lessonLink = planBlock?.lessonLink || "";

                  return (
                    <div
                      key={sb.id}
                      className={`px-4 py-3 border-b last:border-b-0 border-slate-100 ${isCompleted ? "bg-green-50/30" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-500 font-medium">
                          {formatTime(sb.startTime)} – {formatTime(sb.endTime)}
                        </span>
                        <div className="flex items-center gap-1">
                          {blockTypeBadge(sb.blockType || "flexible")}
                          {isCompleted && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                        </div>
                      </div>

                      {title && (
                        <p className="text-sm font-semibold text-slate-800 mt-1">{title}</p>
                      )}
                      {description && (
                        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                      )}

                      {objectives.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1">Objectives</p>
                          <ul className="space-y-0.5">
                            {objectives.map((obj: string, i: number) => (
                              <li key={i} className="text-xs text-slate-600 flex gap-1">
                                <span className="text-slate-400 flex-shrink-0">•</span>
                                {obj}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {groups.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {groups.map((g: string, i: number) => (
                            <Badge key={i} className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">
                              {g}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {lessonLink && (
                        <a
                          href={lessonLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 underline mt-2"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open Lesson
                        </a>
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
        <span className="ml-2 text-slate-500">Loading lesson plan...</span>
      </div>
    );
  }

  if (!planDetails || !skeleton || !skelBlocks) {
    return (
      <div className="text-center py-8 text-slate-500">Unable to load lesson plan details.</div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:mb-2">
        {skeleton.gradeLevel && (
          <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50">
            {skeleton.gradeLevel}
          </Badge>
        )}
        <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">
          Week {weekPlan.weekNumber}
        </Badge>
        {weekPlan.weekStartDate && (
          <span className="text-sm text-slate-500">
            {formatWeekRange(weekPlan.weekStartDate, skeleton.operatingDays || [])}
          </span>
        )}
      </div>

      {weekPlan.notes && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <strong>Week Note:</strong> {weekPlan.notes}
        </div>
      )}

      <ScheduleGrid weekPlan={planDetails} skeleton={skeleton} skeletonBlocks={skelBlocks} />
    </div>
  );
}

export default function EducatorWeeklySchedulePage() {
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  const { data: publishedPlans, isLoading } = useQuery<WeekPlan[]>({
    queryKey: ["/api/schedule-builder/week-plans", "published"],
  });

  const plans = publishedPlans || [];

  const activePlanId = selectedPlanId ?? (plans.length > 0 ? plans[0].id : null);
  const activePlan = plans.find((p) => p.id === activePlanId) ?? plans[0];
  const activeIndex = activePlan ? plans.indexOf(activePlan) : 0;

  const handlePrev = () => {
    if (activeIndex > 0) setSelectedPlanId(plans[activeIndex - 1].id);
  };

  const handleNext = () => {
    if (activeIndex < plans.length - 1) setSelectedPlanId(plans[activeIndex + 1].id);
  };

  const handlePrint = () => window.print();

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-6 w-72" />
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <title>Lesson Plans | ASA Educator Portal</title>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2 flex items-center gap-2">
          <BookOpen className="h-7 w-7 text-blue-600" />
          Lesson Plans
        </h1>
        <p className="text-slate-500 mb-8">Published weekly lesson plans from your school admin</p>
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <CalendarDays className="h-16 w-16 text-slate-300 mb-4" />
            <h3 className="text-xl font-semibold text-slate-600 mb-2">No Lesson Plans Published Yet</h3>
            <p className="text-slate-500 max-w-md">
              Your school admin hasn't published any week plans yet. Once they publish a week from the Week Planner, it will appear here for you to teach from.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto educator-lesson-plans">
      <title>Lesson Plans | ASA Educator Portal</title>

      {/* Print header — only visible when printing */}
      <div className="print-header hidden print:block mb-4 border-b-2 border-blue-200 pb-3">
        <h1 className="text-xl font-bold text-slate-900">ASA Lesson Plan</h1>
        {activePlan && (
          <p className="text-sm text-slate-600">
            Week {activePlan.weekNumber}
            {activePlan.weekStartDate ? ` · Starting ${formatWeekDate(activePlan.weekStartDate)}` : ""}
          </p>
        )}
      </div>

      {/* Screen header */}
      <div className="no-print">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-2">
              <BookOpen className="h-7 w-7 text-blue-600" />
              Lesson Plans
            </h1>
            <p className="text-slate-500 mt-1">Published weekly plans from your school admin</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="flex items-center gap-2 self-start"
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>

        {/* Week navigator */}
        <div className="flex items-center gap-3 mb-6 bg-slate-50 border border-slate-200 rounded-lg p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrev}
            disabled={activeIndex === 0}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex-1 flex flex-wrap gap-2 justify-center">
            {plans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  plan.id === activePlanId
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                Week {plan.weekNumber}
                {plan.weekStartDate && (
                  <span className={`ml-1.5 text-xs ${plan.id === activePlanId ? "text-blue-200" : "text-slate-400"}`}>
                    {new Date(plan.weekStartDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleNext}
            disabled={activeIndex === plans.length - 1}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Active week plan */}
      <Card className="shadow-sm">
        <CardHeader className="border-b border-slate-100 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <CardTitle className="text-lg font-semibold text-slate-800">
              {activePlan
                ? `Week ${activePlan.weekNumber}${activePlan.weekStartDate ? ` · ${formatWeekRange(activePlan.weekStartDate, [])}` : ""}`
                : "Lesson Plan"}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {activePlan ? (
            <WeekPlanView weekPlan={activePlan} />
          ) : (
            <p className="text-slate-400 text-center py-8">Select a week above to view its lesson plan.</p>
          )}
        </CardContent>
      </Card>

      <style>{`
        @media print {
          .educator-lesson-plans {
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            padding: 12px 16px !important;
            max-width: none !important;
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

          .line-clamp-3 {
            -webkit-line-clamp: unset !important;
            display: block !important;
            overflow: visible !important;
          }
        }
      `}</style>
    </div>
  );
}
