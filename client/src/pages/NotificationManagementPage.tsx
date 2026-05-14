import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  Send, 
  Users, 
  Mail, 
  MessageSquare, 
  Clock, 
  Check,
  AlertCircle,
  X,
  User,
  Shield,
  MapPin,
  Plus,
  Eye,
  Phone,
  RefreshCw
} from "lucide-react";
import { NotificationTargetingPanel, defaultTargetingState, type TargetingState } from "@/components/NotificationTargetingPanel";

interface Notification {
  id: number;
  senderId: number;
  type: "email" | "in_app" | "both" | "sms" | "all";
  priority: "low" | "normal" | "high" | "urgent";
  subject: string;
  content: string;
  targetType: "individual" | "role" | "location" | "all";
  targetData: any;
  scheduledFor?: string;
  sentAt?: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  deliveryStats: any;
  createdAt: string;
  updatedAt: string;
}

/** Response row from GET /api/school-admin/notifications/tracking */
interface NotificationTrackingRow {
  id: number;
  subject: string;
  content: string;
  targetType: string;
  type: string;
  priority: string;
  sentAt: string | null;
  createdAt: string;
  stats: {
    totalRecipients: number;
    delivered: number;
    opened: number;
    openRate: number;
    email: { sent: number; total: number };
    sms: { sent: number; total: number };
  };
}

/** Accept raw GET body whether Replit/cache returns a bare array or a wrapped object. */
function extractTrackingRows(response: unknown): NotificationTrackingRow[] {
  if (Array.isArray(response)) return response as NotificationTrackingRow[];
  if (response && typeof response === "object") {
    const o = response as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as NotificationTrackingRow[];
    if (Array.isArray(o.items)) return o.items as NotificationTrackingRow[];
    if (Array.isArray(o.tracking)) return o.tracking as NotificationTrackingRow[];
    if (Array.isArray(o.notifications)) return o.notifications as NotificationTrackingRow[];
  }
  return [];
}

function mapTrackingRowToNotification(row: NotificationTrackingRow): Notification {
  const rawType = String(row.type || "both").toLowerCase();
  const type: Notification["type"] =
    rawType === "email" || rawType === "in_app" || rawType === "sms" || rawType === "both" || rawType === "all"
      ? (rawType as Notification["type"])
      : "both";

  const rawPriority = String(row.priority || "normal").toLowerCase();
  const priority: Notification["priority"] =
    rawPriority === "low" || rawPriority === "normal" || rawPriority === "high" || rawPriority === "urgent"
      ? (rawPriority as Notification["priority"])
      : "normal";

  const tt = String(row.targetType || "all").toLowerCase();
  const targetType: Notification["targetType"] =
    tt === "individual" || tt === "role" || tt === "location" || tt === "all"
      ? (tt as Notification["targetType"])
      : "all";

  const status: Notification["status"] = row.sentAt ? "sent" : "scheduled";

  return {
    id: row.id,
    senderId: 0,
    type,
    priority,
    subject: row.subject,
    content: row.content,
    targetType,
    targetData: {},
    sentAt: row.sentAt || undefined,
    status,
    deliveryStats: { totalRecipients: row.stats?.totalRecipients ?? 0 },
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
  };
}

export default function NotificationManagementPage() {
  const [isComposeDialogOpen, setIsComposeDialogOpen] = useState(false);
  const [editingNotification, setEditingNotification] = useState<Notification | null>(null);
  const [selectedNotificationId, setSelectedNotificationId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const TRACKING_QUERY_KEY = ["/api/school-admin/notifications/tracking"] as const;

  // School-scoped sent notifications (matches Notification Tracking API contract)
  const { data: notificationsRaw, isLoading } = useQuery({
    queryKey: TRACKING_QUERY_KEY,
    select: (data: unknown) => {
      try {
        const rows = extractTrackingRows(data);
        return rows.map((row) => mapTrackingRowToNotification(row));
      } catch {
        return [];
      }
    },
  });

  const notifications = Array.isArray(notificationsRaw) ? notificationsRaw : [];

  const selectedNotification = useMemo(
    () => notifications.find((n) => n.id === selectedNotificationId) ?? null,
    [notifications, selectedNotificationId],
  );

  // Fetch Twilio status for trial warning
  const { data: twilioStatus } = useQuery<{ configured: boolean; trial: boolean; accountType?: string }>({
    queryKey: ['/api/notifications/twilio-status'],
  });

  // Resend notification mutation
  const resendMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const response = await apiRequest("POST", `/api/notifications/${notificationId}/resend`);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRACKING_QUERY_KEY });
      setSelectedNotificationId(null);
      toast({
        title: "Success",
        description: "Notification resent successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to resend notification",
        variant: "destructive",
      });
    },
  });

  // Send combined (multi-source) notification mutation
  const sendCombinedMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/notifications/send-combined", data);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: TRACKING_QUERY_KEY });
      setIsComposeDialogOpen(false);
      toast({
        title: "Success",
        description: `Notification sent to ${data.recipientCount ?? 0} recipient${(data.recipientCount ?? 0) !== 1 ? "s" : ""}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send notification",
        variant: "destructive",
      });
    },
  });

  // Update draft notification mutation
  const updateDraftMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest("PUT", `/api/notifications/${id}`, data);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: TRACKING_QUERY_KEY });
      setIsComposeDialogOpen(false);
      setEditingNotification(null);
      toast({
        title: "Success",
        description: data.status === "sent" ? "Draft sent successfully" : "Draft saved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update draft",
        variant: "destructive",
      });
    },
  });

  // Delete draft notification mutation
  const deleteDraftMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/notifications/${id}`);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRACKING_QUERY_KEY });
      setIsComposeDialogOpen(false);
      setEditingNotification(null);
      toast({
        title: "Success",
        description: "Draft deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete draft",
        variant: "destructive",
      });
    },
  });

  // Handle clicking on a notification to view or edit it
  const handleNotificationClick = (notification: Notification) => {
    if (notification.status === "draft") {
      setEditingNotification(notification);
      setIsComposeDialogOpen(true);
    } else {
      setSelectedNotificationId(notification.id);
    }
  };

  // Handle closing the compose dialog
  const handleCloseDialog = (open: boolean) => {
    setIsComposeDialogOpen(open);
    if (!open) {
      setEditingNotification(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sent":
        return <Check className="h-4 w-4 text-green-500" />;
      case "failed":
        return <X className="h-4 w-4 text-red-500" />;
      case "sending":
        return <Clock className="h-4 w-4 text-blue-500" />;
      case "scheduled":
        return <Clock className="h-4 w-4 text-orange-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
      low: "secondary",
      normal: "default",
      high: "destructive",
      urgent: "destructive",
    };

    return (
      <Badge variant={variants[priority] || "default"}>
        {priority}
      </Badge>
    );
  };

  const getTargetTypeIcon = (targetType: string) => {
    switch (targetType) {
      case "individual":
        return <User className="h-4 w-4" />;
      case "role":
        return <Shield className="h-4 w-4" />;
      case "location":
        return <MapPin className="h-4 w-4" />;
      case "all":
        return <Users className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg">Loading notifications...</div>
    </div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Twilio Trial Warning Banner */}
      {twilioStatus?.configured && twilioStatus?.trial && (
        <Alert className="border-yellow-400 bg-yellow-50 text-yellow-800">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription>
            <strong>Twilio Trial Account:</strong> Your Twilio account is in trial mode. SMS messages can only be delivered to verified phone numbers. To send to any number, upgrade your Twilio account at <a href="https://www.twilio.com/console" target="_blank" rel="noopener noreferrer" className="underline font-medium">twilio.com/console</a>.
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notification Center</h1>
          <p className="text-muted-foreground">
            Send targeted notifications to individuals, groups, or location-specific staff and students
          </p>
        </div>
        <Dialog open={isComposeDialogOpen} onOpenChange={handleCloseDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Compose Notification
            </Button>
          </DialogTrigger>
          <NotificationComposeDialog
            editingNotification={editingNotification}
            onSendCombined={sendCombinedMutation.mutate}
            onUpdateDraft={(data) => editingNotification && updateDraftMutation.mutate({ id: editingNotification.id, data })}
            onDeleteDraft={() => editingNotification && deleteDraftMutation.mutate(editingNotification.id)}
            isLoading={
              sendCombinedMutation.isPending ||
              updateDraftMutation.isPending ||
              deleteDraftMutation.isPending
            }
          />
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {notifications.filter((n: Notification) => n.status === "sent").length}
            </div>
            <p className="text-xs text-muted-foreground">
              successful notifications
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {notifications.filter((n: Notification) => {
                if (!n.sentAt) return false;
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return new Date(n.sentAt) > weekAgo;
              }).length}
            </div>
            <p className="text-xs text-muted-foreground">
              sent in last 7 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {notifications.filter((n: Notification) => n.status === "failed").length}
            </div>
            <p className="text-xs text-muted-foreground">
              delivery failures
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {notifications.filter((n: Notification) => n.status === "scheduled").length}
            </div>
            <p className="text-xs text-muted-foreground">
              pending delivery
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Notifications Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Notifications</CardTitle>
          <CardDescription>
            View and track all sent notifications and their delivery status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Recipients</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="flex flex-col items-center space-y-2">
                      <MessageSquare className="h-8 w-8 text-muted-foreground" />
                      <div className="text-muted-foreground">No notifications sent yet</div>
                      <Button
                        variant="outline"
                        onClick={() => setIsComposeDialogOpen(true)}
                      >
                        Send your first notification
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                notifications.map((notification: Notification) => (
                  <TableRow 
                    key={notification.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <TableCell>
                      <div className="font-medium">
                        {notification.subject}
                        {notification.status === "draft" && (
                          <Badge variant="outline" className="ml-2 text-xs">Click to edit</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground truncate max-w-xs">
                        {notification.content}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getTargetTypeIcon(notification.targetType)}
                        <span className="capitalize">{notification.targetType}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        {notification.type === "email" && <Mail className="h-4 w-4" />}
                        {notification.type === "in_app" && <MessageSquare className="h-4 w-4" />}
                        {notification.type === "sms" && <Phone className="h-4 w-4" />}
                        {notification.type === "both" && (
                          <>
                            <Mail className="h-4 w-4" />
                            <MessageSquare className="h-4 w-4" />
                          </>
                        )}
                        {notification.type === "all" && (
                          <>
                            <Mail className="h-4 w-4" />
                            <MessageSquare className="h-4 w-4" />
                            <Phone className="h-4 w-4" />
                          </>
                        )}
                        <span className="capitalize">{notification.type}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getPriorityBadge(notification.priority)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(notification.status)}
                        <span className="capitalize">{notification.status}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {notification.sentAt ? (
                        <div className="text-sm">
                          {new Date(notification.sentAt).toLocaleDateString()}
                          <div className="text-muted-foreground">
                            {new Date(notification.sentAt).toLocaleTimeString()}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not sent</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {notification.deliveryStats?.totalRecipients || 0}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Notification Detail Dialog */}
      <Dialog open={!!selectedNotificationId} onOpenChange={(open) => !open && setSelectedNotificationId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Notification Details
            </DialogTitle>
            <DialogDescription>
              View the full notification content and resend if needed
            </DialogDescription>
          </DialogHeader>
          
          {isLoading && selectedNotificationId ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : selectedNotification ? (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Subject</Label>
                <p className="text-lg font-medium">{selectedNotification.subject}</p>
              </div>
              
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Message</Label>
                <div className="mt-1 p-4 bg-muted rounded-lg whitespace-pre-wrap">
                  {selectedNotification.content}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Delivery Method</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {selectedNotification.type === "email" && <Mail className="h-4 w-4" />}
                    {selectedNotification.type === "in_app" && <MessageSquare className="h-4 w-4" />}
                    {selectedNotification.type === "sms" && <Phone className="h-4 w-4" />}
                    {selectedNotification.type === "both" && (
                      <>
                        <Mail className="h-4 w-4" />
                        <MessageSquare className="h-4 w-4" />
                      </>
                    )}
                    {selectedNotification.type === "all" && (
                      <>
                        <Mail className="h-4 w-4" />
                        <MessageSquare className="h-4 w-4" />
                        <Phone className="h-4 w-4" />
                      </>
                    )}
                    <span className="capitalize">{selectedNotification.type?.replace("_", " ")}</span>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Priority</Label>
                  <p className="capitalize mt-1">{selectedNotification.priority}</p>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Target</Label>
                  <p className="capitalize mt-1">{selectedNotification.targetType}</p>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Sent</Label>
                  <p className="mt-1">
                    {selectedNotification.sentAt 
                      ? new Date(selectedNotification.sentAt).toLocaleString()
                      : "Not sent yet"}
                  </p>
                </div>
              </div>
              
              {selectedNotification.deliveryStats && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Delivery Stats</Label>
                  <div className="flex items-center gap-4 mt-1">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedNotification.deliveryStats.totalRecipients || 0} recipients</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : selectedNotificationId ? (
            <div className="py-8 text-center text-muted-foreground">
              This notification is no longer in the recent list. Try refreshing the page.
            </div>
          ) : null}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedNotificationId(null)}>
              Close
            </Button>
            <Button 
              onClick={() => selectedNotificationId && resendMutation.mutate(selectedNotificationId)}
              disabled={resendMutation.isPending || selectedNotification?.status !== "sent"}
              title={selectedNotification?.status !== "sent" ? "Can only resend notifications that have been sent" : undefined}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${resendMutation.isPending ? "animate-spin" : ""}`} />
              {resendMutation.isPending ? "Resending..." : "Resend Notification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Notification Compose Dialog Component
function NotificationComposeDialog({
  editingNotification,
  onSendCombined,
  onUpdateDraft,
  onDeleteDraft,
  isLoading,
}: {
  editingNotification: Notification | null;
  onSendCombined: (data: any) => void;
  onUpdateDraft: (data: any) => void;
  onDeleteDraft: () => void;
  isLoading: boolean;
}) {
  
  const { toast } = useToast();
  const isEditMode = !!editingNotification;

  const buildInitialTargeting = (): TargetingState => {
    if (!editingNotification) return defaultTargetingState();
    const targetData = editingNotification.targetData as {
      userIds?: number[];
      roles?: string[];
      locationIds?: number[];
      classIds?: number[];
    } | null;
    const isAll = editingNotification.targetType === "all";
    return {
      includeAll: isAll,
      selectedUsers: (targetData?.userIds || []).map(id => ({ id, email: `User #${id}`, displayName: `User #${id}` })),
      selectedRoles: targetData?.roles || [],
      selectedLocations: targetData?.locationIds || [],
      selectedClasses: targetData?.classIds || [],
      deliveryType: editingNotification.type || "both",
      priority: editingNotification.priority || "normal",
    };
  };

  const [targeting, setTargeting] = useState<TargetingState>(buildInitialTargeting);
  const [subject, setSubject] = useState(editingNotification?.subject || "");
  const [content, setContent] = useState(editingNotification?.content || "");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Sync state when editingNotification changes
  useEffect(() => {
    setTargeting(buildInitialTargeting());
    setSubject(editingNotification?.subject || "");
    setContent(editingNotification?.content || "");
  }, [editingNotification]);

  // Debounced recipient count preview
  useEffect(() => {
    const { includeAll, selectedUsers, selectedRoles, selectedLocations, selectedClasses } = targeting;
    const hasSelection = includeAll || selectedUsers.length > 0 || selectedRoles.length > 0 || selectedLocations.length > 0 || selectedClasses.length > 0;
    if (!hasSelection) {
      setPreviewCount(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsPreviewLoading(true);
      try {
        const response = await apiRequest("POST", "/api/notifications/preview-recipients", {
          includeAll,
          userIds: selectedUsers.map(u => u.id),
          roles: selectedRoles,
          locationIds: selectedLocations,
          classIds: selectedClasses,
        });
        if (response.ok) {
          const data = await response.json();
          setPreviewCount(data.recipientCount ?? null);
        }
      } catch {
        setPreviewCount(null);
      } finally {
        setIsPreviewLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [targeting]);

  const buildCombinedPayload = () => {
    const { includeAll, selectedUsers, selectedRoles, selectedLocations, selectedClasses, deliveryType, priority: prio } = targeting;
    return {
      subject,
      content,
      type: deliveryType,
      priority: prio,
      includeAll,
      userIds: selectedUsers.map(u => u.id),
      roles: selectedRoles,
      locationIds: selectedLocations,
      classIds: selectedClasses,
    };
  };

  const handleSubmit = (sendNow: boolean = false) => {
    const { includeAll, selectedUsers, selectedRoles, selectedLocations, selectedClasses } = targeting;

    if (isEditMode && !sendNow) {
      // Save Draft: preserve stored targetType semantics, update text/delivery fields only
      onUpdateDraft({
        subject,
        content,
        type: targeting.deliveryType,
        priority: targeting.priority,
        sendNow: false,
      });
      return;
    }

    // Validate at least one targeting source is selected when sending
    if (!includeAll && selectedUsers.length === 0 && selectedRoles.length === 0 && selectedLocations.length === 0 && selectedClasses.length === 0) {
      toast({ title: "No recipients selected", description: "Please select at least one targeting group or choose Everyone.", variant: "destructive" });
      return;
    }

    const payload = buildCombinedPayload();

    if (isEditMode && sendNow) {
      // Send Now for drafts: use the combined endpoint for correct multi-source resolution
      onSendCombined(payload);
      return;
    }

    onSendCombined(payload);
  };

  return (
    <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(true); }}>
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Draft Notification" : "Compose Notification"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Edit your draft notification and send when ready"
              : "Send targeted notifications to specific individuals, roles, or locations"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="Important announcement..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="content">Message</Label>
              <Textarea
                id="content"
                placeholder="Enter your message here..."
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Schedule For (Optional)</Label>
              <Input type="datetime-local" style={{ fontSize: "16px" }} />
            </div>
          </div>

          <NotificationTargetingPanel value={targeting} onChange={setTargeting} />

          {/* Recipient count preview */}
          {(previewCount !== null || isPreviewLoading) && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-muted text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              {isPreviewLoading ? (
                <span className="text-muted-foreground">Calculating recipients...</span>
              ) : (
                <span>
                  <span className="font-medium">{previewCount}</span> unique recipient{previewCount !== 1 ? "s" : ""} will receive this notification
                </span>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          {isEditMode ? (
            <>
              <Button 
                type="button" 
                variant="destructive" 
                onClick={onDeleteDraft}
                disabled={isLoading}
              >
                Delete Draft
              </Button>
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => handleSubmit(false)}
                  disabled={isLoading}
                >
                  {isLoading ? "Saving..." : "Save Draft"}
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Sending..." : "Send Now"}
                </Button>
              </div>
            </>
          ) : (
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Sending..." : "Send Notification"}
            </Button>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}