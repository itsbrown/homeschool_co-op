import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatClassSchedule } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { 
  Send, 
  Users, 
  MapPin, 
  Mail, 
  MessageSquare, 
  Clock, 
  Check,
  AlertCircle,
  X,
  User,
  Building2,
  Shield,
  Plus
} from "lucide-react";
import { UserLookup, type UserResult } from "@/components/ui/user-lookup";

interface Notification {
  id: number;
  senderId: number;
  type: "email" | "in_app" | "both";
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

interface Location {
  id: number;
  name: string;
  code: string;
}

interface ScheduleVariant {
  id: string;
  name: string;
  days: string[];
  startTime: string;
  endTime: string;
  price: number;
}

interface ClassInfo {
  id: number;
  title: string;
  schedule?: string | { variants: ScheduleVariant[] };
  enrollmentCount?: number;
}

export default function NotificationManagementPage() {
  const [isComposeDialogOpen, setIsComposeDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState("individual");
  const [editingNotification, setEditingNotification] = useState<Notification | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all sent notifications (admin view)
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications?view=sent"],
  });

  // Fetch locations for targeting
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  // Fetch classes for class-specific notifications (use school-admin endpoint)
  // API returns paginated response { items: ClassInfo[], total, page, limit, totalPages }
  const { data: schoolClassesData } = useQuery<{ items: ClassInfo[], total: number }>({
    queryKey: ["/api/school-admin/classes"],
  });
  const classes = schoolClassesData?.items || [];

  // Send individual notification mutation
  const sendIndividualMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/notifications/send-individual", data);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications?view=sent"] });
      setIsComposeDialogOpen(false);
      toast({
        title: "Success",
        description: "Notification sent successfully",
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

  // Send role-based notification mutation
  const sendRoleMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/notifications/send-by-role", data);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications?view=sent"] });
      setIsComposeDialogOpen(false);
      toast({
        title: "Success",
        description: "Notification sent successfully",
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

  // Send location-based notification mutation
  const sendLocationMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/notifications/send-by-location", data);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications?view=sent"] });
      setIsComposeDialogOpen(false);
      toast({
        title: "Success",
        description: "Notification sent successfully",
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

  // Send broadcast notification mutation
  const sendBroadcastMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/notifications/send-all", data);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications?view=sent"] });
      setIsComposeDialogOpen(false);
      toast({
        title: "Success",
        description: "Notification sent successfully",
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

  // Send class-specific notification mutation
  const sendClassMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/notifications/send-by-class", data);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications?view=sent"] });
      setIsComposeDialogOpen(false);
      toast({
        title: "Success",
        description: `Notification sent to ${data.recipientCount || 0} parents`,
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
      queryClient.invalidateQueries({ queryKey: ["/api/notifications?view=sent"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/notifications?view=sent"] });
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

  // Handle clicking on a draft notification to edit it
  const handleNotificationClick = (notification: Notification) => {
    if (notification.status === "draft") {
      setEditingNotification(notification);
      setIsComposeDialogOpen(true);
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
            locations={locations}
            classes={classes}
            editingNotification={editingNotification}
            onSendIndividual={sendIndividualMutation.mutate}
            onSendRole={sendRoleMutation.mutate}
            onSendLocation={sendLocationMutation.mutate}
            onSendBroadcast={sendBroadcastMutation.mutate}
            onSendClass={sendClassMutation.mutate}
            onUpdateDraft={(data) => editingNotification && updateDraftMutation.mutate({ id: editingNotification.id, data })}
            onDeleteDraft={() => editingNotification && deleteDraftMutation.mutate(editingNotification.id)}
            isLoading={
              sendIndividualMutation.isPending ||
              sendRoleMutation.isPending ||
              sendLocationMutation.isPending ||
              sendBroadcastMutation.isPending ||
              sendClassMutation.isPending ||
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
                    className={notification.status === "draft" ? "cursor-pointer hover:bg-muted/50" : ""}
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
                        {notification.type === "both" && (
                          <>
                            <Mail className="h-4 w-4" />
                            <MessageSquare className="h-4 w-4" />
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
    </div>
  );
}

// Notification Compose Dialog Component
function NotificationComposeDialog({
  locations,
  classes,
  editingNotification,
  onSendIndividual,
  onSendRole,
  onSendLocation,
  onSendBroadcast,
  onSendClass,
  onUpdateDraft,
  onDeleteDraft,
  isLoading,
}: {
  locations: Location[];
  classes: ClassInfo[];
  editingNotification: Notification | null;
  onSendIndividual: (data: any) => void;
  onSendRole: (data: any) => void;
  onSendLocation: (data: any) => void;
  onSendBroadcast: (data: any) => void;
  onSendClass: (data: any) => void;
  onUpdateDraft: (data: any) => void;
  onDeleteDraft: () => void;
  isLoading: boolean;
}) {
  type TargetType = "individual" | "role" | "location" | "all" | "class";
  
  const { toast } = useToast();
  const isEditMode = !!editingNotification;
  
  // Parse targetData from editing notification
  const existingTargetData = editingNotification?.targetData as {
    userIds?: number[];
    roles?: string[];
    locationIds?: number[];
    classIds?: number[];
  } | null;
  
  const [targetType, setTargetType] = useState<TargetType>(
    (editingNotification?.targetType as TargetType) || "individual"
  );
  // Hydrate selections from existing targetData when editing
  const [selectedLocations, setSelectedLocations] = useState<number[]>(
    existingTargetData?.locationIds || []
  );
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    existingTargetData?.roles || []
  );
  const [selectedUsers, setSelectedUsers] = useState<UserResult[]>(
    // Convert userIds to UserResult objects for editing - will show IDs only
    (existingTargetData?.userIds || []).map(id => ({ id, email: `User #${id}`, displayName: `User #${id}` }))
  );
  const [selectedClasses, setSelectedClasses] = useState<number[]>(
    existingTargetData?.classIds || []
  );
  const [subject, setSubject] = useState(editingNotification?.subject || "");
  const [content, setContent] = useState(editingNotification?.content || "");
  const [type, setType] = useState(editingNotification?.type || "both");
  const [priority, setPriority] = useState(editingNotification?.priority || "normal");
  
  // Get user role for default delivery method
  const userRole = localStorage.getItem('activeRole') || 'parent';
  const defaultDeliveryMethod = userRole === 'schoolAdmin' || userRole === 'platform_admin' ? 'in_app' : 'both';
  
  // Sync state when editingNotification changes (for when dialog opens with a draft)
  useEffect(() => {
    if (editingNotification) {
      const targetData = editingNotification.targetData as {
        userIds?: number[];
        roles?: string[];
        locationIds?: number[];
        classIds?: number[];
      } | null;
      
      setSubject(editingNotification.subject || "");
      setContent(editingNotification.content || "");
      setType(editingNotification.type || "both");
      setPriority(editingNotification.priority || "normal");
      setTargetType((editingNotification.targetType as TargetType) || "individual");
      setSelectedLocations(targetData?.locationIds || []);
      setSelectedRoles(targetData?.roles || []);
      setSelectedUsers(
        (targetData?.userIds || []).map(id => ({ id, email: `User #${id}`, displayName: `User #${id}` }))
      );
      setSelectedClasses(targetData?.classIds || []);
    } else {
      // Reset to defaults for new notification
      setSubject("");
      setContent("");
      setType("both");
      setPriority("normal");
      setTargetType("individual");
      setSelectedLocations([]);
      setSelectedRoles([]);
      setSelectedUsers([]);
      setSelectedClasses([]);
    }
  }, [editingNotification]);
  
  // Reset selections when changing target type
  const handleTargetTypeChange = (newType: string) => {
    setTargetType(newType as TargetType);
    setSelectedLocations([]);
    setSelectedRoles([]);
    setSelectedUsers([]);
    setSelectedClasses([]);
  };

  // Build targetData based on current target type and selections
  const buildTargetData = () => {
    switch (targetType) {
      case "individual":
        return { userIds: selectedUsers.map(u => u.id) };
      case "role":
        return { 
          roles: selectedRoles, 
          locationIds: selectedLocations.length > 0 ? selectedLocations : undefined 
        };
      case "location":
        return { 
          locationIds: selectedLocations, 
          roles: selectedRoles.length > 0 ? selectedRoles : undefined 
        };
      case "class":
        return { classIds: selectedClasses };
      case "all":
      default:
        return {};
    }
  };

  const handleSubmit = (sendNow: boolean = false) => {
    const baseData = {
      senderId: 1,
      subject,
      content,
      type,
      priority,
      targetType,
    };

    // If editing a draft, use update mutation with targetData
    if (isEditMode) {
      const targetData = buildTargetData();
      
      // Validate recipients if sending now
      if (sendNow) {
        if (targetType === "individual" && selectedUsers.length === 0) {
          toast({
            title: "No recipients selected",
            description: "Please select at least one user to send the notification to.",
            variant: "destructive",
          });
          return;
        }
        if (targetType === "class" && selectedClasses.length === 0) {
          toast({
            title: "No classes selected",
            description: "Please select at least one class to send the notification to.",
            variant: "destructive",
          });
          return;
        }
      }
      
      onUpdateDraft({ ...baseData, targetData, sendNow });
      return;
    }

    // For new notifications, use the appropriate send mutation
    switch (targetType) {
      case "individual":
        const userIds = selectedUsers.map(u => u.id);
        if (userIds.length === 0) {
          toast({
            title: "No recipients selected",
            description: "Please select at least one user to send the notification to.",
            variant: "destructive",
          });
          return;
        }
        onSendIndividual({ ...baseData, userIds });
        break;

      case "role":
        onSendRole({
          ...baseData,
          roles: selectedRoles,
          locationIds: selectedLocations.length > 0 ? selectedLocations : undefined,
        });
        break;

      case "location":
        onSendLocation({
          ...baseData,
          locationIds: selectedLocations,
          includeRoles: selectedRoles.length > 0 ? selectedRoles : undefined,
        });
        break;

      case "all":
        onSendBroadcast(baseData);
        break;

      case "class":
        if (selectedClasses.length === 0) {
          toast({
            title: "No classes selected",
            description: "Please select at least one class to notify parents.",
            variant: "destructive",
          });
          return;
        }
        onSendClass({ ...baseData, classIds: selectedClasses });
        break;
    }
  };

  const roles = [
    "teacher",
    "administrator", 
    "staff",
    "counselor",
    "librarian",
    "substitute",
    "volunteer"
  ];

  return (
    <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
      <form onSubmit={(e) => {
        e.preventDefault();
        handleSubmit(true); // Send now
      }}>
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Draft Notification" : "Compose Notification"}</DialogTitle>
          <DialogDescription>
            {isEditMode 
              ? "Edit your draft notification and send when ready" 
              : "Send targeted notifications to specific individuals, roles, or locations"}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          {/* Basic Information */}
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                name="subject"
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
                name="content"
                placeholder="Enter your message here..."
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Delivery Method</Label>
                <Select value={type} onValueChange={(v) => setType(v as "email" | "in_app" | "both")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_app">In-App Only</SelectItem>
                    <SelectItem value="email">Email Only</SelectItem>
                    <SelectItem value="sms">SMS Only</SelectItem>
                    <SelectItem value="both">Email + In-App</SelectItem>
                    <SelectItem value="all">All (Email + SMS + In-App)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as "low" | "normal" | "high" | "urgent")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="scheduledFor">Schedule For (Optional)</Label>
                <Input
                  id="scheduledFor"
                  name="scheduledFor"
                  type="datetime-local"
                />
              </div>
            </div>
          </div>

          {/* Target Selection */}
          <div className="grid gap-4">
            <Label>Target Recipients</Label>
            <Tabs value={targetType} onValueChange={handleTargetTypeChange}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="individual">Individual</TabsTrigger>
                <TabsTrigger value="role">By Role</TabsTrigger>
                <TabsTrigger value="location">By Location</TabsTrigger>
                <TabsTrigger value="class">By Class</TabsTrigger>
                <TabsTrigger value="all">Everyone</TabsTrigger>
              </TabsList>

              <TabsContent value="individual" className="space-y-4">
                <div className="grid gap-2">
                  <Label>Select Recipients</Label>
                  <UserLookup
                    value={selectedUsers}
                    onChange={setSelectedUsers}
                    placeholder="Search for users by name or email..."
                    multiSelect={true}
                    modalTitle="Select Notification Recipients"
                  />
                  {selectedUsers.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {selectedUsers.length} recipient{selectedUsers.length !== 1 ? 's' : ''} selected
                    </p>
                  )}
                  {selectedUsers.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Search and select specific users to notify
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="role" className="space-y-4">
                <div className="grid gap-2">
                  <Label>Select Roles</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {roles.map((role) => (
                      <div key={role} className="flex items-center space-x-2">
                        <Checkbox
                          id={`role-${role}`}
                          checked={selectedRoles.includes(role)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedRoles([...selectedRoles, role]);
                            } else {
                              setSelectedRoles(selectedRoles.filter(r => r !== role));
                            }
                          }}
                        />
                        <Label htmlFor={`role-${role}`} className="capitalize">
                          {role}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Filter by Locations (Optional)</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {locations.map((location) => (
                      <div key={location.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`role-location-${location.id}`}
                          checked={selectedLocations.includes(location.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedLocations([...selectedLocations, location.id]);
                            } else {
                              setSelectedLocations(selectedLocations.filter(l => l !== location.id));
                            }
                          }}
                        />
                        <Label htmlFor={`role-location-${location.id}`}>
                          {location.name} ({location.code})
                        </Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Leave blank to notify selected roles at all locations
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="location" className="space-y-4">
                <div className="grid gap-2">
                  <Label>Select Locations</Label>
                  {locations.length === 0 ? (
                    <div className="p-4 bg-muted rounded-lg border border-dashed">
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <MapPin className="h-5 w-5" />
                        <div>
                          <p className="font-medium">No locations configured</p>
                          <p className="text-sm">
                            Add locations in School Settings to enable location-based notifications.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {locations.map((location) => (
                        <div key={location.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`location-${location.id}`}
                            checked={selectedLocations.includes(location.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedLocations([...selectedLocations, location.id]);
                              } else {
                                setSelectedLocations(selectedLocations.filter(l => l !== location.id));
                              }
                            }}
                          />
                          <Label htmlFor={`location-${location.id}`}>
                            {location.name} ({location.code})
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label>Filter by Roles (Optional)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {roles.map((role) => (
                      <div key={role} className="flex items-center space-x-2">
                        <Checkbox
                          id={`location-role-${role}`}
                          checked={selectedRoles.includes(role)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedRoles([...selectedRoles, role]);
                            } else {
                              setSelectedRoles(selectedRoles.filter(r => r !== role));
                            }
                          }}
                        />
                        <Label htmlFor={`location-role-${role}`} className="capitalize">
                          {role}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Leave blank to notify everyone at selected locations
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="class" className="space-y-4">
                <div className="grid gap-2">
                  <Label>Select Classes</Label>
                  <p className="text-sm text-muted-foreground">
                    Notify parents of students enrolled in selected classes
                  </p>
                  {classes.length === 0 ? (
                    <div className="p-4 bg-muted rounded-lg border border-dashed">
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <Building2 className="h-5 w-5" />
                        <div>
                          <p className="font-medium">No classes available</p>
                          <p className="text-sm">
                            Create classes in Class Management to enable class-based notifications.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border rounded-md p-2">
                      {classes.map((cls) => (
                        <div key={cls.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`class-${cls.id}`}
                            checked={selectedClasses.includes(cls.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedClasses([...selectedClasses, cls.id]);
                              } else {
                                setSelectedClasses(selectedClasses.filter(c => c !== cls.id));
                              }
                            }}
                          />
                          <Label htmlFor={`class-${cls.id}`} className="flex-1">
                            <span className="font-medium">{cls.title}</span>
                            {formatClassSchedule(cls.schedule) && (
                              <span className="text-sm text-muted-foreground ml-2">
                                ({formatClassSchedule(cls.schedule)})
                              </span>
                            )}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedClasses.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {selectedClasses.length} class{selectedClasses.length !== 1 ? 'es' : ''} selected
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="all" className="space-y-4">
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-5 w-5 text-orange-600" />
                    <div>
                      <h4 className="font-medium text-orange-800">Broadcast to Everyone</h4>
                      <p className="text-sm text-orange-700">
                        This will send the notification to all staff and students across all locations.
                        Use this feature carefully for important announcements only.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
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