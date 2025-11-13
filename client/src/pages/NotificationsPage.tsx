import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/components/SupabaseProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { 
  Bell, 
  BellOff, 
  Check, 
  CheckCheck, 
  Trash2, 
  AlertCircle,
  Info,
  CheckCircle,
  AlertTriangle,
  Clock
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface Notification {
  id: number;
  senderId: number;
  type: string;
  priority: string;
  subject: string;
  content: string;
  targetType: string;
  createdAt: string;
  read: boolean;
  readAt?: string | null;
}

const priorityColors = {
  low: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  normal: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const typeIcons = {
  email: Bell,
  in_app: Bell,
  both: Bell,
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");

  // Fetch notifications from API (backend will use authenticated user's ID from middleware)
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['/api/notifications'],
    enabled: !!user,
  });
  
  // DEBUG: Log notifications data whenever it changes
  React.useEffect(() => {
    console.log('📧 NotificationsPage received notifications:', notifications.map(n => ({
      id: n.id,
      subject: n.subject,
      read: n.read
    })));
  }, [notifications]);

  // Mark notification as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      return apiRequest("POST", `/api/notifications/${notificationId}/read`, {});
    },
    onSuccess: () => {
      // Force refetch to update UI immediately (invalidateQueries doesn't work with staleTime: Infinity)
      queryClient.refetchQueries({ queryKey: ['/api/notifications'] });
      toast({
        title: "Marked as read",
        description: "Notification has been marked as read",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark notification as read",
        variant: "destructive",
      });
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/notifications/mark-all-read", {});
    },
    onSuccess: () => {
      // Force refetch to update UI immediately (invalidateQueries doesn't work with staleTime: Infinity)
      queryClient.refetchQueries({ queryKey: ['/api/notifications'] });
      toast({
        title: "All marked as read",
        description: "All notifications have been marked as read",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark all notifications as read",
        variant: "destructive",
      });
    },
  });

  const unreadNotifications = notifications.filter(
    (n) => !n.read
  );

  const displayedNotifications = activeTab === "unread" ? unreadNotifications : notifications;

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <AlertCircle className="h-4 w-4" />;
      case "high":
        return <AlertTriangle className="h-4 w-4" />;
      case "normal":
        return <Info className="h-4 w-4" />;
      default:
        return <CheckCircle className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <ParentAppShell>
        <div className="container mx-auto p-6 max-w-5xl">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading notifications...</p>
            </div>
          </div>
        </div>
      </ParentAppShell>
    );
  }

  return (
    <ParentAppShell>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Bell className="h-8 w-8" />
              Notifications
            </h1>
            <p className="text-muted-foreground mt-1">
              Stay updated with important messages and alerts
            </p>
          </div>
          {unreadNotifications.length > 0 && (
            <Button
              variant="outline"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
              data-testid="button-mark-all-read"
              className="w-full md:w-auto"
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark All as Read
            </Button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold" data-testid="text-total-count">{notifications.length}</p>
                </div>
                <Bell className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Unread</p>
                  <p className="text-2xl font-bold text-blue-600" data-testid="text-unread-count">
                    {unreadNotifications.length}
                  </p>
                </div>
                <BellOff className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Read</p>
                  <p className="text-2xl font-bold text-green-600" data-testid="text-read-count">
                    {notifications.length - unreadNotifications.length}
                  </p>
                </div>
                <CheckCheck className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notifications List */}
        <Card>
          <CardHeader>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "all" | "unread")}>
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="all" data-testid="tab-all">
                  All ({notifications.length})
                </TabsTrigger>
                <TabsTrigger value="unread" data-testid="tab-unread">
                  Unread ({unreadNotifications.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {displayedNotifications.length === 0 ? (
              <div className="text-center py-12" data-testid="empty-state">
                <BellOff className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {activeTab === "unread" ? "No unread notifications" : "No notifications"}
                </h3>
                <p className="text-muted-foreground">
                  {activeTab === "unread"
                    ? "You're all caught up! Check back later for new updates."
                    : "You don't have any notifications yet."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayedNotifications.map((notification) => {
                  const isUnread = !notification.read;
                  const Icon = typeIcons[notification.type as keyof typeof typeIcons] || Bell;

                  return (
                    <div
                      key={notification.id}
                      className={`grid grid-cols-[auto_1fr_auto] gap-4 p-4 rounded-lg border transition-colors ${
                        isUnread
                          ? "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"
                          : "bg-background border-border"
                      }`}
                      data-testid={`notification-${notification.id}`}
                    >
                      <div
                        className={`rounded-full p-2 self-start ${
                          priorityColors[notification.priority as keyof typeof priorityColors]
                        }`}
                      >
                        {getPriorityIcon(notification.priority)}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h4 className="font-semibold text-sm">
                            {notification.subject}
                          </h4>
                          {isUnread && (
                            <Badge variant="default">
                              New
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {notification.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {notification.content}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(notification.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="self-start">
                        {isUnread && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsReadMutation.mutate(notification.id)}
                            disabled={markAsReadMutation.isPending}
                            data-testid={`button-mark-read-${notification.id}`}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ParentAppShell>
  );
}
