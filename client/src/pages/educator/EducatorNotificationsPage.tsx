import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/SupabaseProvider";
import { Mail, Send, Clock, Users, MessageSquare, Bell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ClassInfo {
  id: number;
  title: string;
  schedule: string;
  studentCount: number;
  parentCount: number;
}

interface EducatorNotificationData {
  classes: ClassInfo[];
  totalParents: number;
}

interface NotificationHistoryItem {
  id: number;
  subject: string;
  message: string;
  sentAt: string;
  recipientCount: number;
}

interface NotificationPayload {
  subject: string;
  message: string;
  sendToAll: boolean;
  classIds: string[];
  senderEmail: string | undefined;
}

export default function EducatorNotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [sendToAll, setSendToAll] = useState(false);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

  // Get educator's classes and students for targeted notifications
  const { data: educatorData, isLoading } = useQuery<EducatorNotificationData>({
    queryKey: [`/api/educator/notification-data?email=${encodeURIComponent(user?.email || '')}`],
    enabled: !!user?.email,
  });

  // Get recent notifications sent by this educator
  const { data: notificationHistory } = useQuery<NotificationHistoryItem[]>({
    queryKey: [`/api/educator/notifications/history?email=${encodeURIComponent(user?.email || '')}`],
    enabled: !!user?.email,
  });

  // Send notification mutation
  const sendNotificationMutation = useMutation({
    mutationFn: async (notificationData: NotificationPayload) => {
      return apiRequest('POST', '/api/educator/notifications/send', notificationData);
    },
    onSuccess: () => {
      toast({
        title: "Notification Sent",
        description: "Your message has been sent to the selected parents.",
      });
      setMessage("");
      setSubject("");
      setSelectedClasses([]);
      setSendToAll(false);
      queryClient.invalidateQueries({ queryKey: ["/api/educator/notifications/history"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to send notification. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSendNotification = () => {
    if (!subject.trim() || !message.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter both a subject and message.",
        variant: "destructive",
      });
      return;
    }

    const notificationData = {
      subject,
      message,
      sendToAll,
      classIds: sendToAll ? [] : selectedClasses,
      senderEmail: user?.email,
    };

    sendNotificationMutation.mutate(notificationData);
  };

  const handleClassSelection = (classId: string, checked: boolean) => {
    if (checked) {
      setSelectedClasses([...selectedClasses, classId]);
    } else {
      setSelectedClasses(selectedClasses.filter(id => id !== classId));
    }
  };

  const getRecipientCount = () => {
    if (sendToAll || !educatorData?.classes) {
      return educatorData?.totalParents || 0;
    }
    
    const selectedClassData = educatorData.classes.filter((cls: any) => 
      selectedClasses.includes(cls.id.toString())
    );
    
    return selectedClassData.reduce((total: number, cls: any) => 
      total + (cls.parentCount || 0), 0
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Clock className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading notification data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-600 mt-1">Send messages to parents of your students</p>
        </div>
      </div>

      <Tabs defaultValue="compose" className="space-y-4">
        <TabsList>
          <TabsTrigger value="compose">
            <MessageSquare className="h-4 w-4 mr-2" />
            Compose Message
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock className="h-4 w-4 mr-2" />
            Message History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Send Notification to Parents
              </CardTitle>
              <CardDescription>
                Send messages to parents of students in your classes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Subject */}
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter message subject..."
                />
              </div>

              {/* Message */}
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter your message to parents..."
                  rows={6}
                />
              </div>

              {/* Recipients */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="send-to-all"
                    checked={sendToAll}
                    onCheckedChange={setSendToAll}
                  />
                  <Label htmlFor="send-to-all">Send to all parents in my classes</Label>
                </div>

                {!sendToAll && educatorData?.classes && (
                  <div className="space-y-3">
                    <Label>Select specific classes:</Label>
                    <div className="grid gap-3">
                      {educatorData.classes.map((classItem: any) => (
                        <div key={classItem.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                          <input
                            type="checkbox"
                            id={`class-${classItem.id}`}
                            checked={selectedClasses.includes(classItem.id.toString())}
                            onChange={(e) => handleClassSelection(classItem.id.toString(), e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <div className="flex-1">
                            <Label htmlFor={`class-${classItem.id}`} className="font-medium">
                              {classItem.title}
                            </Label>
                            <p className="text-sm text-gray-500">
                              {classItem.studentCount} students • {classItem.parentCount} parents
                            </p>
                          </div>
                          <Badge variant="outline">
                            {classItem.schedule}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recipient count */}
                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                  <Users className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-blue-700">
                    This message will be sent to {getRecipientCount()} parent(s)
                  </span>
                </div>
              </div>

              {/* Send button */}
              <Button 
                onClick={handleSendNotification}
                disabled={sendNotificationMutation.isPending || !subject.trim() || !message.trim()}
                className="w-full"
              >
                {sendNotificationMutation.isPending ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Notification
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Message History
              </CardTitle>
              <CardDescription>
                Your recent messages to parents
              </CardDescription>
            </CardHeader>
            <CardContent>
              {notificationHistory && notificationHistory.length > 0 ? (
                <div className="space-y-4">
                  {notificationHistory.map((notification: any) => (
                    <div key={notification.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-medium">{notification.subject}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Bell className="h-3 w-3" />
                          {new Date(notification.sentAt).toLocaleDateString()}
                        </div>
                      </div>
                      <p className="text-gray-600 text-sm mb-3">{notification.message}</p>
                      <div className="flex justify-between items-center">
                        <Badge variant="outline">
                          {notification.recipientCount} recipient(s)
                        </Badge>
                        <span className="text-xs text-gray-400">
                          {new Date(notification.sentAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No messages sent yet</h3>
                  <p className="text-gray-500">Your message history will appear here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}