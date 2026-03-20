import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus, Copy, Sparkles, Search, CheckCircle2, Edit, History, Trash2,
  ChevronRight, Calendar, Clock, Loader2, ExternalLink, AlertTriangle,
  ThumbsUp, Lightbulb, X
} from "lucide-react";
import type { WeekPlan, WeekPlanBlock, WeeklySkeleton, SkeletonBlock } from "@shared/schema";
import { BLOCK_TYPE_COLORS, BLOCK_TYPE_BADGE_COLORS } from "@/lib/blockColors";

const DAY_NAMES: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday",
  4: "Thursday", 5: "Friday", 6: "Saturday",
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  published: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-800",
};

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  const ampm = hr >= 12 ? "PM" : "AM";
  return `${hr % 12 || 12}:${m} ${ampm}`;
}

interface BlockFormData {
  title: string;
  description: string;
  objectives: string[];
  groups: { name: string; students: string; notes: string }[];
  lessonLink: string;
  notes: string;
}

const emptyBlockForm: BlockFormData = {
  title: "",
  description: "",
  objectives: [],
  groups: [],
  lessonLink: "",
  notes: "",
};

export default function WeekPlannerPage() {
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedWeekPlanId, setSelectedWeekPlanId] = useState<number | null>(null);
  const [newWeekDialog, setNewWeekDialog] = useState(false);
  const [newWeekNumber, setNewWeekNumber] = useState("");
  const [newWeekStartDate, setNewWeekStartDate] = useState("");
  const [newWeekNotes, setNewWeekNotes] = useState("");
  const [cloneDialog, setCloneDialog] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState<number | null>(null);
  const [cloneWeekNumber, setCloneWeekNumber] = useState("");
  const [cloneWeekStartDate, setCloneWeekStartDate] = useState("");
  const [blockEditDialog, setBlockEditDialog] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);
  const [editingSkeletonBlockId, setEditingSkeletonBlockId] = useState<number | null>(null);
  const [blockForm, setBlockForm] = useState<BlockFormData>(emptyBlockForm);
  const [deleteWeekId, setDeleteWeekId] = useState<number | null>(null);
  const [historyDialog, setHistoryDialog] = useState(false);
  const [historyBlockId, setHistoryBlockId] = useState<number | null>(null);
  const [gapsDialog, setGapsDialog] = useState(false);
  const [gapsResult, setGapsResult] = useState<any>(null);
  const [deleteBlockId, setDeleteBlockId] = useState<number | null>(null);
  const [completionOverrides, setCompletionOverrides] = useState<Record<number, boolean>>({});

  const templateId = selectedTemplateId ? parseInt(selectedTemplateId) : null;

  const { data: templates = [], isLoading: templatesLoading } = useQuery<WeeklySkeleton[]>({
    queryKey: ["/api/schedule-builder/skeletons"],
  });

  const { data: skeletonBlocks = [] } = useQuery<SkeletonBlock[]>({
    queryKey: ["/api/schedule-builder/skeletons", templateId, "blocks"],
    enabled: !!templateId,
  });

  const { data: weekPlans = [] } = useQuery<WeekPlan[]>({
    queryKey: ["/api/schedule-builder/skeletons", templateId, "week-plans"],
    enabled: !!templateId,
  });

  const { data: selectedWeekData } = useQuery<WeekPlan & { blocks?: WeekPlanBlock[] }>({
    queryKey: ["/api/schedule-builder/week-plans", selectedWeekPlanId],
    enabled: !!selectedWeekPlanId,
  });

  const { data: aiStatus } = useQuery<{ available: boolean }>({
    queryKey: ["/api/schedule-ai/status"],
  });

  const { data: classesData } = useQuery<{ items: any[]; classes?: any[] }>({
    queryKey: ["/api/school-admin/classes"],
  });
  const classesList = classesData?.items ?? classesData?.classes ?? [];

  const { data: blockHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/schedule-builder/week-plan-blocks", historyBlockId, "history"],
    enabled: !!historyBlockId && historyDialog,
  });

  const createWeekMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/schedule-builder/week-plans", data),
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/skeletons", templateId, "week-plans"] });
      const newPlan = await res.json();
      setSelectedWeekPlanId(newPlan.id);
      toast({ title: "Week plan created" });
      setNewWeekDialog(false);
    },
    onError: (err: any) => toast({ title: "Error creating week plan", description: err.message, variant: "destructive" }),
  });

  const updateWeekMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/schedule-builder/week-plans/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/skeletons", templateId, "week-plans"] });
      if (selectedWeekPlanId) queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/week-plans", selectedWeekPlanId] });
      toast({ title: "Week plan updated" });
    },
    onError: (err: any) => toast({ title: "Error updating week plan", description: err.message, variant: "destructive" }),
  });

  const deleteWeekMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/schedule-builder/week-plans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/skeletons", templateId, "week-plans"] });
      if (selectedWeekPlanId === deleteWeekId) setSelectedWeekPlanId(null);
      toast({ title: "Week plan deleted" });
      setDeleteWeekId(null);
    },
    onError: (err: any) => toast({ title: "Error deleting week plan", description: err.message, variant: "destructive" }),
  });

  const cloneWeekMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("POST", `/api/schedule-builder/week-plans/${id}/clone`, data),
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/skeletons", templateId, "week-plans"] });
      const cloned = await res.json();
      setSelectedWeekPlanId(cloned.id);
      toast({ title: "Week plan cloned" });
      setCloneDialog(false);
    },
    onError: (err: any) => toast({ title: "Error cloning week plan", description: err.message, variant: "destructive" }),
  });

  const createBlockMutation = useMutation({
    mutationFn: ({ weekPlanId, data }: { weekPlanId: number; data: any }) =>
      apiRequest("POST", `/api/schedule-builder/week-plans/${weekPlanId}/blocks`, data),
    onSuccess: () => {
      if (selectedWeekPlanId) queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/week-plans", selectedWeekPlanId] });
      toast({ title: "Block created" });
      setBlockEditDialog(false);
    },
    onError: (err: any) => toast({ title: "Error creating block", description: err.message, variant: "destructive" }),
  });

  const updateBlockMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/schedule-builder/week-plan-blocks/${id}`, data),
    onSuccess: () => {
      if (selectedWeekPlanId) queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/week-plans", selectedWeekPlanId] });
      toast({ title: "Block updated" });
      setBlockEditDialog(false);
    },
    onError: (err: any) => toast({ title: "Error updating block", description: err.message, variant: "destructive" }),
  });

  const toggleCompletionMutation = useMutation({
    mutationFn: ({ id, isCompleted }: { id: number; isCompleted: boolean }) =>
      apiRequest("PATCH", `/api/schedule-builder/week-plan-blocks/${id}`, { isCompleted }),
    onSuccess: (_res, { id }) => {
      if (selectedWeekPlanId) queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/week-plans", selectedWeekPlanId] });
      setCompletionOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    onError: (err: any, { id }) => {
      console.error("Error toggling block completion:", err);
      setCompletionOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
  });

  function toggleBlockCompletion(wb: { id: number; isCompleted: boolean } | null) {
    console.log("toggleBlockCompletion called", wb);
    if (!wb) return;
    const newValue = !(completionOverrides[wb.id] ?? wb.isCompleted);
    setCompletionOverrides((prev) => ({ ...prev, [wb.id]: newValue }));
    toggleCompletionMutation.mutate({ id: wb.id, isCompleted: newValue });
  }

  const generateWeekMutation = useMutation({
    mutationFn: (data: { skeletonId: number; weekNumber: number; weekPlanId?: number }) =>
      apiRequest("POST", "/api/schedule-ai/generate-week", data),
    onSuccess: () => {
      if (selectedWeekPlanId) queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/week-plans", selectedWeekPlanId] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/skeletons", templateId, "week-plans"] });
      toast({ title: "Week plan generated with AI" });
    },
    onError: (err: any) => toast({ title: "AI generation failed", description: err.message, variant: "destructive" }),
  });

  const suggestBlockMutation = useMutation({
    mutationFn: (data: { skeletonBlockId: number }) =>
      apiRequest("POST", "/api/schedule-ai/suggest-block-content", data),
    onSuccess: async (res) => {
      const suggestion = await res.json();
      setBlockForm((prev) => ({
        ...prev,
        title: suggestion.title || prev.title,
        description: suggestion.description || prev.description,
        objectives: suggestion.objectives || prev.objectives,
      }));
      toast({ title: "AI suggestions applied" });
    },
    onError: (err: any) => toast({ title: "AI suggestion failed", description: err.message, variant: "destructive" }),
  });

  const analyzeGapsMutation = useMutation({
    mutationFn: (data: { weekPlanId: number }) =>
      apiRequest("POST", "/api/schedule-ai/analyze-gaps", data),
    onSuccess: async (res) => {
      const result = await res.json();
      setGapsResult(result);
      setGapsDialog(true);
    },
    onError: (err: any) => toast({ title: "Gap analysis failed", description: err.message, variant: "destructive" }),
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/schedule-builder/week-plan-blocks/${id}`),
    onSuccess: () => {
      if (selectedWeekPlanId) queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/week-plans", selectedWeekPlanId] });
      toast({ title: "Block deleted" });
    },
    onError: (err: any) => toast({ title: "Error deleting block", description: err.message, variant: "destructive" }),
  });

  const sortedWeekPlans = [...weekPlans].sort((a, b) => a.weekNumber - b.weekNumber);

  const openCreateBlock = (skeletonBlockId: number) => {
    setEditingBlockId(null);
    setEditingSkeletonBlockId(skeletonBlockId);
    const sb = skeletonBlocks.find((b) => b.id === skeletonBlockId);
    setBlockForm({
      ...emptyBlockForm,
      title: sb?.defaultTitle || "",
      description: sb?.defaultDescription || "",
    });
    setBlockEditDialog(true);
  };

  const openEditBlock = (block: WeekPlanBlock) => {
    setEditingBlockId(block.id);
    setEditingSkeletonBlockId(block.skeletonBlockId);
    setBlockForm({
      title: block.title || "",
      description: block.description || "",
      objectives: Array.isArray(block.objectives) ? (block.objectives as string[]) : [],
      groups: Array.isArray(block.groups) ? (block.groups as any[]) : [],
      lessonLink: block.lessonLink || "",
      notes: block.notes || "",
    });
    setBlockEditDialog(true);
  };

  const handleBlockSubmit = () => {
    const payload: any = {
      title: blockForm.title || null,
      description: blockForm.description || null,
      objectives: blockForm.objectives.filter(Boolean),
      groups: blockForm.groups.filter((g) => g.name),
      lessonLink: blockForm.lessonLink || null,
      notes: blockForm.notes || null,
    };
    if (editingBlockId) {
      updateBlockMutation.mutate({ id: editingBlockId, data: payload });
    } else if (selectedWeekPlanId && editingSkeletonBlockId) {
      createBlockMutation.mutate({
        weekPlanId: selectedWeekPlanId,
        data: { ...payload, skeletonBlockId: editingSkeletonBlockId },
      });
    }
  };

  const handleCreateWeek = () => {
    if (!newWeekNumber || !newWeekStartDate || !templateId) return;
    const num = parseInt(newWeekNumber);
    if (sortedWeekPlans.some((wp) => wp.weekNumber === num)) {
      toast({ title: "Duplicate week number", description: `Week ${num} already exists for this template.`, variant: "destructive" });
      return;
    }
    createWeekMutation.mutate({
      skeletonId: templateId,
      weekNumber: num,
      weekStartDate: newWeekStartDate,
      notes: newWeekNotes || null,
    });
  };

  const handleCloneWeek = () => {
    if (!cloneSourceId || !cloneWeekNumber || !cloneWeekStartDate) return;
    const num = parseInt(cloneWeekNumber);
    if (sortedWeekPlans.some((wp) => wp.weekNumber === num)) {
      toast({ title: "Duplicate week number", description: `Week ${num} already exists for this template.`, variant: "destructive" });
      return;
    }
    cloneWeekMutation.mutate({
      id: cloneSourceId,
      data: { weekNumber: num, weekStartDate: cloneWeekStartDate },
    });
  };

  const weekPlanBlocks = (selectedWeekData as any)?.blocks || [];
  const blocksByDay: Record<number, { skeletonBlock: SkeletonBlock; weekBlock?: WeekPlanBlock }[]> = {};

  if (skeletonBlocks.length > 0) {
    for (const sb of skeletonBlocks) {
      if (!blocksByDay[sb.dayOfWeek]) blocksByDay[sb.dayOfWeek] = [];
      const wb = weekPlanBlocks.find((b: WeekPlanBlock) => b.skeletonBlockId === sb.id);
      blocksByDay[sb.dayOfWeek].push({ skeletonBlock: sb, weekBlock: wb });
    }
    for (const day in blocksByDay) {
      blocksByDay[parseInt(day)].sort((a, b) => {
        if (a.skeletonBlock.startTime < b.skeletonBlock.startTime) return -1;
        if (a.skeletonBlock.startTime > b.skeletonBlock.startTime) return 1;
        return a.skeletonBlock.sortOrder - b.skeletonBlock.sortOrder;
      });
    }
  }

  const activeDays = Object.keys(blocksByDay).map(Number).sort();

  const selectedTemplate = templates.find((s) => s.id === templateId);
  const nextWeekNumber = sortedWeekPlans.length > 0 ? sortedWeekPlans[sortedWeekPlans.length - 1].weekNumber + 1 : 1;
  const aiAvailable = aiStatus?.available ?? false;

  return (
    <SchoolAdminLayout pageTitle="Week Planner">
      <div className="flex flex-col space-y-6 p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Multi-Week Planner</h1>
            <p className="text-muted-foreground mt-1">Manage week-by-week lesson plans based on weekly templates</p>
          </div>
          <div className="w-64">
            <Select value={selectedTemplateId} onValueChange={(v) => { setSelectedTemplateId(v); setSelectedWeekPlanId(null); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((s) => {
                  const linkedClass = s.classId ? classesList.find((c: any) => c.id === s.classId) : null;
                  const displayClass = linkedClass ? (linkedClass.title || linkedClass.name || `Class ${linkedClass.id}`) : s.gradeLevel;
                  return (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name} ({displayClass})</SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {templatesLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !templateId ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Select a Template</h3>
              <p className="text-muted-foreground">Choose a weekly template above to manage weekly lesson plans.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <ScrollArea className="flex-1">
                <div className="flex gap-2 pb-2">
                  {sortedWeekPlans.map((wp) => (
                    <Button
                      key={wp.id}
                      variant={selectedWeekPlanId === wp.id ? "default" : "outline"}
                      size="sm"
                      className="flex-shrink-0 flex items-center gap-2"
                      onClick={() => setSelectedWeekPlanId(wp.id)}
                    >
                      <span>Week {wp.weekNumber}</span>
                      <Badge className={`text-xs ${STATUS_BADGE[wp.status] || ""}`}>{wp.status}</Badge>
                    </Button>
                  ))}
                  {sortedWeekPlans.length === 0 && (
                    <p className="text-sm text-muted-foreground py-1">No week plans yet. Create your first one.</p>
                  )}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
              <Button
                size="sm"
                onClick={() => {
                  setNewWeekNumber(String(nextWeekNumber));
                  setNewWeekStartDate("");
                  setNewWeekNotes("");
                  setNewWeekDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Week
              </Button>
            </div>

            {selectedWeekPlanId && selectedWeekData ? (
              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between flex-wrap gap-4">
                      <div>
                        <CardTitle className="text-xl flex items-center gap-2">
                          Week {selectedWeekData.weekNumber}
                          <Badge className={STATUS_BADGE[selectedWeekData.status] || ""}>{selectedWeekData.status}</Badge>
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(selectedWeekData.weekStartDate)}
                          {selectedTemplate && <span className="ml-2">• {selectedTemplate.name}</span>}
                        </p>
                        {selectedWeekData.notes && (
                          <p className="text-sm text-muted-foreground mt-2">{selectedWeekData.notes}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedWeekData.status === "draft" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateWeekMutation.mutate({ id: selectedWeekPlanId!, data: { status: "published" } })}
                            disabled={updateWeekMutation.isPending}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Publish
                          </Button>
                        )}
                        {selectedWeekData.status === "published" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateWeekMutation.mutate({ id: selectedWeekPlanId!, data: { status: "completed" } })}
                            disabled={updateWeekMutation.isPending}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Complete
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCloneSourceId(selectedWeekPlanId);
                            setCloneWeekNumber(String(nextWeekNumber));
                            setCloneWeekStartDate("");
                            setCloneDialog(true);
                          }}
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Clone
                        </Button>
                        {aiAvailable ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => templateId && generateWeekMutation.mutate({ skeletonId: templateId, weekNumber: selectedWeekData.weekNumber, weekPlanId: selectedWeekPlanId ?? undefined })}
                              disabled={generateWeekMutation.isPending}
                            >
                              {generateWeekMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                              Generate with AI
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => analyzeGapsMutation.mutate({ weekPlanId: selectedWeekPlanId! })}
                              disabled={analyzeGapsMutation.isPending}
                            >
                              {analyzeGapsMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                              Analyze Gaps
                            </Button>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">
                            AI generation is currently unavailable. Fill blocks manually or contact support.
                          </p>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600"
                          onClick={() => setDeleteWeekId(selectedWeekPlanId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(activeDays.length, 5)}, minmax(200px, 1fr))` }}>
                  {activeDays.map((dayNum) => (
                    <div key={dayNum} className="space-y-3">
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                        {DAY_NAMES[dayNum] || `Day ${dayNum}`}
                      </h3>
                      {blocksByDay[dayNum]?.map(({ skeletonBlock: sb, weekBlock: wb }) => (
                        <Card
                          key={sb.id}
                          className={`border-l-4 ${BLOCK_TYPE_COLORS[sb.blockType] || "border-l-gray-300"} ${wb && (completionOverrides[wb.id] ?? wb.isCompleted) ? "opacity-60" : ""}`}
                        >
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTime(sb.startTime)} – {formatTime(sb.endTime)}
                              </span>
                              <Badge className={`text-[10px] ${BLOCK_TYPE_BADGE_COLORS[sb.blockType] || ""}`}>{sb.blockType}</Badge>
                            </div>
                            <div className="flex items-start gap-2">
                              <Checkbox
                                checked={completionOverrides[wb?.id ?? 0] ?? wb?.isCompleted ?? false}
                                onCheckedChange={() => toggleBlockCompletion(wb ?? null)}
                                disabled={!wb}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${wb && (completionOverrides[wb.id] ?? wb.isCompleted) ? "line-through opacity-60" : ""}`}>
                                  {wb?.title || sb.defaultTitle}
                                </p>
                                {(wb?.description || sb.defaultDescription) && (
                                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                    {wb?.description || sb.defaultDescription}
                                  </p>
                                )}
                                {wb?.lessonLink && (
                                  <a href={wb.lessonLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 flex items-center gap-1 mt-1">
                                    <ExternalLink className="h-3 w-3" />
                                    Lesson Link
                                  </a>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 pt-1 border-t">
                              {wb ? (
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEditBlock(wb)}>
                                  <Edit className="h-3 w-3 mr-1" />
                                  Edit
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openCreateBlock(sb.id)}>
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add
                                </Button>
                              )}
                              {wb && (
                                <Button
                                  variant="ghost" size="sm" className="h-7 px-2 text-xs"
                                  onClick={() => { setHistoryBlockId(wb.id); setHistoryDialog(true); }}
                                >
                                  <History className="h-3 w-3 mr-1" />
                                  History
                                </Button>
                              )}
                              {aiAvailable ? (
                                <Button
                                  variant="ghost" size="sm" className="h-7 px-2 text-xs"
                                  onClick={() => {
                                    if (wb) {
                                      openEditBlock(wb);
                                      setTimeout(() => suggestBlockMutation.mutate({ skeletonBlockId: sb.id }), 100);
                                    } else {
                                      openCreateBlock(sb.id);
                                      setTimeout(() => suggestBlockMutation.mutate({ skeletonBlockId: sb.id }), 100);
                                    }
                                  }}
                                >
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  AI
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground px-2 py-1">AI generation is currently unavailable. Fill blocks manually or contact support.</span>
                              )}
                              {wb && (
                                <Button
                                  variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto"
                                  onClick={() => setDeleteBlockId(wb.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ))}
                </div>
                {activeDays.length === 0 && (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      No template blocks found. Add blocks to your template first.
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : templateId && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ChevronRight className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Select a week from the tabs above, or create a new one.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <Dialog open={newWeekDialog} onOpenChange={setNewWeekDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Week Plan</DialogTitle>
            <DialogDescription>Set up a new week based on the selected template.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Week Number *</Label>
              <Input type="number" value={newWeekNumber} onChange={(e) => setNewWeekNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Week Start Date *</Label>
              <Input type="date" value={newWeekStartDate} onChange={(e) => setNewWeekStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={newWeekNotes} onChange={(e) => setNewWeekNotes(e.target.value)} placeholder="Optional notes for this week" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewWeekDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateWeek} disabled={createWeekMutation.isPending}>
              {createWeekMutation.isPending ? "Creating..." : "Create Week"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cloneDialog} onOpenChange={setCloneDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clone Week Plan</DialogTitle>
            <DialogDescription>Create a copy of this week with a new week number and date.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Target Week Number *</Label>
              <Input type="number" value={cloneWeekNumber} onChange={(e) => setCloneWeekNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Target Start Date *</Label>
              <Input type="date" value={cloneWeekStartDate} onChange={(e) => setCloneWeekStartDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneDialog(false)}>Cancel</Button>
            <Button onClick={handleCloneWeek} disabled={cloneWeekMutation.isPending}>
              {cloneWeekMutation.isPending ? "Cloning..." : "Clone Week"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blockEditDialog} onOpenChange={setBlockEditDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBlockId ? "Edit Block" : "Add Block Content"}</DialogTitle>
            <DialogDescription>
              {(() => {
                const sb = skeletonBlocks.find((b) => b.id === editingSkeletonBlockId);
                return sb ? `${sb.defaultTitle} • ${DAY_NAMES[sb.dayOfWeek]} ${formatTime(sb.startTime)} – ${formatTime(sb.endTime)}` : "";
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={blockForm.title} onChange={(e) => setBlockForm({ ...blockForm, title: e.target.value })} placeholder="Block title" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={blockForm.description}
                onChange={(e) => setBlockForm({ ...blockForm, description: e.target.value })}
                placeholder="Detailed description..."
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Objectives</Label>
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => setBlockForm({ ...blockForm, objectives: [...blockForm.objectives, ""] })}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              {blockForm.objectives.map((obj, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={obj}
                    onChange={(e) => {
                      const updated = [...blockForm.objectives];
                      updated[i] = e.target.value;
                      setBlockForm({ ...blockForm, objectives: updated });
                    }}
                    placeholder={`Objective ${i + 1}`}
                  />
                  <Button
                    type="button" variant="ghost" size="sm"
                    onClick={() => setBlockForm({ ...blockForm, objectives: blockForm.objectives.filter((_, idx) => idx !== i) })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Differentiation Groups</Label>
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => setBlockForm({ ...blockForm, groups: [...blockForm.groups, { name: "", students: "", notes: "" }] })}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Group
                </Button>
              </div>
              {blockForm.groups.map((group, i) => (
                <div key={i} className="border rounded p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Group {i + 1}</Label>
                    <Button
                      type="button" variant="ghost" size="sm"
                      onClick={() => setBlockForm({ ...blockForm, groups: blockForm.groups.filter((_, idx) => idx !== i) })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <Input
                    placeholder="Group name"
                    value={group.name}
                    onChange={(e) => {
                      const updated = [...blockForm.groups];
                      updated[i] = { ...updated[i], name: e.target.value };
                      setBlockForm({ ...blockForm, groups: updated });
                    }}
                  />
                  <Input
                    placeholder="Students (comma-separated)"
                    value={group.students}
                    onChange={(e) => {
                      const updated = [...blockForm.groups];
                      updated[i] = { ...updated[i], students: e.target.value };
                      setBlockForm({ ...blockForm, groups: updated });
                    }}
                  />
                  <Input
                    placeholder="Notes"
                    value={group.notes}
                    onChange={(e) => {
                      const updated = [...blockForm.groups];
                      updated[i] = { ...updated[i], notes: e.target.value };
                      setBlockForm({ ...blockForm, groups: updated });
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Lesson Link</Label>
              <Input
                type="url"
                value={blockForm.lessonLink}
                onChange={(e) => setBlockForm({ ...blockForm, lessonLink: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={blockForm.notes}
                onChange={(e) => setBlockForm({ ...blockForm, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {aiAvailable && editingSkeletonBlockId ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => suggestBlockMutation.mutate({ skeletonBlockId: editingSkeletonBlockId! })}
                disabled={suggestBlockMutation.isPending}
                className="sm:mr-auto"
              >
                {suggestBlockMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                AI Suggest
              </Button>
            ) : !aiAvailable ? (
              <p className="text-xs text-muted-foreground italic sm:mr-auto self-center">
                AI generation is currently unavailable. Fill blocks manually or contact support.
              </p>
            ) : null}
            <Button variant="outline" onClick={() => setBlockEditDialog(false)}>Cancel</Button>
            <Button onClick={handleBlockSubmit} disabled={createBlockMutation.isPending || updateBlockMutation.isPending}>
              {(createBlockMutation.isPending || updateBlockMutation.isPending) ? "Saving..." : editingBlockId ? "Update Block" : "Add Block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteWeekId !== null} onOpenChange={() => setDeleteWeekId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Week Plan</DialogTitle>
            <DialogDescription>Are you sure you want to delete this week plan and all its blocks? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteWeekId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteWeekId && deleteWeekMutation.mutate(deleteWeekId)} disabled={deleteWeekMutation.isPending}>
              {deleteWeekMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteBlockId !== null} onOpenChange={() => setDeleteBlockId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Block</DialogTitle>
            <DialogDescription>Are you sure you want to delete this block's content? The skeleton block slot remains. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBlockId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleteBlockId) { deleteBlockMutation.mutate(deleteBlockId); setDeleteBlockId(null); } }} disabled={deleteBlockMutation.isPending}>
              {deleteBlockMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyDialog} onOpenChange={(open) => { setHistoryDialog(open); if (!open) setHistoryBlockId(null); }}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Block Edit History</DialogTitle>
          </DialogHeader>
          {blockHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No edit history for this block.</p>
          ) : (
            <div className="space-y-3">
              {blockHistory.map((entry: any, i: number) => (
                <div key={entry.id || i} className="border rounded p-3 text-sm space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {entry.changedAt ? new Date(entry.changedAt).toLocaleString() : "Unknown date"}
                    {entry.changedByUser && ` by ${entry.changedByUser.name || "User"}`}
                  </p>
                  {entry.previousTitle && <p><span className="font-medium">Title:</span> {entry.previousTitle}</p>}
                  {entry.previousDescription && <p><span className="font-medium">Description:</span> {entry.previousDescription}</p>}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={gapsDialog} onOpenChange={setGapsDialog}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gap Analysis</DialogTitle>
            <DialogDescription>AI-powered analysis of your week plan coverage</DialogDescription>
          </DialogHeader>
          {gapsResult ? (
            <div className="space-y-4">
              {gapsResult.gaps && gapsResult.gaps.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-1 text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    Gaps
                  </h4>
                  {gapsResult.gaps.map((gap: string, i: number) => (
                    <p key={i} className="text-sm bg-red-50 text-red-800 p-2 rounded">{gap}</p>
                  ))}
                </div>
              )}
              {gapsResult.suggestions && gapsResult.suggestions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-1 text-blue-700">
                    <Lightbulb className="h-4 w-4" />
                    Suggestions
                  </h4>
                  {gapsResult.suggestions.map((s: string, i: number) => (
                    <p key={i} className="text-sm bg-blue-50 text-blue-800 p-2 rounded">{s}</p>
                  ))}
                </div>
              )}
              {gapsResult.strengths && gapsResult.strengths.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-1 text-green-700">
                    <ThumbsUp className="h-4 w-4" />
                    Strengths
                  </h4>
                  {gapsResult.strengths.map((s: string, i: number) => (
                    <p key={i} className="text-sm bg-green-50 text-green-800 p-2 rounded">{s}</p>
                  ))}
                </div>
              )}
              {!gapsResult.gaps?.length && !gapsResult.suggestions?.length && !gapsResult.strengths?.length && (
                <p className="text-sm text-muted-foreground">{JSON.stringify(gapsResult)}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No analysis results.</p>
          )}
        </DialogContent>
      </Dialog>
    </SchoolAdminLayout>
  );
}
