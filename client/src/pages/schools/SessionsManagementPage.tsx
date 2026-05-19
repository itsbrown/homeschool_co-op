import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { formatFetchErrorMessage } from "@/lib/formatFetchError";
import { safeJsonParse } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit, Trash2, Calendar, Clock, Users, DollarSign } from "lucide-react";
import type { Session } from "@shared/schema";

const STATUS_COLORS: Record<string, string> = {
  upcoming: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-800",
  cancelled: "bg-red-100 text-red-800",
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface SessionFormData {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  status: string;
  enrollmentOpen: boolean;
  halfDayPrice: string;
  fullDayPrice: string;
  halfDayStartTime: string;
  halfDayEndTime: string;
  fullDayStartTime: string;
  fullDayEndTime: string;
  halfDayDays: string[];
  fullDayDays: string[];
  halfDayCapacity: string;
  fullDayCapacity: string;
  sortOrder: string;
}

const emptyForm: SessionFormData = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  status: "upcoming",
  enrollmentOpen: false,
  halfDayPrice: "",
  fullDayPrice: "",
  halfDayStartTime: "08:00",
  halfDayEndTime: "12:00",
  fullDayStartTime: "08:00",
  fullDayEndTime: "15:00",
  halfDayDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  fullDayDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  halfDayCapacity: "",
  fullDayCapacity: "",
  sortOrder: "0",
};

function sessionToForm(s: Session): SessionFormData {
  return {
    name: s.name,
    description: s.description || "",
    startDate: s.startDate,
    endDate: s.endDate,
    status: s.status,
    enrollmentOpen: s.enrollmentOpen,
    halfDayPrice: s.halfDayPrice != null ? String(s.halfDayPrice / 100) : "",
    fullDayPrice: s.fullDayPrice != null ? String(s.fullDayPrice / 100) : "",
    halfDayStartTime: s.halfDayStartTime || "08:00",
    halfDayEndTime: s.halfDayEndTime || "12:00",
    fullDayStartTime: s.fullDayStartTime || "08:00",
    fullDayEndTime: s.fullDayEndTime || "15:00",
    halfDayDays: s.halfDayDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    fullDayDays: s.fullDayDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    halfDayCapacity: s.halfDayCapacity != null ? String(s.halfDayCapacity) : "",
    fullDayCapacity: s.fullDayCapacity != null ? String(s.fullDayCapacity) : "",
    sortOrder: String(s.sortOrder),
  };
}

function formToPayload(f: SessionFormData) {
  return {
    name: f.name,
    description: f.description || null,
    startDate: f.startDate,
    endDate: f.endDate,
    status: f.status,
    enrollmentOpen: f.enrollmentOpen,
    halfDayPrice: f.halfDayPrice ? Math.round(parseFloat(f.halfDayPrice) * 100) : null,
    fullDayPrice: f.fullDayPrice ? Math.round(parseFloat(f.fullDayPrice) * 100) : null,
    halfDayStartTime: f.halfDayStartTime || null,
    halfDayEndTime: f.halfDayEndTime || null,
    fullDayStartTime: f.fullDayStartTime || null,
    fullDayEndTime: f.fullDayEndTime || null,
    halfDayDays: f.halfDayDays.length > 0 ? f.halfDayDays : null,
    fullDayDays: f.fullDayDays.length > 0 ? f.fullDayDays : null,
    halfDayCapacity: f.halfDayCapacity ? parseInt(f.halfDayCapacity) : null,
    fullDayCapacity: f.fullDayCapacity ? parseInt(f.fullDayCapacity) : null,
    sortOrder: parseInt(f.sortOrder) || 0,
  };
}

export default function SessionsManagementPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SessionFormData>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: sessionsList = [], isLoading } = useQuery<Session[]>({
    queryKey: ["/api/admin/sessions"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/sessions", data);
      if (!res.ok) {
        const body = await res.clone().json().catch(() => ({}));
        throw new Error(body.message || "Request failed");
      }
      return safeJsonParse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sessions"] });
      toast({ title: "Session created" });
      setDialogOpen(false);
    },
    onError: (err: unknown) => {
      toast({
        title: "Error creating session",
        description: formatFetchErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/sessions/${id}`, data);
      if (!res.ok) { const body = await res.clone().json().catch(() => ({})); throw new Error(body.message || "Request failed"); }
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sessions"] });
      toast({ title: "Session updated" });
      setDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error updating session", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/sessions/${id}`);
      if (!res.ok) { const body = await res.clone().json().catch(() => ({})); throw new Error(body.message || "Request failed"); }
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sessions"] });
      toast({ title: "Session deleted" });
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast({ title: "Error deleting session", description: err.message, variant: "destructive" });
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (s: Session) => {
    setEditingId(s.id);
    setForm(sessionToForm(s));
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name || !form.startDate || !form.endDate) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    const payload = formToPayload(form);
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const toggleDay = (list: string[], day: string): string[] => {
    return list.includes(day) ? list.filter((d) => d !== day) : [...list, day];
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <SchoolAdminLayout pageTitle="Enrollment Sessions">
      <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Enrollment Sessions</h1>
            <p className="text-muted-foreground mt-1">Manage enrollment periods (e.g. Winter, Spring, Fall) with schedule and pricing</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Session
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : sessionsList.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Sessions Yet</h3>
              <p className="text-muted-foreground mb-4">Create enrollment sessions so parents can register their children.</p>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Session
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {sessionsList.map((s) => (
              <Card key={s.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        {s.name}
                        <Badge className={STATUS_COLORS[s.status] || ""}>{s.status}</Badge>
                        {s.enrollmentOpen && <Badge variant="outline" className="border-green-500 text-green-700">Enrollment Open</Badge>}
                      </CardTitle>
                      {s.description && <CardDescription className="mt-1">{s.description}</CardDescription>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-600" onClick={() => setDeleteId(s.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{formatDate(s.startDate)} – {formatDate(s.endDate)}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Half Day:</span>
                        <span>{s.halfDayStartTime || "—"} – {s.halfDayEndTime || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2 pl-6">
                        <DollarSign className="h-3 w-3 text-muted-foreground" />
                        <span>{formatCents(s.halfDayPrice)}</span>
                        {s.halfDayCapacity != null && (
                          <>
                            <Users className="h-3 w-3 text-muted-foreground ml-2" />
                            <span>{s.halfDayCapacity} spots</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Full Day:</span>
                        <span>{s.fullDayStartTime || "—"} – {s.fullDayEndTime || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2 pl-6">
                        <DollarSign className="h-3 w-3 text-muted-foreground" />
                        <span>{formatCents(s.fullDayPrice)}</span>
                        {s.fullDayCapacity != null && (
                          <>
                            <Users className="h-3 w-3 text-muted-foreground ml-2" />
                            <span>{s.fullDayCapacity} spots</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Session" : "Create New Session"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update the enrollment session details." : "Set up a new enrollment period with schedule and pricing."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Session Name *</Label>
                <Input placeholder="e.g. Spring 2026" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <Textarea placeholder="Optional description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End Date *</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={form.enrollmentOpen} onCheckedChange={(v) => setForm({ ...form, enrollmentOpen: v })} />
                <Label>Enrollment Open</Label>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">Half Day Schedule</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Price ($)</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={form.halfDayPrice} onChange={(e) => setForm({ ...form, halfDayPrice: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input type="time" value={form.halfDayStartTime} onChange={(e) => setForm({ ...form, halfDayStartTime: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input type="time" value={form.halfDayEndTime} onChange={(e) => setForm({ ...form, halfDayEndTime: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Capacity</Label>
                  <Input type="number" placeholder="Max students" value={form.halfDayCapacity} onChange={(e) => setForm({ ...form, halfDayCapacity: e.target.value })} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => (
                      <Button
                        key={day}
                        type="button"
                        variant={form.halfDayDays.includes(day) ? "default" : "outline"}
                        size="sm"
                        onClick={() => setForm({ ...form, halfDayDays: toggleDay(form.halfDayDays, day) })}
                      >
                        {day.slice(0, 3)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">Full Day Schedule</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Price ($)</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={form.fullDayPrice} onChange={(e) => setForm({ ...form, fullDayPrice: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input type="time" value={form.fullDayStartTime} onChange={(e) => setForm({ ...form, fullDayStartTime: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input type="time" value={form.fullDayEndTime} onChange={(e) => setForm({ ...form, fullDayEndTime: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Capacity</Label>
                  <Input type="number" placeholder="Max students" value={form.fullDayCapacity} onChange={(e) => setForm({ ...form, fullDayCapacity: e.target.value })} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => (
                      <Button
                        key={day}
                        type="button"
                        variant={form.fullDayDays.includes(day) ? "default" : "outline"}
                        size="sm"
                        onClick={() => setForm({ ...form, fullDayDays: toggleDay(form.fullDayDays, day) })}
                      >
                        {day.slice(0, 3)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Saving..." : editingId ? "Update Session" : "Create Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>Are you sure you want to delete this session? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SchoolAdminLayout>
  );
}
