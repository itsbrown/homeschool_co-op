import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus, Copy, Sparkles, Search, CheckCircle2, Edit, History, Trash2,
  ChevronRight, Calendar, Clock, Loader2, ExternalLink, AlertTriangle,
  ThumbsUp, Lightbulb, X, Download, Upload, HelpCircle, Hammer, MoreHorizontal,
  Printer, Target, Package, Eye, FolderOpen, Unlink
} from "lucide-react";
import type { WeekPlan, WeekPlanBlock, WeeklySkeleton, SkeletonBlock, CurriculumAsset } from "@shared/schema";
import { withSnackHandwashingStatement } from "@shared/snack-handwashing";
import {
  MATCH_STATUS_LABEL,
  blockLengthMinutes,
  classBandFromClass,
  isTeachingSkeletonBlock,
  weekPlanBlockMatchStatus,
  type CurriculumBand,
  type CurriculumMatchStatus,
  type ProposedCurriculumAttachment,
} from "@shared/curriculum-drive";
import { extractDriveFileId } from "@shared/lesson-push";
import { useScheduleBuilderTour } from "@/components/tutorials/useScheduleBuilderTour";
import { ScheduleBlocksCsvImportDialog } from "@/components/schedule/ScheduleBlocksCsvImportDialog";
import { AsaWeeklySchedulePrintSheet } from "@/components/schedule/AsaWeeklySchedulePrintSheet";
import {
  WeekPlanBlockDetailSheet,
  type WeekPlanBlockDetail,
} from "@/components/schedule/WeekPlanBlockDetailSheet";
import {
  asTrimmedStrings,
  lessonTeachingPreview,
} from "@/lib/week-plan-lesson-content";
import {
  buildAsaPrintColumnsFromWeekPlan,
  formatWeekOfRange,
  shortPrintTitle,
} from "@/lib/asa-weekly-schedule-print";

const DAY_NAMES: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday",
  4: "Thursday", 5: "Friday", 6: "Saturday",
};

const BLOCK_TYPE_COLORS: Record<string, string> = {
  anchor: "border-l-indigo-500",
  curriculum: "border-l-emerald-500",
  flexible: "border-l-amber-500",
};

const BLOCK_TYPE_BADGE: Record<string, string> = {
  anchor: "bg-indigo-100 text-indigo-800",
  curriculum: "bg-emerald-100 text-emerald-800",
  flexible: "bg-amber-100 text-amber-800",
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

function slotFolderPrefill(raw?: string | null): string {
  const value = (raw || "").trim();
  if (!value) return "";
  try {
    extractDriveFileId(value);
    return value;
  } catch {
    return "";
  }
}

interface BlockFormData {
  title: string;
  description: string;
  objectives: string[];
  groups: { name: string; students: string; notes: string }[];
  lessonLink: string;
  notes: string;
  materials: string[];
  homework: string;
  curriculumAssetId: number | null;
}

const emptyBlockForm: BlockFormData = {
  title: "",
  description: "",
  objectives: [],
  groups: [],
  lessonLink: "",
  notes: "",
  materials: [],
  homework: "",
  curriculumAssetId: null,
};

function normalizeEditGroups(raw: unknown): { name: string; students: string; notes: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((group) => {
      if (typeof group === "string") {
        return { name: group, students: "", notes: "" };
      }
      if (group && typeof group === "object") {
        const rec = group as { name?: string; students?: string; notes?: string };
        return {
          name: String(rec.name || ""),
          students: String(rec.students || ""),
          notes: String(rec.notes || ""),
        };
      }
      return { name: "", students: "", notes: "" };
    })
    .filter((group) => group.name);
}

function toBlockDetail(
  skeletonBlock: SkeletonBlock,
  weekBlock?: WeekPlanBlock,
): WeekPlanBlockDetail {
  const title = weekBlock?.title || skeletonBlock.defaultTitle || "";
  return {
    title,
    description: weekBlock?.description || skeletonBlock.defaultDescription || null,
    blockType: skeletonBlock.blockType || "flexible",
    isCompleted: weekBlock?.isCompleted || false,
    objectives: weekBlock?.objectives,
    groups: weekBlock?.groups,
    notes: weekBlock?.notes || null,
    lessonLink: weekBlock?.lessonLink || null,
    materials: weekBlock?.materials,
    homework: weekBlock?.homework || null,
    resources: weekBlock?.resources,
    timeLabel: `${DAY_NAMES[skeletonBlock.dayOfWeek] || `Day ${skeletonBlock.dayOfWeek}`} · ${formatTime(skeletonBlock.startTime)} – ${formatTime(skeletonBlock.endTime)}`,
  };
}

export default function WeekPlannerPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { launchTour } = useScheduleBuilderTour();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedWeekPlanId, setSelectedWeekPlanId] = useState<number | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
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
  const [detailBlock, setDetailBlock] = useState<WeekPlanBlockDetail | null>(null);
  const [gapsDialog, setGapsDialog] = useState(false);
  const [gapsResult, setGapsResult] = useState<any>(null);
  const [csvImport, setCsvImport] = useState<{
    file: File;
    csvText: string;
  } | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const [drivePreview, setDrivePreview] = useState<{
    usedFallback?: string | null;
    message?: string;
    blocks: ProposedCurriculumAttachment[];
  } | null>(null);
  const [swapBlock, setSwapBlock] = useState<WeekPlanBlock | null>(null);
  const [linkDriveOpen, setLinkDriveOpen] = useState(false);
  const [linkFolderInput, setLinkFolderInput] = useState("");
  const [drivePanelMessage, setDrivePanelMessage] = useState<string | null>(null);

  const templateId = selectedTemplateId ? parseInt(selectedTemplateId) : null;

  const { data: templates = [], isLoading: templatesLoading } = useQuery<WeeklySkeleton[]>({
    queryKey: ["/api/schedule-builder/skeletons"],
    refetchOnMount: "always",
  });

  const { data: skeletonBlocks = [] } = useQuery<SkeletonBlock[]>({
    queryKey: ["/api/schedule-builder/skeletons", templateId, "blocks"],
    enabled: !!templateId,
  });

  const { data: weekPlans = [] } = useQuery<WeekPlan[]>({
    queryKey: ["/api/schedule-builder/skeletons", templateId, "week-plans"],
    enabled: !!templateId,
    refetchOnMount: "always",
  });

  const {
    data: selectedWeekData,
    isLoading: selectedWeekLoading,
    isError: selectedWeekError,
  } = useQuery<WeekPlan & { blocks?: WeekPlanBlock[] }>({
    queryKey: ["/api/schedule-builder/week-plans", selectedWeekPlanId],
    enabled: !!selectedWeekPlanId,
    refetchOnMount: "always",
  });

  // Prefer keeping a template selected once options exist (avoids empty "Select a template" after create).
  useEffect(() => {
    if (selectedTemplateId || templates.length === 0) return;
    setSelectedTemplateId(String(templates[0].id));
  }, [templates, selectedTemplateId]);

  // After week plans load, auto-select the latest if none selected.
  useEffect(() => {
    if (!templateId || selectedWeekPlanId || weekPlans.length === 0) return;
    const sorted = [...weekPlans].sort((a, b) => a.weekNumber - b.weekNumber);
    setSelectedWeekPlanId(sorted[sorted.length - 1].id);
  }, [templateId, weekPlans, selectedWeekPlanId]);

  const { data: aiStatus } = useQuery<{ available: boolean }>({
    queryKey: ["/api/schedule-ai/status"],
  });

  const selectedTemplateForQuery = templates.find((s) => s.id === templateId);
  const catalogClassId = selectedTemplateForQuery?.classId ?? null;
  const { data: driveCatalog } = useQuery<{
    classId: number;
    driveFolderId: string | null;
    classBand: CurriculumBand;
    assets: CurriculumAsset[];
  }>({
    queryKey: ["/api/schedule-builder/classes", catalogClassId, "curriculum-assets"],
    enabled: !!catalogClassId,
  });

  const { data: blockHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/schedule-builder/week-plan-blocks", historyBlockId, "history"],
    enabled: !!historyBlockId && historyDialog,
  });

  const createWeekMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/schedule-builder/week-plans", data);
      return res.json() as Promise<WeekPlan>;
    },
    onSuccess: async (newPlan) => {
      await queryClient.invalidateQueries({
        queryKey: ["/api/schedule-builder/skeletons", templateId, "week-plans"],
      });
      queryClient.setQueryData<WeekPlan[]>(
        ["/api/schedule-builder/skeletons", templateId, "week-plans"],
        (prev) => {
          const list = prev ?? [];
          if (list.some((p) => p.id === newPlan.id)) return list;
          return [...list, newPlan];
        },
      );
      setSelectedWeekPlanId(newPlan.id);
      toast({ title: "Week plan created" });
      setNewWeekDialog(false);
    },
    onError: (err: any) => toast({ title: "Error creating week plan", description: err.message, variant: "destructive" }),
  });

  const updateWeekMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/schedule-builder/week-plans/${id}`, data);
      return res.json() as Promise<WeekPlan>;
    },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({
        queryKey: ["/api/schedule-builder/skeletons", templateId, "week-plans"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["/api/schedule-builder/week-plans", updated.id],
      });
      toast({ title: "Week plan updated" });
    },
    onError: (err: any) => toast({ title: "Error updating week plan", description: err.message, variant: "destructive" }),
  });

  const deleteWeekMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/schedule-builder/week-plans/${id}`);
      return id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({
        queryKey: ["/api/schedule-builder/skeletons", templateId, "week-plans"],
      });
      queryClient.setQueryData<WeekPlan[]>(
        ["/api/schedule-builder/skeletons", templateId, "week-plans"],
        (prev) => (prev ?? []).filter((p) => p.id !== id),
      );
      if (selectedWeekPlanId === id || selectedWeekPlanId === deleteWeekId) {
        setSelectedWeekPlanId(null);
      }
      toast({ title: "Week plan deleted" });
      setDeleteWeekId(null);
    },
    onError: (err: any) => toast({ title: "Error deleting week plan", description: err.message, variant: "destructive" }),
  });

  const cloneWeekMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("POST", `/api/schedule-builder/week-plans/${id}/clone`, data);
      return res.json() as Promise<WeekPlan>;
    },
    onSuccess: async (cloned) => {
      await queryClient.invalidateQueries({
        queryKey: ["/api/schedule-builder/skeletons", templateId, "week-plans"],
      });
      queryClient.setQueryData<WeekPlan[]>(
        ["/api/schedule-builder/skeletons", templateId, "week-plans"],
        (prev) => {
          const list = prev ?? [];
          if (list.some((p) => p.id === cloned.id)) return list;
          return [...list, cloned];
        },
      );
      setSelectedWeekPlanId(cloned.id);
      toast({ title: "Week plan cloned" });
      setCloneDialog(false);
    },
    onError: (err: any) => toast({ title: "Error cloning week plan", description: err.message, variant: "destructive" }),
  });

  const createBlockMutation = useMutation({
    mutationFn: async ({ weekPlanId, data }: { weekPlanId: number; data: any }) => {
      const res = await apiRequest("POST", `/api/schedule-builder/week-plans/${weekPlanId}/blocks`, data);
      return res.json();
    },
    onSuccess: async () => {
      if (selectedWeekPlanId) {
        await queryClient.invalidateQueries({
          queryKey: ["/api/schedule-builder/week-plans", selectedWeekPlanId],
        });
      }
      toast({ title: "Block created" });
      setBlockEditDialog(false);
    },
    onError: (err: any) => toast({ title: "Error creating block", description: err.message, variant: "destructive" }),
  });

  const updateBlockMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/schedule-builder/week-plan-blocks/${id}`, data);
      return res.json();
    },
    onSuccess: async () => {
      if (selectedWeekPlanId) {
        await queryClient.invalidateQueries({
          queryKey: ["/api/schedule-builder/week-plans", selectedWeekPlanId],
        });
      }
      toast({ title: "Block updated" });
      setBlockEditDialog(false);
    },
    onError: (err: any) => toast({ title: "Error updating block", description: err.message, variant: "destructive" }),
  });

  const completeBlockMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/schedule-builder/week-plan-blocks/${id}/complete`);
      return res.json();
    },
    onSuccess: async () => {
      if (selectedWeekPlanId) {
        await queryClient.invalidateQueries({
          queryKey: ["/api/schedule-builder/week-plans", selectedWeekPlanId],
        });
      }
      toast({ title: "Block completion toggled" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const generateWeekMutation = useMutation({
    mutationFn: async (data: { skeletonId: number; weekNumber: number }) => {
      const res = await apiRequest("POST", "/api/schedule-ai/generate-week", data);
      return res.json() as Promise<{
        success?: boolean;
        usedFallback?: string | null;
        message?: string;
        blocks?: ProposedCurriculumAttachment[];
      }>;
    },
    onSuccess: (result) => {
      if (result.usedFallback === "build") {
        toast({
          title: "No Drive lessons indexed",
          description: "Use Build for template titles, or link a class Drive folder and reindex.",
        });
        setDrivePreview(null);
        return;
      }
      setDrivePreview({
        usedFallback: result.usedFallback,
        message: result.message,
        blocks: result.blocks || [],
      });
    },
    onError: (err: any) => toast({ title: "Drive draft failed", description: err.message, variant: "destructive" }),
  });

  const applyDriveDraftMutation = useMutation({
    mutationFn: async (data: { weekPlanId: number; blocks: ProposedCurriculumAttachment[] }) => {
      const res = await apiRequest(
        "POST",
        `/api/schedule-builder/week-plans/${data.weekPlanId}/apply-drive-draft`,
        { blocks: data.blocks },
      );
      return res.json();
    },
    onSuccess: async () => {
      setDrivePreview(null);
      if (selectedWeekPlanId) {
        await queryClient.invalidateQueries({
          queryKey: ["/api/schedule-builder/week-plans", selectedWeekPlanId],
        });
      }
      toast({ title: "Draft applied", description: "Week stays unpublished until you Publish." });
    },
    onError: (err: any) => toast({ title: "Apply draft failed", description: err.message, variant: "destructive" }),
  });

  const linkDriveMutation = useMutation({
    mutationFn: async (data: { classId: number; folderUrl: string }) => {
      const res = await apiRequest("POST", `/api/schedule-builder/classes/${data.classId}/drive/link`, {
        folderUrl: data.folderUrl,
      });
      return res.json();
    },
    onSuccess: async () => {
      if (catalogClassId) {
        await queryClient.invalidateQueries({
          queryKey: ["/api/schedule-builder/classes", catalogClassId, "curriculum-assets"],
        });
      }
      toast({ title: "Drive folder linked" });
    },
    onError: (err: any) => toast({ title: "Could not link folder", description: err.message, variant: "destructive" }),
  });

  const reindexDriveMutation = useMutation({
    mutationFn: async (classId: number) => {
      const res = await apiRequest("POST", `/api/schedule-builder/classes/${classId}/drive/reindex`);
      return res.json();
    },
    onSuccess: async () => {
      if (catalogClassId) {
        await queryClient.invalidateQueries({
          queryKey: ["/api/schedule-builder/classes", catalogClassId, "curriculum-assets"],
        });
      }
      toast({ title: "Drive folder reindexed" });
    },
    onError: (err: any) => toast({ title: "Reindex failed", description: err.message, variant: "destructive" }),
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
        materials: suggestion.materials || prev.materials,
      }));
      toast({ title: "AI suggestions applied" });
    },
    onError: (err: any) => toast({ title: "AI suggestion failed", description: err.message, variant: "destructive" }),
  });

  const generateLessonMutation = useMutation({
    mutationFn: async (data: { skeletonId: number; weekNumber: number; skeletonBlockId: number }) => {
      const res = await apiRequest("POST", "/api/schedule-ai/generate-week", data);
      return res.json() as Promise<{
        success?: boolean;
        usedFallback?: string | null;
        message?: string;
        blocks?: ProposedCurriculumAttachment[];
      }>;
    },
    onSuccess: (result) => {
      if (result.usedFallback === "build") {
        const message =
          result.message || "Connect a folder on this lesson, then Generate again.";
        setDrivePanelMessage(message);
        toast({
          title: "No Drive lesson for this slot",
          description: message,
        });
        return;
      }
      const row =
        result.blocks?.find((b) => b.skeletonBlockId === editingSkeletonBlockId) ??
        result.blocks?.[0];
      if (!row || (!row.curriculumAssetId && !row.title && !row.lessonLink)) {
        const message =
          "This period already has a matching file this term, or the folder has no file for it.";
        setDrivePanelMessage(message);
        toast({
          title: "No unused Drive lesson for this slot",
          description: message,
        });
        return;
      }
      setDrivePanelMessage(null);
      setBlockForm((prev) => ({
        ...prev,
        title: row.title || prev.title,
        description: row.description || prev.description,
        objectives: row.objectives?.length ? row.objectives : prev.objectives,
        materials: row.materials?.length ? row.materials : prev.materials,
        homework: row.homework || prev.homework,
        lessonLink: row.lessonLink || prev.lessonLink,
        notes: row.notes || prev.notes,
        curriculumAssetId: row.curriculumAssetId ?? prev.curriculumAssetId,
      }));
      toast({
        title: "Lesson drafted from Drive",
        description: "Review the fields, then Update Block. The week stays unpublished.",
      });
    },
    onError: (err: any) => toast({ title: "Generate lesson failed", description: err.message, variant: "destructive" }),
  });

  const linkSlotDriveMutation = useMutation({
    mutationFn: async (data: { skeletonBlockId: number; folderUrl: string }) => {
      const linkRes = await apiRequest(
        "POST",
        `/api/schedule-builder/skeleton-blocks/${data.skeletonBlockId}/drive/link`,
        { folderUrl: data.folderUrl },
      );
      const linked = await linkRes.json() as { driveFolderId?: string };
      const reindexRes = await apiRequest(
        "POST",
        `/api/schedule-builder/skeleton-blocks/${data.skeletonBlockId}/drive/reindex`,
        undefined,
        { passthroughStatuses: [403, 503] },
      );
      const reindexBody = await reindexRes.json().catch(() => ({})) as { message?: string };
      return { linked, reindexStatus: reindexRes.status, reindexMessage: reindexBody.message };
    },
    onSuccess: async ({ linked, reindexStatus, reindexMessage }) => {
      if (templateId) {
        await queryClient.invalidateQueries({
          queryKey: ["/api/schedule-builder/skeletons", templateId, "blocks"],
        });
      }
      if (catalogClassId) {
        await queryClient.invalidateQueries({
          queryKey: ["/api/schedule-builder/classes", catalogClassId, "curriculum-assets"],
        });
      }
      if (linked.driveFolderId) setLinkFolderInput(linked.driveFolderId);
      if (reindexStatus === 503 || reindexStatus === 403) {
        const message =
          reindexMessage ||
          (reindexStatus === 503
            ? "Folder saved on this lesson, but this computer cannot read Drive files yet. Install a Google Cloud service-account key, share the folder with that email, then Connect again."
            : "Folder saved, but Drive refused the file list. Enable the Drive API and share the folder with the service-account email, then Connect again.");
        setDrivePanelMessage(message);
        toast({ title: "Folder saved — Drive not readable", description: message, variant: "destructive" });
        return;
      }
      setDrivePanelMessage(null);
      toast({
        title: "Folder connected to this lesson",
        description: "Generate lesson will use files from this folder only.",
      });
    },
    onError: (err: any) => toast({ title: "Could not connect folder", description: err.message, variant: "destructive" }),
  });

  const connectFolderFromBlock = async () => {
    if (!editingSkeletonBlockId || !linkFolderInput.trim()) return;
    await linkSlotDriveMutation.mutateAsync({
      skeletonBlockId: editingSkeletonBlockId,
      folderUrl: linkFolderInput.trim(),
    });
  };

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

  const sortedWeekPlans = [...weekPlans].sort((a, b) => a.weekNumber - b.weekNumber);

  const openCreateBlock = (skeletonBlockId: number) => {
    setEditingBlockId(null);
    setEditingSkeletonBlockId(skeletonBlockId);
    const sb = skeletonBlocks.find((b) => b.id === skeletonBlockId);
    setLinkFolderInput(slotFolderPrefill(sb?.driveFolderId));
    setDrivePanelMessage(null);
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
    const sb = skeletonBlocks.find((row) => row.id === block.skeletonBlockId);
    setLinkFolderInput(slotFolderPrefill(sb?.driveFolderId));
    setDrivePanelMessage(null);
    setBlockForm({
      title: block.title || "",
      description: block.description || "",
      objectives: asTrimmedStrings(block.objectives),
      groups: normalizeEditGroups(block.groups),
      lessonLink: block.lessonLink || "",
      notes: block.notes || "",
      materials: asTrimmedStrings(block.materials),
      homework: block.homework || "",
      curriculumAssetId: block.curriculumAssetId ?? null,
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
      materials: blockForm.materials.filter(Boolean),
      homework: blockForm.homework || null,
      curriculumAssetId: blockForm.curriculumAssetId,
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
    createWeekMutation.mutate({
      skeletonId: templateId,
      weekNumber: parseInt(newWeekNumber),
      weekStartDate: newWeekStartDate,
      notes: newWeekNotes || null,
    });
  };

  const handleCloneWeek = () => {
    if (!cloneSourceId || !cloneWeekNumber || !cloneWeekStartDate) return;
    cloneWeekMutation.mutate({
      id: cloneSourceId,
      data: { weekNumber: parseInt(cloneWeekNumber), weekStartDate: cloneWeekStartDate },
    });
  };

  const handleCsvDownload = async () => {
    if (!selectedWeekPlanId) return;
    try {
      const res = await apiRequest("GET", `/api/schedule-builder/week-plans/${selectedWeekPlanId}/blocks/export-csv`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `week-plan-${selectedWeekPlanId}-blocks.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    }
  };

  const handleBuildFromTemplate = async () => {
    if (!selectedWeekPlanId) return;
    if (skeletonBlocks.length === 0) {
      toast({
        title: "No template blocks",
        description: "Add blocks to your Weekly Template first, then Build this week.",
      });
      return;
    }
    const existingBlocks: WeekPlanBlock[] = (selectedWeekData as any)?.blocks || [];
    const existingIds = new Set(
      existingBlocks.map((b) => b.skeletonBlockId).filter(Boolean),
    );
    const missing = skeletonBlocks.filter((sb) => !existingIds.has(sb.id));
    if (missing.length === 0) {
      toast({ title: "All slots already have content" });
      return;
    }
    setIsBuilding(true);
    try {
      await Promise.all(
        missing.map((sb) =>
          apiRequest("POST", `/api/schedule-builder/week-plans/${selectedWeekPlanId}/blocks`, {
            skeletonBlockId: sb.id,
            title: sb.defaultTitle || null,
            description: sb.defaultDescription || null,
            objectives: [],
            groups: [],
            lessonLink: null,
            notes: null,
          }),
        ),
      );
      await queryClient.invalidateQueries({
        queryKey: ["/api/schedule-builder/week-plans", selectedWeekPlanId],
      });
      toast({
        title: `Created ${missing.length} block${missing.length === 1 ? "" : "s"}`,
        description: "Filled empty slots from the weekly template.",
      });
    } catch (err: any) {
      toast({ title: "Build failed", description: err.message, variant: "destructive" });
      await queryClient.invalidateQueries({
        queryKey: ["/api/schedule-builder/week-plans", selectedWeekPlanId],
      });
    } finally {
      setIsBuilding(false);
    }
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? "");
      if (!text.trim()) {
        toast({
          title: "Empty CSV",
          description: "The selected file has no content.",
          variant: "destructive",
        });
        return;
      }
      setCsvImport({ file, csvText: text });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const closeCsvImport = () => setCsvImport(null);

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
  const classBand: CurriculumBand =
    driveCatalog?.classBand ||
    classBandFromClass({ title: selectedTemplate?.name || selectedTemplate?.gradeLevel });
  const assetsById = new Map((driveCatalog?.assets || []).map((asset) => [asset.id, asset]));
  const assetUseCounts = new Map<number, number>();
  for (const block of (selectedWeekData as { blocks?: WeekPlanBlock[] } | undefined)?.blocks || []) {
    if (block.curriculumAssetId) {
      assetUseCounts.set(block.curriculumAssetId, (assetUseCounts.get(block.curriculumAssetId) || 0) + 1);
    }
  }

  function matchChipFor(sb: SkeletonBlock, wb?: WeekPlanBlock): CurriculumMatchStatus {
    const asset = wb?.curriculumAssetId ? assetsById.get(wb.curriculumAssetId) : undefined;
    return weekPlanBlockMatchStatus({
      isTeachingSlot: isTeachingSkeletonBlock(sb),
      curriculumAssetId: wb?.curriculumAssetId,
      title: wb?.title,
      classBand,
      assetBand: asset?.band,
      assetMinutes: asset?.minutes,
      blockMinutes: blockLengthMinutes(sb.startTime, sb.endTime),
      duplicateInTerm: !!(wb?.curriculumAssetId && (assetUseCounts.get(wb.curriculumAssetId) || 0) > 1),
      assetMissing: !!(wb?.curriculumAssetId && !asset),
    });
  }
  const printColumns = buildAsaPrintColumnsFromWeekPlan(
    activeDays.map((dayOfWeek) => ({
      dayOfWeek,
      slots: (blocksByDay[dayOfWeek] || []).map(({ skeletonBlock, weekBlock }) => ({
        startTime: skeletonBlock.startTime,
        title: weekBlock?.title || skeletonBlock.defaultTitle || "",
        description: weekBlock?.description || skeletonBlock.defaultDescription || null,
        objectives: weekBlock?.objectives,
        lessonLink: weekBlock?.lessonLink ?? null,
      })),
    })),
  );
  const printTitle = shortPrintTitle(selectedWeekData ? selectedTemplate?.name : undefined);
  const printWeekRange = formatWeekOfRange(selectedWeekData?.weekStartDate);
  const nextWeekNumber = sortedWeekPlans.length > 0 ? sortedWeekPlans[sortedWeekPlans.length - 1].weekNumber + 1 : 1;
  const aiAvailable = aiStatus?.available ?? false;

  return (
    <SchoolAdminLayout pageTitle="Week Planner">
      <div className="flex flex-col space-y-6 p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div data-tutorial="week-planner-heading" data-testid="week-planner-heading">
            <h1 className="text-3xl font-bold tracking-tight">Multi-Week Planner</h1>
            <p className="text-muted-foreground mt-1">Manage week-by-week lesson plans based on weekly templates</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={launchTour}
              data-tutorial="week-planner-tour-btn"
              data-testid="week-planner-tour-btn"
            >
              <HelpCircle className="h-4 w-4 mr-2" />
              How to use
            </Button>
            <div className="w-64">
              <Select value={selectedTemplateId} onValueChange={(v) => { setSelectedTemplateId(v); setSelectedWeekPlanId(null); }}>
                <SelectTrigger data-tutorial="week-planner-template-select" data-testid="week-planner-template-select">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.gradeLevel})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                      data-testid={`week-plan-chip-${wp.id}`}
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
                data-tutorial="week-planner-new-week"
                data-testid="week-planner-new-week"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Week
              </Button>
            </div>

            {selectedWeekPlanId && selectedWeekLoading ? (
              <Card data-testid="week-planner-week-loading">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin opacity-50" />
                  <p>Loading week plan…</p>
                </CardContent>
              </Card>
            ) : selectedWeekPlanId && selectedWeekError ? (
              <Card data-testid="week-planner-week-error">
                <CardContent className="py-12 text-center text-muted-foreground space-y-2">
                  <p>Could not load this week plan.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      queryClient.invalidateQueries({
                        queryKey: ["/api/schedule-builder/week-plans", selectedWeekPlanId],
                      })
                    }
                  >
                    Retry
                  </Button>
                </CardContent>
              </Card>
            ) : selectedWeekPlanId && selectedWeekData ? (
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
                      <div
                        className="flex items-center gap-2 no-print"
                        data-tutorial="week-planner-publish-area"
                        data-testid="week-planner-publish-area"
                      >
                        <input
                          ref={csvFileInputRef}
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={handleCsvFileChange}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.print()}
                          data-testid="week-planner-print"
                        >
                          <Printer className="h-4 w-4 mr-1" />
                          Print
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid="week-planner-draft-from-drive"
                          disabled={!templateId || generateWeekMutation.isPending}
                          onClick={() =>
                            templateId &&
                            generateWeekMutation.mutate({
                              skeletonId: templateId,
                              weekNumber: selectedWeekData.weekNumber,
                            })
                          }
                        >
                          {generateWeekMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <FolderOpen className="h-4 w-4 mr-1" />
                          )}
                          Draft week from Drive
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid="week-planner-actions"
                              disabled={
                                isBuilding ||
                                updateWeekMutation.isPending ||
                                generateWeekMutation.isPending ||
                                analyzeGapsMutation.isPending
                              }
                            >
                              {(isBuilding ||
                                updateWeekMutation.isPending ||
                                generateWeekMutation.isPending ||
                                analyzeGapsMutation.isPending) ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4 mr-1" />
                              )}
                              Actions
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem
                              data-testid="week-planner-draft-from-drive-menu"
                              onClick={() =>
                                templateId &&
                                generateWeekMutation.mutate({
                                  skeletonId: templateId,
                                  weekNumber: selectedWeekData.weekNumber,
                                })
                              }
                              disabled={generateWeekMutation.isPending}
                            >
                              {generateWeekMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <FolderOpen className="h-4 w-4 mr-2" />
                              )}
                              Draft week from Drive
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setLinkFolderInput(driveCatalog?.driveFolderId || "");
                                setLinkDriveOpen(true);
                              }}
                              disabled={!catalogClassId}
                            >
                              <FolderOpen className="h-4 w-4 mr-2" />
                              Link Drive folder
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleBuildFromTemplate()}
                              disabled={isBuilding}
                            >
                              {isBuilding ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Hammer className="h-4 w-4 mr-2" />
                              )}
                              Build
                            </DropdownMenuItem>
                            {skeletonBlocks.length === 0 && (
                              <DropdownMenuItem onClick={() => setLocation("/schools/schedule-builder")}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Weekly Templates
                              </DropdownMenuItem>
                            )}
                            {selectedWeekData.status === "draft" && (
                              <DropdownMenuItem
                                data-testid="week-planner-publish"
                                onClick={() =>
                                  updateWeekMutation.mutate({
                                    id: selectedWeekPlanId!,
                                    data: { status: "published" },
                                  })
                                }
                                disabled={updateWeekMutation.isPending}
                              >
                                {updateWeekMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                )}
                                Publish
                              </DropdownMenuItem>
                            )}
                            {selectedWeekData.status === "published" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  updateWeekMutation.mutate({
                                    id: selectedWeekPlanId!,
                                    data: { status: "completed" },
                                  })
                                }
                                disabled={updateWeekMutation.isPending}
                              >
                                {updateWeekMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                )}
                                Complete
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              data-testid="week-planner-print-menu"
                              onClick={() => window.print()}
                            >
                              <Printer className="h-4 w-4 mr-2" />
                              Print
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleCsvDownload}>
                              <Download className="h-4 w-4 mr-2" />
                              Download CSV
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => csvFileInputRef.current?.click()}>
                              <Upload className="h-4 w-4 mr-2" />
                              Upload CSV
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setCloneSourceId(selectedWeekPlanId);
                                setCloneWeekNumber(String(nextWeekNumber));
                                setCloneWeekStartDate("");
                                setCloneDialog(true);
                              }}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Clone
                            </DropdownMenuItem>
                            {aiAvailable && (
                              <>
                                <DropdownMenuItem
                                  onClick={() =>
                                    analyzeGapsMutation.mutate({ weekPlanId: selectedWeekPlanId! })
                                  }
                                  disabled={analyzeGapsMutation.isPending}
                                >
                                  {analyzeGapsMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Search className="h-4 w-4 mr-2" />
                                  )}
                                  Analyze Gaps
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteWeekId(selectedWeekPlanId)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                          className={`border-l-4 ${BLOCK_TYPE_COLORS[sb.blockType] || "border-l-gray-300"} ${wb?.isCompleted ? "opacity-60" : ""}`}
                        >
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTime(sb.startTime)} – {formatTime(sb.endTime)}
                              </span>
                              <Badge className={`text-[10px] ${BLOCK_TYPE_BADGE[sb.blockType] || ""}`}>{sb.blockType}</Badge>
                            </div>
                            <div className="flex items-start gap-2">
                              <Checkbox
                                checked={wb?.isCompleted ?? false}
                                onCheckedChange={() => wb && completeBlockMutation.mutate(wb.id)}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${wb?.isCompleted ? "line-through" : ""}`}>
                                  {wb?.title || sb.defaultTitle}
                                </p>
                                {(() => {
                                  const fullDescription = withSnackHandwashingStatement(
                                    wb?.title || sb.defaultTitle,
                                    wb?.description || sb.defaultDescription,
                                  );
                                  const preview = lessonTeachingPreview({
                                    description: fullDescription,
                                    objectives: wb?.objectives,
                                    materials: wb?.materials,
                                  });
                                  const leftoverMaterials = asTrimmedStrings(wb?.materials).length - preview.materials.length;
                                  return (
                                    <>
                                      {preview.descriptionPreview && (
                                        <p
                                          className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap line-clamp-4"
                                          data-testid={`week-block-description-${wb?.id ?? `slot-${sb.id}`}`}
                                        >
                                          {preview.descriptionPreview}
                                        </p>
                                      )}
                                      {preview.objectives.length > 0 && (
                                        <ul className="mt-1.5 space-y-1" data-testid={`week-block-objectives-${wb?.id ?? `slot-${sb.id}`}`}>
                                          {preview.objectives.map((obj) => (
                                            <li key={obj} className="flex gap-1.5 text-xs text-slate-600">
                                              <Target className="h-3 w-3 mt-0.5 shrink-0 text-emerald-600" />
                                              <span className="line-clamp-2">{obj}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                      {preview.materials.length > 0 && (
                                        <p className="text-[11px] text-slate-500 mt-1.5 flex items-start gap-1">
                                          <Package className="h-3 w-3 mt-0.5 shrink-0" />
                                          <span>
                                            {preview.materials.join(" · ")}
                                            {leftoverMaterials > 0 ? ` +${leftoverMaterials} more` : ""}
                                          </span>
                                        </p>
                                      )}
                                    </>
                                  );
                                })()}
                                {wb?.lessonLink && (
                                  <a
                                    href={wb.lessonLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 flex items-center gap-1 mt-1"
                                    data-testid={`week-block-drive-link-${wb.id}`}
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    {assetsById.get(wb.curriculumAssetId ?? -1)?.title || "Open Drive"}
                                  </a>
                                )}
                                <Badge
                                  variant="outline"
                                  className="mt-1 text-[10px]"
                                  data-testid={`week-block-match-${wb?.id ?? `slot-${sb.id}`}`}
                                >
                                  {MATCH_STATUS_LABEL[matchChipFor(sb, wb)]}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 pt-1 border-t flex-wrap">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                data-testid={`week-block-details-${wb?.id ?? `slot-${sb.id}`}`}
                                onClick={() => setDetailBlock(toBlockDetail(sb, wb))}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                Lesson
                              </Button>
                              {wb ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  data-testid={`week-block-edit-${wb.id}`}
                                  onClick={() => openEditBlock(wb)}
                                >
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
                              {wb && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  data-testid={`week-block-swap-${wb.id}`}
                                  onClick={() => setSwapBlock(wb)}
                                >
                                  Swap
                                </Button>
                              )}
                              {wb?.curriculumAssetId && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  data-testid={`week-block-detach-${wb.id}`}
                                  onClick={() =>
                                    updateBlockMutation.mutate({
                                      id: wb.id,
                                      data: { curriculumAssetId: null },
                                    })
                                  }
                                >
                                  <Unlink className="h-3 w-3 mr-1" />
                                  Detach
                                </Button>
                              )}
                              {aiAvailable && (
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
                    <CardContent className="py-8 text-center text-muted-foreground space-y-3">
                      <p>No template blocks found. Add blocks to your Weekly Template first.</p>
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/schools/schedule-builder">Add blocks to your template</Link>
                      </Button>
                    </CardContent>
                  </Card>
                )}
                <AsaWeeklySchedulePrintSheet
                  title={printTitle}
                  weekRange={printWeekRange}
                  columns={printColumns}
                />
                <WeekPlanBlockDetailSheet
                  open={!!detailBlock}
                  onClose={() => setDetailBlock(null)}
                  block={detailBlock}
                />
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
            <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
              <div>
                <p className="text-sm font-medium">Drive folder for this lesson</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Paste this slot’s folder URL (Latin, AoA, Science…). Generate uses that folder only, and skips files already used this term.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  data-testid="week-block-drive-folder"
                  value={linkFolderInput}
                  onChange={(e) => setLinkFolderInput(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/…"
                />
                <Button
                  type="button"
                  variant="outline"
                  data-testid="week-block-connect-folder"
                  disabled={
                    !editingSkeletonBlockId ||
                    !linkFolderInput.trim() ||
                    linkSlotDriveMutation.isPending
                  }
                  onClick={() => void connectFolderFromBlock()}
                >
                  {linkSlotDriveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <FolderOpen className="h-4 w-4 mr-1" />
                  )}
                  Connect folder
                </Button>
              </div>
              {drivePanelMessage && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  {drivePanelMessage}
                </p>
              )}
              <Button
                type="button"
                data-testid="week-block-generate-lesson"
                disabled={
                  !templateId ||
                  !editingSkeletonBlockId ||
                  !selectedWeekData ||
                  generateLessonMutation.isPending
                }
                onClick={() =>
                  templateId &&
                  editingSkeletonBlockId &&
                  selectedWeekData &&
                  generateLessonMutation.mutate({
                    skeletonId: templateId,
                    weekNumber: selectedWeekData.weekNumber,
                    skeletonBlockId: editingSkeletonBlockId,
                  })
                }
              >
                {generateLessonMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                Generate lesson
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={blockForm.title} onChange={(e) => setBlockForm({ ...blockForm, title: e.target.value })} placeholder="Block title" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={blockForm.description}
                onChange={(e) => setBlockForm({ ...blockForm, description: e.target.value })}
                placeholder="What is being taught this week — timed script, word of the day, product..."
                rows={6}
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
                <Label>Materials</Label>
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => setBlockForm({ ...blockForm, materials: [...blockForm.materials, ""] })}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              {blockForm.materials.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={item}
                    onChange={(e) => {
                      const updated = [...blockForm.materials];
                      updated[i] = e.target.value;
                      setBlockForm({ ...blockForm, materials: updated });
                    }}
                    placeholder={`Material ${i + 1}`}
                  />
                  <Button
                    type="button" variant="ghost" size="sm"
                    onClick={() => setBlockForm({ ...blockForm, materials: blockForm.materials.filter((_, idx) => idx !== i) })}
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
              <Label>Homework</Label>
              <Textarea
                value={blockForm.homework}
                onChange={(e) => setBlockForm({ ...blockForm, homework: e.target.value })}
                placeholder="Optional follow-up for families"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Teaching notes</Label>
              <Textarea
                value={blockForm.notes}
                onChange={(e) => setBlockForm({ ...blockForm, notes: e.target.value })}
                placeholder="Mentor-facing notes for this lesson"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {aiAvailable && editingSkeletonBlockId && (
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
            )}
            <Button variant="outline" onClick={() => setBlockEditDialog(false)}>Cancel</Button>
            <Button
              onClick={handleBlockSubmit}
              disabled={createBlockMutation.isPending || updateBlockMutation.isPending}
              data-testid="week-block-save"
            >
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
      <Dialog open={!!drivePreview} onOpenChange={(open) => { if (!open) setDrivePreview(null); }}>
        <DialogContent className="max-w-lg max-h-[75vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Drive draft preview</DialogTitle>
            <DialogDescription>
              Review attachments before applying. The week stays draft until you Publish.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {(drivePreview?.blocks || []).map((row) => {
              const sb = skeletonBlocks.find((b) => b.id === row.skeletonBlockId);
              return (
                <div key={row.skeletonBlockId} className="border rounded p-2">
                  <p className="font-medium">{row.title || sb?.defaultTitle || `Slot ${row.skeletonBlockId}`}</p>
                  <p className="text-xs text-muted-foreground">
                    {MATCH_STATUS_LABEL[row.matchStatus]}
                    {row.lessonLink ? " · Drive link attached" : ""}
                  </p>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDrivePreview(null)}>Cancel</Button>
            <Button
              data-testid="week-planner-apply-drive-draft"
              disabled={!selectedWeekPlanId || applyDriveDraftMutation.isPending}
              onClick={() =>
                selectedWeekPlanId &&
                drivePreview &&
                applyDriveDraftMutation.mutate({
                  weekPlanId: selectedWeekPlanId,
                  blocks: drivePreview.blocks.filter((b) => b.curriculumAssetId || b.title),
                })
              }
            >
              {applyDriveDraftMutation.isPending ? "Applying…" : "Apply draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!swapBlock} onOpenChange={(open) => { if (!open) setSwapBlock(null); }}>
        <DialogContent className="max-w-lg max-h-[75vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Swap Drive lesson</DialogTitle>
            <DialogDescription>Pick another indexed file for this slot. The rest of the week is unchanged.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(driveCatalog?.assets || [])
              .filter((asset) => (asset.assetKind || "lesson") !== "guide")
              .map((asset) => (
                <Button
                  key={asset.id}
                  variant="outline"
                  className="w-full justify-start h-auto py-2"
                  data-testid={`week-block-swap-asset-${asset.id}`}
                  onClick={() => {
                    if (!swapBlock) return;
                    updateBlockMutation.mutate({
                      id: swapBlock.id,
                      data: {
                        curriculumAssetId: asset.id,
                        title: asset.title || asset.name,
                        lessonLink: asset.webViewLink,
                        objectives: asset.objectives || [],
                        materials: asset.materials || [],
                      },
                    });
                    setSwapBlock(null);
                  }}
                >
                  <span className="text-left">
                    <span className="block text-sm">{asset.title || asset.name}</span>
                    <span className="block text-xs text-muted-foreground">{asset.band || "unbanded"} · {asset.subject || "general"}</span>
                  </span>
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={linkDriveOpen} onOpenChange={setLinkDriveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link class Drive folder</DialogTitle>
            <DialogDescription>
              Paste a Google Drive folder URL. Reindex lists files and stores card metadata only.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Folder URL or id</Label>
            <Input
              value={linkFolderInput}
              onChange={(e) => setLinkFolderInput(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDriveOpen(false)}>Cancel</Button>
            <Button
              disabled={!catalogClassId || !linkFolderInput.trim() || linkDriveMutation.isPending}
              onClick={() =>
                catalogClassId &&
                linkDriveMutation.mutate({ classId: catalogClassId, folderUrl: linkFolderInput.trim() })
              }
            >
              {linkDriveMutation.isPending ? "Saving…" : "Save folder"}
            </Button>
            <Button
              variant="secondary"
              disabled={!catalogClassId || reindexDriveMutation.isPending}
              onClick={() => catalogClassId && reindexDriveMutation.mutate(catalogClassId)}
            >
              {reindexDriveMutation.isPending ? "Indexing…" : "Reindex"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScheduleBlocksCsvImportDialog
        mode="week-plan"
        open={!!csvImport && !!selectedWeekPlanId}
        weekPlanId={selectedWeekPlanId ?? 0}
        weekLabel={
          selectedWeekData
            ? `Week ${selectedWeekData.weekNumber}${selectedTemplate ? ` · ${selectedTemplate.name}` : ""}`
            : "Week plan"
        }
        file={csvImport?.file ?? null}
        csvText={csvImport?.csvText ?? null}
        onClose={closeCsvImport}
        onImported={() => {
          queryClient.invalidateQueries({
            queryKey: ["/api/schedule-builder/skeletons", templateId, "week-plans"],
          });
        }}
      />
    </SchoolAdminLayout>
  );
}
