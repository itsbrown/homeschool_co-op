import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit, Trash2, Calendar, Clock, ChevronDown, ChevronUp, LayoutGrid, BookOpen, Sparkles, Loader2, Download, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { WeeklySkeleton, SkeletonBlock, Session } from "@shared/schema";
import { BLOCK_TYPE_BADGE_COLORS } from "@/lib/blockColors";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DAY_NAME_TO_NUMBER: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

const DAY_NUMBER_TO_NAME: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday",
};

interface TemplateFormData {
  name: string;
  description: string;
  gradeLevel: string;
  classId: string;
  operatingDays: string[];
  sessionId: string;
  isActive: boolean;
}

const emptyTemplateForm: TemplateFormData = {
  name: "",
  description: "",
  gradeLevel: "",
  classId: "",
  operatingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  sessionId: "",
  isActive: true,
};

interface BlockFormData {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  blockType: string;
  defaultTitle: string;
  defaultDescription: string;
  subjectArea: string;
}

const emptyBlockForm: BlockFormData = {
  dayOfWeek: "",
  startTime: "08:00",
  endTime: "09:00",
  blockType: "curriculum",
  defaultTitle: "",
  defaultDescription: "",
  subjectArea: "",
};

export default function ScheduleBuilderPage() {
  const { toast } = useToast();
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateFormData>(emptyTemplateForm);
  const [deleteTemplateId, setDeleteTemplateId] = useState<number | null>(null);
  const [expandedTemplateId, setExpandedTemplateId] = useState<number | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);
  const [blockForm, setBlockForm] = useState<BlockFormData>(emptyBlockForm);
  const [deleteBlockInfo, setDeleteBlockInfo] = useState<{ skeletonId: number; blockId: number } | null>(null);
  const [activeTemplateForBlock, setActiveTemplateForBlock] = useState<WeeklySkeleton | null>(null);
  const [csvUploadDialog, setCsvUploadDialog] = useState<{ skeletonId: number; skeletonName: string } | null>(null);
  const [csvUploadFile, setCsvUploadFile] = useState<File | null>(null);
  const [csvPreviewRows, setCsvPreviewRows] = useState<any[] | null>(null);
  const [csvPreviewErrors, setCsvPreviewErrors] = useState<string[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const { data: templates = [], isLoading } = useQuery<WeeklySkeleton[]>({
    queryKey: ["/api/schedule-builder/skeletons"],
  });

  const { data: sessionsList = [] } = useQuery<Session[]>({
    queryKey: ["/api/admin/sessions"],
  });

  const { data: classesData } = useQuery<{ items: any[]; classes?: any[] }>({
    queryKey: ["/api/school-admin/classes"],
  });
  const classesList = classesData?.items ?? classesData?.classes ?? [];

  const { data: aiStatus } = useQuery<{ available: boolean }>({
    queryKey: ["/api/schedule-ai/status"],
  });
  const aiAvailable = aiStatus?.available ?? false;

  const { data: activeTemplateBlocks = [] } = useQuery<SkeletonBlock[]>({
    queryKey: ["/api/schedule-builder/skeletons", activeTemplateForBlock?.id, "blocks"],
    enabled: !!activeTemplateForBlock?.id,
  });

  const createTemplateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/schedule-builder/skeletons", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/skeletons"] });
      toast({ title: "Weekly template created" });
      setTemplateDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error creating template", description: err.message, variant: "destructive" });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/schedule-builder/skeletons/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/skeletons"] });
      toast({ title: "Weekly template updated" });
      setTemplateDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error updating template", description: err.message, variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/schedule-builder/skeletons/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/skeletons"] });
      toast({ title: "Weekly template deleted" });
      setDeleteTemplateId(null);
      if (expandedTemplateId === deleteTemplateId) setExpandedTemplateId(null);
    },
    onError: (err: any) => {
      toast({ title: "Error deleting template", description: err.message, variant: "destructive" });
    },
  });

  const createBlockMutation = useMutation({
    mutationFn: ({ skeletonId, data }: { skeletonId: number; data: any }) =>
      apiRequest("POST", `/api/schedule-builder/skeletons/${skeletonId}/blocks`, data),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/skeletons", variables.skeletonId, "blocks"] });
      toast({ title: "Block created" });
      setBlockDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error creating block", description: err.message, variant: "destructive" });
    },
  });

  const updateBlockMutation = useMutation({
    mutationFn: ({ skeletonId, blockId, data }: { skeletonId: number; blockId: number; data: any }) =>
      apiRequest("PATCH", `/api/schedule-builder/skeletons/${skeletonId}/blocks/${blockId}`, data),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/skeletons", variables.skeletonId, "blocks"] });
      toast({ title: "Block updated" });
      setBlockDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error updating block", description: err.message, variant: "destructive" });
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: ({ skeletonId, blockId }: { skeletonId: number; blockId: number }) =>
      apiRequest("DELETE", `/api/schedule-builder/skeletons/${skeletonId}/blocks/${blockId}`),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/skeletons", variables.skeletonId, "blocks"] });
      toast({ title: "Block deleted" });
      setDeleteBlockInfo(null);
    },
    onError: (err: any) => {
      toast({ title: "Error deleting block", description: err.message, variant: "destructive" });
    },
  });

  const openCreateTemplate = () => {
    setEditingTemplateId(null);
    setTemplateForm(emptyTemplateForm);
    setTemplateDialogOpen(true);
  };

  const openEditTemplate = (s: WeeklySkeleton) => {
    setEditingTemplateId(s.id);
    setTemplateForm({
      name: s.name,
      description: s.description || "",
      gradeLevel: s.gradeLevel,
      classId: s.classId ? String(s.classId) : "",
      operatingDays: s.operatingDays || [],
      sessionId: s.sessionId ? String(s.sessionId) : "",
      isActive: s.isActive,
    });
    setTemplateDialogOpen(true);
  };

  const handleTemplateSubmit = () => {
    if (!templateForm.name || !templateForm.classId || templateForm.operatingDays.length === 0) {
      toast({ title: "Please fill in all required fields (name, class, and at least one operating day)", variant: "destructive" });
      return;
    }
    const selectedClass = classesList.find((cls: any) => String(cls.id) === templateForm.classId);
    const payload: any = {
      name: templateForm.name,
      description: templateForm.description || null,
      gradeLevel: selectedClass ? (selectedClass.title || selectedClass.name || `Class ${selectedClass.id}`) : templateForm.gradeLevel,
      classId: parseInt(templateForm.classId),
      operatingDays: templateForm.operatingDays,
      isActive: templateForm.isActive,
    };
    if (templateForm.sessionId) payload.sessionId = parseInt(templateForm.sessionId);
    if (editingTemplateId) {
      updateTemplateMutation.mutate({ id: editingTemplateId, data: payload });
    } else {
      createTemplateMutation.mutate(payload);
    }
  };

  const toggleOperatingDay = (day: string) => {
    setTemplateForm((prev) => ({
      ...prev,
      operatingDays: prev.operatingDays.includes(day)
        ? prev.operatingDays.filter((d) => d !== day)
        : [...prev.operatingDays, day],
    }));
  };

  const openCreateBlock = (template: WeeklySkeleton) => {
    setActiveTemplateForBlock(template);
    setEditingBlockId(null);
    const firstDay = template.operatingDays?.[0];
    setBlockForm({
      ...emptyBlockForm,
      dayOfWeek: firstDay ? String(DAY_NAME_TO_NUMBER[firstDay]) : "",
    });
    setBlockDialogOpen(true);
  };

  const openCreateBlockForDay = (template: WeeklySkeleton, dayNum: number) => {
    setActiveTemplateForBlock(template);
    setEditingBlockId(null);
    setBlockForm({
      ...emptyBlockForm,
      dayOfWeek: String(dayNum),
    });
    setBlockDialogOpen(true);
  };

  const openEditBlock = (template: WeeklySkeleton, block: SkeletonBlock) => {
    setActiveTemplateForBlock(template);
    setEditingBlockId(block.id);
    setBlockForm({
      dayOfWeek: String(block.dayOfWeek),
      startTime: block.startTime,
      endTime: block.endTime,
      blockType: block.blockType,
      defaultTitle: block.defaultTitle,
      defaultDescription: block.defaultDescription || "",
      subjectArea: block.subjectArea || "",
    });
    setBlockDialogOpen(true);
  };

  const handleBlockSubmit = () => {
    if (!activeTemplateForBlock) return;
    if (!blockForm.dayOfWeek || !blockForm.startTime || !blockForm.endTime || !blockForm.blockType || !blockForm.defaultTitle) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    if (blockForm.endTime <= blockForm.startTime) {
      toast({ title: "Invalid time range", description: "End time must be after start time.", variant: "destructive" });
      return;
    }

    const dayOfWeekNum = parseInt(blockForm.dayOfWeek);
    const overlapping = activeTemplateBlocks.find((b) => {
      if (b.dayOfWeek !== dayOfWeekNum) return false;
      if (editingBlockId && b.id === editingBlockId) return false;
      return blockForm.startTime < b.endTime && blockForm.endTime > b.startTime;
    });
    if (overlapping) {
      toast({
        title: "Time overlap detected",
        description: `This block overlaps with "${overlapping.defaultTitle}" (${overlapping.startTime}–${overlapping.endTime}).`,
        variant: "destructive",
      });
      return;
    }

    const payload = {
      dayOfWeek: dayOfWeekNum,
      startTime: blockForm.startTime,
      endTime: blockForm.endTime,
      blockType: blockForm.blockType,
      defaultTitle: blockForm.defaultTitle,
      defaultDescription: blockForm.defaultDescription || null,
      subjectArea: blockForm.subjectArea || null,
    };
    if (editingBlockId) {
      updateBlockMutation.mutate({ skeletonId: activeTemplateForBlock.id, blockId: editingBlockId, data: payload });
    } else {
      createBlockMutation.mutate({ skeletonId: activeTemplateForBlock.id, data: payload });
    }
  };

  const suggestBlockMutation = useMutation({
    mutationFn: (data: { skeletonBlockId: number; blockType?: string; subjectArea?: string }) =>
      apiRequest("POST", "/api/schedule-ai/suggest-block-content", data),
    onSuccess: async (res) => {
      const suggestion = await res.json();
      setBlockForm((prev) => ({
        ...prev,
        defaultTitle: suggestion.title || prev.defaultTitle,
        defaultDescription: suggestion.description || prev.defaultDescription,
        subjectArea: suggestion.subjectArea || prev.subjectArea,
      }));
      toast({ title: "AI suggestions applied" });
    },
    onError: (err: any) => {
      toast({ title: "AI suggestion failed", description: err.message, variant: "destructive" });
    },
  });

  const templateIsPending = createTemplateMutation.isPending || updateTemplateMutation.isPending;
  const blockIsPending = createBlockMutation.isPending || updateBlockMutation.isPending;

  const downloadSkeletonCsv = (template: WeeklySkeleton) => {
    const a = document.createElement("a");
    a.href = `/api/schedule-builder/skeletons/${template.id}/blocks/export-csv`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const openCsvUploadDialog = (template: WeeklySkeleton) => {
    setCsvUploadDialog({ skeletonId: template.id, skeletonName: template.name });
    setCsvUploadFile(null);
    setCsvPreviewRows(null);
    setCsvPreviewErrors([]);
    if (csvFileInputRef.current) csvFileInputRef.current.value = "";
  };

  const handleCsvFileSelect = (file: File) => {
    setCsvUploadFile(file);
    setCsvPreviewRows(null);
    setCsvPreviewErrors([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const allLines = text.split("\n");
      const filtered = allLines.filter((l) => !l.trim().startsWith("#") && l.trim() !== "");
      if (filtered.length <= 1) {
        setCsvPreviewErrors(["CSV has no data rows."]);
        return;
      }
      const headers = filtered[0].split(",").map((h) => h.trim());
      const rows: any[] = [];
      for (let i = 1; i < Math.min(filtered.length, 6); i++) {
        const vals = filtered[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
        const row: any = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
        rows.push(row);
      }
      setCsvPreviewRows(rows);
    };
    reader.readAsText(file);
  };

  const handleCsvImport = async () => {
    if (!csvUploadDialog || !csvUploadFile) return;
    setCsvImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", csvUploadFile);
      const response = await fetch(`/api/schedule-builder/skeletons/${csvUploadDialog.skeletonId}/blocks/import-csv`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.errors && data.errors.length > 0) {
          setCsvPreviewErrors(data.errors);
        } else {
          toast({ title: "Import failed", description: data.message || "Unknown error", variant: "destructive" });
        }
      } else {
        toast({ title: "Import successful", description: data.message });
        queryClient.invalidateQueries({ queryKey: ["/api/schedule-builder/skeletons", csvUploadDialog.skeletonId, "blocks"] });
        setCsvUploadDialog(null);
      }
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setCsvImporting(false);
    }
  };

  return (
    <SchoolAdminLayout pageTitle="Weekly Templates">
      <div className="flex flex-col space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Weekly Templates</h1>
            <p className="text-muted-foreground mt-1">Create and manage weekly schedule templates with time blocks</p>
          </div>
          <Button onClick={openCreateTemplate}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <LayoutGrid className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Templates Yet</h3>
              <p className="text-muted-foreground mb-4">Create a weekly schedule template to define your time block structure.</p>
              <Button onClick={openCreateTemplate}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                sessions={sessionsList}
                classes={classesList}
                isExpanded={expandedTemplateId === template.id}
                onToggleExpand={() => setExpandedTemplateId(expandedTemplateId === template.id ? null : template.id)}
                onEdit={() => openEditTemplate(template)}
                onDelete={() => setDeleteTemplateId(template.id)}
                onAddBlock={() => openCreateBlock(template)}
                onAddBlockForDay={(dayNum) => openCreateBlockForDay(template, dayNum)}
                onEditBlock={(block) => openEditBlock(template, block)}
                onDeleteBlock={(blockId) => setDeleteBlockInfo({ skeletonId: template.id, blockId })}
                onDownloadCsv={() => downloadSkeletonCsv(template)}
                onUploadCsv={() => openCsvUploadDialog(template)}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplateId ? "Edit Weekly Template" : "Create New Weekly Template"}</DialogTitle>
            <DialogDescription>
              {editingTemplateId ? "Update the weekly schedule template." : "Define a new weekly schedule template."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input placeholder="e.g. K-2 Weekly Schedule" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="Optional description" value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Class *</Label>
              <Select value={templateForm.classId} onValueChange={(v) => setTemplateForm({ ...templateForm, classId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a class..." />
                </SelectTrigger>
                <SelectContent>
                  {classesList.map((cls: any) => (
                    <SelectItem key={cls.id} value={String(cls.id)}>
                      {cls.title || cls.name || `Class ${cls.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Operating Days *</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <Button
                    key={day}
                    type="button"
                    variant={templateForm.operatingDays.includes(day) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleOperatingDay(day)}
                  >
                    {day.slice(0, 3)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Session Link (optional)</Label>
              <Select value={templateForm.sessionId} onValueChange={(v) => setTemplateForm({ ...templateForm, sessionId: v === "none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="No session linked" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No session linked</SelectItem>
                  {sessionsList.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={templateForm.isActive} onCheckedChange={(v) => setTemplateForm({ ...templateForm, isActive: v })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleTemplateSubmit} disabled={templateIsPending}>
              {templateIsPending ? "Saving..." : editingTemplateId ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBlockId ? "Edit Block" : "Add Block"}</DialogTitle>
            <DialogDescription>
              {editingBlockId ? "Update time block details." : "Add a new time block to the template."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Day of Week *</Label>
              <Select value={blockForm.dayOfWeek} onValueChange={(v) => setBlockForm({ ...blockForm, dayOfWeek: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {(activeTemplateForBlock?.operatingDays || []).map((day) => (
                    <SelectItem key={day} value={String(DAY_NAME_TO_NUMBER[day])}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time *</Label>
                <Input type="time" value={blockForm.startTime} onChange={(e) => setBlockForm({ ...blockForm, startTime: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End Time *</Label>
                <Input type="time" value={blockForm.endTime} onChange={(e) => setBlockForm({ ...blockForm, endTime: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Block Type *</Label>
              <Select value={blockForm.blockType} onValueChange={(v) => setBlockForm({ ...blockForm, blockType: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anchor">Anchor</SelectItem>
                  <SelectItem value="curriculum">Curriculum</SelectItem>
                  <SelectItem value="flexible">Flexible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default Title *</Label>
              <Input placeholder="e.g. Morning Circle, Math Block" value={blockForm.defaultTitle} onChange={(e) => setBlockForm({ ...blockForm, defaultTitle: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Default Description</Label>
              <Textarea placeholder="Optional description" value={blockForm.defaultDescription} onChange={(e) => setBlockForm({ ...blockForm, defaultDescription: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Subject Area</Label>
              <Input placeholder="e.g. Math, Science, Language Arts" value={blockForm.subjectArea} onChange={(e) => setBlockForm({ ...blockForm, subjectArea: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {aiAvailable && editingBlockId ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => suggestBlockMutation.mutate({ skeletonBlockId: editingBlockId, blockType: blockForm.blockType, subjectArea: blockForm.subjectArea })}
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
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBlockSubmit} disabled={blockIsPending}>
              {blockIsPending ? "Saving..." : editingBlockId ? "Update Block" : "Add Block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTemplateId !== null} onOpenChange={() => setDeleteTemplateId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>Are you sure you want to delete this weekly template? All associated blocks will also be deleted. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTemplateId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTemplateId && deleteTemplateMutation.mutate(deleteTemplateId)} disabled={deleteTemplateMutation.isPending}>
              {deleteTemplateMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteBlockInfo !== null} onOpenChange={() => setDeleteBlockInfo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Block</DialogTitle>
            <DialogDescription>Are you sure you want to delete this time block? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBlockInfo(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteBlockInfo && deleteBlockMutation.mutate(deleteBlockInfo)} disabled={deleteBlockMutation.isPending}>
              {deleteBlockMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={csvUploadDialog !== null} onOpenChange={(open) => { if (!open) setCsvUploadDialog(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload CSV — {csvUploadDialog?.skeletonName}</DialogTitle>
            <DialogDescription>
              Upload a CSV file to replace all blocks for this template. Existing blocks will be deleted and replaced with the CSV contents after validation passes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Uploading will <strong>replace all existing blocks</strong> for this template. Download the current template first to preserve existing data.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>CSV File</Label>
              <input
                type="file"
                accept=".csv"
                ref={csvFileInputRef}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCsvFileSelect(f);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Required columns: <code>day_of_week, start_time, end_time, block_type, default_title</code>. Optional: <code>subject_area, sort_order</code>.
              </p>
            </div>
            {csvPreviewErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-semibold mb-1">Validation errors:</p>
                  <ul className="text-sm list-disc pl-4 space-y-0.5">
                    {csvPreviewErrors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {csvPreviewRows && csvPreviewRows.length > 0 && csvPreviewErrors.length === 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Preview (first {csvPreviewRows.length} rows):</span>
                </div>
                <div className="overflow-x-auto rounded border">
                  <table className="text-xs w-full">
                    <thead className="bg-muted">
                      <tr>
                        {Object.keys(csvPreviewRows[0]).map((h) => (
                          <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreviewRows.map((row, i) => (
                        <tr key={i} className="border-t">
                          {Object.values(row).map((v: any, j) => (
                            <td key={j} className="px-2 py-1 whitespace-nowrap max-w-[150px] truncate">{v}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvUploadDialog(null)}>Cancel</Button>
            <Button
              onClick={handleCsvImport}
              disabled={!csvUploadFile || csvImporting || csvPreviewErrors.length > 0}
            >
              {csvImporting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</> : <><Upload className="h-4 w-4 mr-2" />Import & Replace</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </SchoolAdminLayout>
  );
}

function TemplateCard({
  template,
  sessions,
  classes,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddBlock,
  onAddBlockForDay,
  onEditBlock,
  onDeleteBlock,
  onDownloadCsv,
  onUploadCsv,
}: {
  template: WeeklySkeleton;
  sessions: Session[];
  classes: any[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddBlock: () => void;
  onAddBlockForDay: (dayNum: number) => void;
  onEditBlock: (block: SkeletonBlock) => void;
  onDeleteBlock: (blockId: number) => void;
  onDownloadCsv: () => void;
  onUploadCsv: () => void;
}) {
  const linkedSession = sessions.find((s) => s.id === template.sessionId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 cursor-pointer" onClick={onToggleExpand}>
            <CardTitle className="text-xl flex items-center gap-2">
              {template.name}
              <Badge className={template.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                {template.isActive ? "Active" : "Inactive"}
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" />
                {(() => {
                  if (template.classId) {
                    const linked = classes.find((c: any) => c.id === template.classId);
                    return linked ? (linked.title || linked.name || `Class ${linked.id}`) : template.gradeLevel;
                  }
                  return template.gradeLevel;
                })()}
              </span>
              {linkedSession && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {linkedSession.name}
                </span>
              )}
            </CardDescription>
            {template.description && <p className="text-sm text-muted-foreground mt-1">{template.description}</p>}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(template.operatingDays || []).map((day) => (
                <Badge key={day} variant="outline" className="text-xs">{day.slice(0, 3)}</Badge>
              ))}
            </div>
          </div>
          <div className="flex gap-2 items-start">
            <Button variant="ghost" size="sm" onClick={onToggleExpand}>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" size="sm" className="text-red-600" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="border-t pt-4">
          <BlockEditor
            template={template}
            onAddBlock={onAddBlock}
            onAddBlockForDay={onAddBlockForDay}
            onEditBlock={onEditBlock}
            onDeleteBlock={onDeleteBlock}
            onDownloadCsv={onDownloadCsv}
            onUploadCsv={onUploadCsv}
          />
        </CardContent>
      )}
    </Card>
  );
}

function BlockEditor({
  template,
  onAddBlock,
  onAddBlockForDay,
  onEditBlock,
  onDeleteBlock,
  onDownloadCsv,
  onUploadCsv,
}: {
  template: WeeklySkeleton;
  onAddBlock: () => void;
  onAddBlockForDay: (dayNum: number) => void;
  onEditBlock: (block: SkeletonBlock) => void;
  onDeleteBlock: (blockId: number) => void;
  onDownloadCsv: () => void;
  onUploadCsv: () => void;
}) {
  const { data: blocks = [], isLoading } = useQuery<SkeletonBlock[]>({
    queryKey: ["/api/schedule-builder/skeletons", template.id, "blocks"],
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  const operatingDayNumbers = (template.operatingDays || []).map((d) => DAY_NAME_TO_NUMBER[d]).sort((a, b) => a - b);

  const blocksByDay: Record<number, SkeletonBlock[]> = {};
  operatingDayNumbers.forEach((d) => { blocksByDay[d] = []; });
  blocks.forEach((block) => {
    if (blocksByDay[block.dayOfWeek]) {
      blocksByDay[block.dayOfWeek].push(block);
    }
  });
  Object.keys(blocksByDay).forEach((key) => {
    blocksByDay[Number(key)].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.startTime.localeCompare(b.startTime);
    });
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Time Blocks</h4>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onDownloadCsv}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Download CSV
          </Button>
          <Button size="sm" variant="outline" onClick={onUploadCsv}>
            <Upload className="h-3.5 w-3.5 mr-1" />
            Upload CSV
          </Button>
          <Button size="sm" variant="outline" onClick={onAddBlock}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Block
          </Button>
        </div>
      </div>
      {operatingDayNumbers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No operating days configured.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {operatingDayNumbers.map((dayNum) => (
            <div key={dayNum} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="font-medium text-sm">{DAY_NUMBER_TO_NAME[dayNum]}</h5>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onAddBlockForDay(dayNum)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {blocksByDay[dayNum].length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No blocks</p>
              ) : (
                <div className="space-y-1.5">
                  {blocksByDay[dayNum].map((block) => (
                    <div key={block.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/50 group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge className={`text-xs ${BLOCK_TYPE_BADGE_COLORS[block.blockType] || ""}`}>{block.blockType}</Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            {block.startTime} – {block.endTime}
                          </span>
                        </div>
                        <p className="text-sm font-medium mt-0.5 truncate">{block.defaultTitle}</p>
                        {block.subjectArea && <p className="text-xs text-muted-foreground truncate">{block.subjectArea}</p>}
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onEditBlock(block)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600" onClick={() => onDeleteBlock(block.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
