import { useState } from "react";
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

export default function NotificationManagementPage() {
  const [isComposeDialogOpen, setIsComposeDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState("individual");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch notifications
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  // Fetch locations for targeting
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

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
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
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
        <Dialog open={isComposeDialogOpen} onOpenChange={setIsComposeDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Compose Notification
            </Button>
          </DialogTrigger>
          <NotificationComposeDialog
            locations={locations}
            onSendIndividual={sendIndividualMutation.mutate}
            onSendRole={sendRoleMutation.mutate}
            onSendLocation={sendLocationMutation.mutate}
            onSendBroadcast={sendBroadcastMutation.mutate}
            isLoading={
              sendIndividualMutation.isPending ||
              sendRoleMutation.isPending ||
              sendLocationMutation.isPending ||
              sendBroadcastMutation.isPending
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
                  <TableRow key={notification.id}>
                    <TableCell>
                      <div className="font-medium">{notification.subject}</div>
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
  onSendIndividual,
  onSendRole,
  onSendLocation,
  onSendBroadcast,
  isLoading,
}: {
  locations: Location[];
  onSendIndividual: (data: any) => void;
  onSendRole: (data: any) => void;
  onSendLocation: (data: any) => void;
  onSendBroadcast: (data: any) => void;
  isLoading: boolean;
}) {
  const [targetType, setTargetType] = useState("individual");
  const [selectedLocations, setSelectedLocations] = useState<number[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  
  // Get user role for default delivery method
  const userRole = localStorage.getItem('activeRole') || 'parent';
  const defaultDeliveryMethod = userRole === 'schoolAdmin' || userRole === 'platform_admin' ? 'in_app' : 'both';
  
  // Reset selections when changing target type
  const handleTargetTypeChange = (newType: string) => {
    setTargetType(newType);
    setSelectedLocations([]);
    setSelectedRoles([]);
  };

  const handleSubmit = (formData: FormData) => {
    const baseData = {
      senderId: 1, // Current user ID
      subject: formData.get("subject") as string,
      content: formData.get("content") as string,
      type: formData.get("type") as string,
      priority: formData.get("priority") as string,
      scheduledFor: formData.get("scheduledFor") as string || undefined,
    };

    switch (targetType) {
      case "individual":
        const userIds = (formData.get("userIds") as string)
          .split(",")
          .map(id => parseInt(id.trim()))
          .filter(id => !isNaN(id));
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
        const formData = new FormData(e.currentTarget);
        handleSubmit(formData);
      }}>
        <DialogHeader>
          <DialogTitle>Compose Notification</DialogTitle>
          <DialogDescription>
            Send targeted notifications to specific individuals, roles, or locations
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
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Delivery Method</Label>
                <Select name="type" defaultValue={defaultDeliveryMethod}>
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
                <Select name="priority" defaultValue="normal">
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
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="individual">Individual</TabsTrigger>
                <TabsTrigger value="role">By Role</TabsTrigger>
                <TabsTrigger value="location">By Location</TabsTrigger>
                <TabsTrigger value="all">Everyone</TabsTrigger>
              </TabsList>

              <TabsContent value="individual" className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="userIds">User IDs (comma-separated)</Label>
                  <Input
                    id="userIds"
                    name="userIds"
                    placeholder="1, 2, 3, 4"
                    required={targetType === "individual"}
                  />
                  <p className="text-sm text-muted-foreground">
                    Enter the user IDs of specific people to notify
                  </p>
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

        <DialogFooter>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Sending..." : "Send Notification"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}