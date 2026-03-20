import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Printer,
  CalendarDays,
  BookOpen,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Users,
  Target,
  Pencil,
  Save,
} from "lucide-react";
import type { WeekPlan, WeekPlanBlock, WeeklySkeleton, SkeletonBlock } from "@shared/schema";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BLOCK_TYPE_COLORS, BLOCK_TYPE_BADGE_COLORS, type BlockType } from "@/lib/blockColors";
import { useRole } from "@/contexts/RoleContext";

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

function formatWeekRange(dateStr: string): string {
  if (!dateStr) return "";
  const start = new Date(dateStr + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function blockTypeBadge(blockType: BlockType) {
  const badgeColors = BLOCK_TYPE_BADGE_COLORS[blockType] || BLOCK_TYPE_BADGE_COLORS.flexible;
  const label = blockType === "anchor" ? "Core" : blockType === "curriculum" ? "Curriculum" : "Flexible";
  return (
    <Badge className={cn("text-[10px] px-1.5 py-0", badgeColors)}>
      {label}
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
  completionOverrides: Record<number, boolean>;
  onToggle: (planBlock: WeekPlanBlock) => void;
  isToggling: boolean;
}

function InlineBlockDetails({ planBlock }: { planBlock: WeekPlanBlock | null | undefined }) {
  if (!planBlock) return null;

  const objectives: string[] = Array.isArray(planBlock.objectives) ? (planBlock.objectives as string[]) : [];
  const groups: string[] = Array.isArray(planBlock.groups) ? (planBlock.groups as string[]) : [];
  const description = planBlock.description || "";
  const notes = planBlock.notes || "";
  const lessonLink = planBlock.lessonLink || "";

  const hasContent = description || objectives.length > 0 || groups.length > 0 || notes || lessonLink;

  if (!hasContent) {
    return (
      <p className="text-xs text-slate-400 italic py-2">No additional details for this block.</p>
    );
  }

  return (
    <div className="space-y-3 pt-2 border-t border-slate-100 mt-2">
      {description && (
        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{description}</p>
      )}

      {objectives.length > 0 && (
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Target className="h-3 w-3 text-purple-500" />
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Objectives</span>
          </div>
          <ul className="space-y-0.5">
            {objectives.map((obj: string, i: number) => (
              <li key={i} className="flex gap-1.5 text-xs text-slate-700">
                <span className="text-purple-400 font-bold flex-shrink-0">•</span>
                <span>{obj}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.length > 0 && (
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Users className="h-3 w-3 text-amber-500" />
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Groups</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {groups.map((g: string, i: number) => (
              <Badge key={i} className="px-1.5 py-0 text-[10px] bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">
                {g}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {notes && (
        <div>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Notes</span>
          <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap bg-amber-50 border border-amber-100 rounded p-2 mt-1">
            {notes}
          </p>
        </div>
      )}

      {lessonLink && (
        <a
          href={lessonLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          <ExternalLink className="h-3 w-3" />
          Open Lesson Resource
        </a>
      )}
    </div>
  );
}

function ScheduleGrid({ weekPlan, skeleton, skeletonBlocks, completionOverrides, onToggle, isToggling }: ScheduleGridProps) {
  const [expandedBlocks, setExpandedBlocks] = useState<Record<number, boolean>>({});

  const toggleExpand = (blockId: number) => {
    setExpandedBlocks((prev) => ({ ...prev, [blockId]: !prev[blockId] }));
  };

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
                <tr
                  key={`${slot.startTime}-${slot.endTime}-${idx}`}
                  className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}
                >
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
                        <td
                          key={dayIdx}
                          className="border border-slate-200 px-3 py-2 text-center text-slate-300 text-xs"
                        >
                          —
                        </td>
                      );
                    }

                    const isExpanded = !!expandedBlocks[skelBlock.id];
                    const title = planBlock?.title || skelBlock.defaultTitle || "";
                    const effectiveCompleted = planBlock ? (completionOverrides[planBlock.id] ?? planBlock.isCompleted) : false;
                    const blockType = skelBlock.blockType || "flexible";

                    return (
                      <td
                        key={dayIdx}
                        className={cn(
                          "border border-slate-200 p-0 align-top",
                          effectiveCompleted ? "bg-green-50/40 print:bg-green-50" : ""
                        )}
                      >
                        <div className="flex flex-col px-3 py-2 gap-1 min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            {blockTypeBadge(blockType)}
                            {effectiveCompleted && (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 print:text-green-700" />
                            )}
                          </div>
                          <button
                            data-testid={`expand-toggle-${skelBlock.id}`}
                            className={cn(
                              "w-full text-left hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded transition-colors group print:pointer-events-none",
                              effectiveCompleted ? "opacity-60" : ""
                            )}
                            onClick={() => toggleExpand(skelBlock.id)}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? "Collapse" : "Expand"} details for ${title || "block"} on ${DAY_NAMES[dayIdx]}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="flex-1 min-w-0">
                                {title && (
                                  <p className={cn(
                                    "text-sm font-semibold text-slate-800 leading-tight",
                                    effectiveCompleted && "line-through",
                                    isExpanded ? "" : "line-clamp-2 print:line-clamp-none"
                                  )}>
                                    {title}
                                  </p>
                                )}
                              </div>
                              <ChevronDown
                                className={cn(
                                  "h-3.5 w-3.5 text-slate-400 mt-0.5 flex-shrink-0 transition-transform duration-200 print:hidden",
                                  isExpanded ? "rotate-180" : ""
                                )}
                              />
                            </div>
                          </button>

                          {isExpanded && (
                            <div>
                              <InlineBlockDetails planBlock={planBlock} />
                              {planBlock && (
                                <div className="flex items-center gap-2 pt-2 mt-2 border-t border-slate-100 print:hidden">
                                  <Checkbox
                                    id={`complete-desktop-${planBlock.id}`}
                                    checked={effectiveCompleted}
                                    onCheckedChange={() => onToggle(planBlock)}
                                    disabled={isToggling}
                                    aria-label={`Mark ${title || "block"} as ${effectiveCompleted ? "incomplete" : "complete"}`}
                                  />
                                  <label htmlFor={`complete-desktop-${planBlock.id}`} className="text-xs text-slate-600 cursor-pointer select-none">
                                    {effectiveCompleted ? "Completed" : "Mark as complete"}
                                  </label>
                                  {isToggling && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
                                </div>
                              )}
                            </div>
                          )}
                          {!isExpanded && planBlock && (
                            <div className="hidden print:block">
                              <InlineBlockDetails planBlock={planBlock} />
                            </div>
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
        <p className="text-xs text-slate-400 mt-2 print:hidden">
          Click any block to expand full lesson details.
        </p>
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
                  const effectiveCompleted = planBlock ? (completionOverrides[planBlock.id] ?? planBlock.isCompleted) : false;
                  const isExpanded = expandedBlocks[sb.id] || false;

                  return (
                    <div
                      key={sb.id}
                      className={cn(
                        "px-4 py-3 border-b last:border-b-0 border-slate-100 border-l-4 transition-colors",
                        BLOCK_TYPE_COLORS[sb.blockType || "flexible"] || "border-l-slate-200",
                        effectiveCompleted ? "bg-green-50/30 opacity-60" : ""
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-500 font-medium">
                          {formatTime(sb.startTime)} – {formatTime(sb.endTime)}
                        </span>
                        <div className="flex items-center gap-1">
                          {blockTypeBadge(sb.blockType || "flexible")}
                          {effectiveCompleted && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                        </div>
                      </div>
                      <button
                        data-testid={`expand-toggle-mobile-${sb.id}`}
                        className={cn(
                          "w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 group",
                          effectiveCompleted ? "opacity-60" : ""
                        )}
                        onClick={() => toggleExpand(sb.id)}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Collapse" : "Expand"} details for ${title || "block"} at ${formatTime(sb.startTime)}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex-1 min-w-0">
                            {title && (
                              <p className={cn(
                                "text-sm font-semibold text-slate-800 mt-1 text-left",
                                effectiveCompleted && "line-through",
                                isExpanded ? "" : "line-clamp-2"
                              )}>
                                {title}
                              </p>
                            )}
                          </div>
                          <span className="flex-shrink-0 text-blue-400 mt-1">
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 transition-transform duration-200",
                                isExpanded ? "rotate-180" : ""
                              )}
                            />
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="mt-1">
                          <InlineBlockDetails planBlock={planBlock} />
                          {planBlock && (
                            <div className="flex items-center gap-2 pt-2 mt-2 border-t border-slate-100">
                              <Checkbox
                                id={`complete-mobile-${planBlock.id}`}
                                checked={effectiveCompleted}
                                onCheckedChange={() => onToggle(planBlock)}
                                disabled={isToggling}
                                aria-label={`Mark ${title || "block"} as ${effectiveCompleted ? "incomplete" : "complete"}`}
                              />
                              <label htmlFor={`complete-mobile-${planBlock.id}`} className="text-xs text-slate-600 cursor-pointer select-none">
                                {effectiveCompleted ? "Completed" : "Mark as complete"}
                              </label>
                              {isToggling && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
                            </div>
                          )}
                        </div>
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

function WeekNoteSection({ weekPlan, canEdit }: { weekPlan: WeekPlan; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(weekPlan.notes || "");
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: (notes: string) =>
      apiRequest("PATCH", `/api/schedule-builder/week-plans/${weekPlan.id}`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/week-plans", weekPlan.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/week-plans", "published"] });
      setEditing(false);
      toast({ title: "Week note saved" });
    },
    onError: () => {
      toast({ title: "Failed to save note", variant: "destructive" });
    },
  });

  if (canEdit && editing) {
    return (
      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg print:hidden">
        <label className="text-sm font-semibold text-amber-800 block mb-1">Week Note</label>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="text-sm bg-white border-amber-300 focus-visible:ring-amber-400"
          placeholder="Add a note for this week..."
        />
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate(draft.trim())}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(weekPlan.notes || ""); }} disabled={saveMutation.isPending}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (weekPlan.notes) {
    return (
      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <div className="flex items-start justify-between gap-2">
          <div>
            <strong>Week Note:</strong> {weekPlan.notes}
          </div>
          {canEdit && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-amber-600 hover:text-amber-800 print:hidden" onClick={() => { setDraft(weekPlan.notes || ""); setEditing(true); }} aria-label="Edit week note">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (canEdit) {
    return (
      <div className="mb-4 print:hidden">
        <Button size="sm" variant="outline" className="text-amber-600 border-amber-300 hover:bg-amber-50" onClick={() => { setDraft(""); setEditing(true); }}>
          <Pencil className="h-3 w-3 mr-1" /> Add Week Note
        </Button>
      </div>
    );
  }

  return null;
}

function WeekPlanView({ weekPlan }: { weekPlan: WeekPlan }) {
  const { activeRole } = useRole();
  const canEditWeekNote = ["schoolAdmin", "admin", "superAdmin"].includes(activeRole || "");
  const { toast } = useToast();
  const [completionOverrides, setCompletionOverrides] = useState<Record<number, boolean>>({});

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

  const toggleCompletionMutation = useMutation({
    mutationFn: ({ id, isCompleted }: { id: number; isCompleted: boolean }) =>
      apiRequest("PATCH", `/api/schedule-builder/week-plan-blocks/${id}`, { isCompleted }),
    onSuccess: (_res, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/week-plans", weekPlan.id] });
      setCompletionOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    onError: (_err, { id }) => {
      setCompletionOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast({ title: "Failed to update block", description: "Could not save the completion status. Please try again.", variant: "destructive" });
    },
  });

  function handleToggle(planBlock: WeekPlanBlock) {
    const current = completionOverrides[planBlock.id] ?? planBlock.isCompleted;
    const newValue = !current;
    setCompletionOverrides((prev) => ({ ...prev, [planBlock.id]: newValue }));
    toggleCompletionMutation.mutate({ id: planBlock.id, isCompleted: newValue });
  }

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
      <div className="text-center py-8 text-slate-500">Unable to load schedule details.</div>
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
            {formatWeekRange(weekPlan.weekStartDate)}
          </span>
        )}
      </div>

      <WeekNoteSection weekPlan={planDetails} canEdit={canEditWeekNote} />
      <ScheduleGrid
        weekPlan={planDetails}
        skeleton={skeleton}
        skeletonBlocks={skelBlocks}
        completionOverrides={completionOverrides}
        onToggle={handleToggle}
        isToggling={toggleCompletionMutation.isPending}
      />
    </div>
  );
}

export default function EducatorWeeklySchedulePage() {
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  const { data: publishedPlans, isLoading } = useQuery<WeekPlan[]>({
    queryKey: ["/api/schedule-builder/week-plans", "published"],
  });

  const plans = publishedPlans || [];

  const defaultPlanId = useMemo(() => {
    if (plans.length === 0) return null;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    let best: WeekPlan | null = null;
    for (const p of plans) {
      if (!p.weekStartDate) continue;
      if (p.weekStartDate <= today) {
        if (!best || p.weekStartDate > best.weekStartDate!) {
          best = p;
        }
      }
    }
    return best?.id ?? plans[0].id;
  }, [plans]);

  const activePlanId = selectedPlanId ?? defaultPlanId;
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
        <title>Schedule & Plans | ASA Educator Portal</title>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2 flex items-center gap-2">
          <BookOpen className="h-7 w-7 text-blue-600" />
          Schedule & Plans
        </h1>
        <p className="text-slate-500 mb-8">Your weekly schedule with full lesson plan details</p>
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <CalendarDays className="h-16 w-16 text-slate-300 mb-4" />
            <h3 className="text-xl font-semibold text-slate-600 mb-2">No Schedule Published Yet</h3>
            <p className="text-slate-500 max-w-md">
              Your school admin hasn't published any week plans yet. Once they publish a week from
              the Week Planner, it will appear here for you to teach from.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto educator-lesson-plans">
      <title>Schedule & Plans | ASA Educator Portal</title>

      {/* Print header — only visible when printing */}
      <div className="print-header hidden print:block mb-4 border-b-2 border-blue-200 pb-3">
        <h1 className="text-xl font-bold text-slate-900">ASA Schedule & Plans</h1>
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
              Schedule & Plans
            </h1>
            <p className="text-slate-500 mt-1">Click any block to expand full lesson details</p>
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
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex-1 flex flex-wrap gap-2 justify-center">
            {plans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                aria-pressed={plan.id === activePlanId}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  plan.id === activePlanId
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                Week {plan.weekNumber}
                {plan.weekStartDate && (
                  <span
                    className={`ml-1.5 text-xs ${
                      plan.id === activePlanId ? "text-blue-200" : "text-slate-400"
                    }`}
                  >
                    {new Date(plan.weekStartDate + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
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
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Active week plan */}
      <Card className="shadow-sm">
        <CardHeader className="border-b border-slate-100 py-4">
          <CardTitle className="text-lg font-semibold text-slate-800">
            {activePlan
              ? `Week ${activePlan.weekNumber}${
                  activePlan.weekStartDate
                    ? ` · ${formatWeekRange(activePlan.weekStartDate)}`
                    : ""
                }`
              : "Schedule"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {activePlan ? (
            <WeekPlanView weekPlan={activePlan} />
          ) : (
            <p className="text-slate-400 text-center py-8">
              Select a week above to view the schedule.
            </p>
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
          .sidebar {
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

          .schedule-table td button[data-testid^="expand-toggle"] {
            pointer-events: none !important;
            text-decoration: none !important;
          }

          .schedule-table td .print\\:block {
            display: block !important;
          }

          .line-clamp-2 {
            -webkit-line-clamp: unset !important;
            display: block !important;
            overflow: visible !important;
          }
        }
      `}</style>
    </div>
  );
}