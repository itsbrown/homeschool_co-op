import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  Mail, 
  MessageSquare, 
  Phone, 
  Eye, 
  EyeOff, 
  Users, 
  Send, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  BarChart3,
  ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

interface NotificationStats {
  totalRecipients: number;
  delivered: number;
  opened: number;
  openRate: number;
  email: { sent: number; total: number };
  sms: { sent: number; total: number };
}

interface NotificationTracking {
  id: number;
  subject: string;
  content: string;
  targetType: string;
  type: string;
  priority: string;
  sentAt: string | null;
  createdAt: string;
  stats: NotificationStats;
}

interface Recipient {
  id: number;
  recipientId: number;
  name: string;
  email: string;
  deliveryType: string;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  errorMessage: string | null;
}

interface RecipientDetails {
  notification: {
    id: number;
    subject: string;
    content: string;
    targetType: string;
    sentAt: string | null;
  };
  recipients: {
    inApp: Recipient[];
    email: Recipient[];
    sms: Recipient[];
  };
  summary: {
    total: number;
    opened: number;
    delivered: number;
    pending: number;
    failed: number;
  };
}

const TARGET_TYPE_LABELS: Record<string, string> = {
  all_parents: 'All Parents',
  enrolled_parents: 'Enrolled Parents',
  unenrolled_parents: 'Unenrolled Parents',
  class_specific: 'Specific Class',
  missed_payments: 'Missed Payments',
  all: 'Everyone',
  individual: 'Individual',
  role: 'By Role',
  location: 'By Location',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  read: { label: 'Opened', color: 'bg-green-100 text-green-800', icon: Eye },
  delivered: { label: 'Delivered', color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
  sent: { label: 'Sent', color: 'bg-gray-100 text-gray-800', icon: Send },
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-800', icon: AlertCircle },
};

export default function NotificationTrackingPage() {
  const [selectedNotificationId, setSelectedNotificationId] = useState<number | null>(null);

  const { data: notifications, isLoading } = useQuery<NotificationTracking[]>({
    queryKey: ['/api/school-admin/notifications/tracking'],
  });

  const { data: recipientDetails, isLoading: isLoadingRecipients } = useQuery<RecipientDetails>({
    queryKey: [`/api/school-admin/notifications/${selectedNotificationId}/recipients`],
    enabled: !!selectedNotificationId,
  });

  const totalSent = notifications?.length || 0;
  const averageOpenRate = notifications && notifications.length > 0
    ? Math.round(notifications.reduce((sum, n) => sum + n.stats.openRate, 0) / notifications.length)
    : 0;
  const totalRecipients = notifications?.reduce((sum, n) => sum + n.stats.totalRecipients, 0) || 0;

  return (
    <SchoolAdminLayout pageTitle="Notification Tracking">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Sent</CardDescription>
              <CardTitle className="text-3xl">{totalSent}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Notifications sent</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Recipients</CardDescription>
              <CardTitle className="text-3xl">{totalRecipients}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">People reached</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Average Open Rate</CardDescription>
              <CardTitle className="text-3xl">{averageOpenRate}%</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={averageOpenRate} className="h-2" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Sent Notifications
            </CardTitle>
            <CardDescription>
              View delivery and open rates for all sent notifications
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : notifications && notifications.length > 0 ? (
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedNotificationId(notification.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">{notification.subject}</h3>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {TARGET_TYPE_LABELS[notification.targetType] || notification.targetType}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {notification.content.substring(0, 100)}...
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Sent {notification.sentAt ? format(new Date(notification.sentAt), 'MMM d, yyyy h:mm a') : 'Unknown'}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-4 ml-4">
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span>{notification.stats.totalRecipients}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Recipients</p>
                        </div>
                        
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <Eye className="h-4 w-4 text-green-600" />
                            <span className="text-green-600">{notification.stats.opened}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Opened</p>
                        </div>
                        
                        <div className="text-center min-w-[60px]">
                          <div className="text-sm font-medium">{notification.stats.openRate}%</div>
                          <Progress value={notification.stats.openRate} className="h-1.5 mt-1" />
                        </div>
                        
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No notifications sent yet</h3>
                <p className="text-muted-foreground">
                  Once you send notifications, you'll see delivery and open rates here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!selectedNotificationId} onOpenChange={(open) => !open && setSelectedNotificationId(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {recipientDetails?.notification.subject || 'Notification Details'}
              </DialogTitle>
              <DialogDescription>
                View who received and opened this notification
              </DialogDescription>
            </DialogHeader>
            
            {isLoadingRecipients ? (
              <div className="space-y-4 py-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : recipientDetails ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold">{recipientDetails.summary.total}</div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-700">{recipientDetails.summary.opened}</div>
                    <div className="text-xs text-green-600">Opened</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-700">{recipientDetails.summary.delivered}</div>
                    <div className="text-xs text-blue-600">Delivered</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-yellow-700">{recipientDetails.summary.pending}</div>
                    <div className="text-xs text-yellow-600">Pending</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-red-700">{recipientDetails.summary.failed}</div>
                    <div className="text-xs text-red-600">Failed</div>
                  </div>
                </div>

                <div className="text-center py-2">
                  <span className="text-lg font-semibold">
                    {recipientDetails.summary.opened} of {recipientDetails.summary.total} opened = {' '}
                    {recipientDetails.summary.total > 0 
                      ? Math.round((recipientDetails.summary.opened / recipientDetails.summary.total) * 100) 
                      : 0}%
                  </span>
                </div>

                <Tabs defaultValue="in_app" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="in_app" className="flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" />
                      In-App ({recipientDetails.recipients.inApp.length})
                    </TabsTrigger>
                    <TabsTrigger value="email" className="flex items-center gap-1">
                      <Mail className="h-4 w-4" />
                      Email ({recipientDetails.recipients.email.length})
                    </TabsTrigger>
                    <TabsTrigger value="sms" className="flex items-center gap-1">
                      <Phone className="h-4 w-4" />
                      SMS ({recipientDetails.recipients.sms.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="in_app" className="mt-4">
                    <RecipientTable recipients={recipientDetails.recipients.inApp} />
                  </TabsContent>
                  <TabsContent value="email" className="mt-4">
                    <RecipientTable recipients={recipientDetails.recipients.email} />
                  </TabsContent>
                  <TabsContent value="sms" className="mt-4">
                    <SmsRecipientTable recipients={recipientDetails.recipients.sms} />
                  </TabsContent>
                </Tabs>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </SchoolAdminLayout>
  );
}

function RecipientTable({ recipients }: { recipients: Recipient[] }) {
  if (recipients.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <EyeOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No recipients for this delivery type</p>
      </div>
    );
  }

  const openedRecipients = recipients.filter(r => r.status === 'read');
  const notOpenedRecipients = recipients.filter(r => r.status !== 'read');

  return (
    <div className="space-y-4">
      {openedRecipients.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-green-700 mb-2 flex items-center gap-1">
            <Eye className="h-4 w-4" />
            Opened ({openedRecipients.length})
          </h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Opened At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openedRecipients.map((recipient) => (
                  <TableRow key={recipient.id}>
                    <TableCell className="font-medium">{recipient.name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{recipient.email}</TableCell>
                    <TableCell>
                      {recipient.readAt 
                        ? format(new Date(recipient.readAt), 'MMM d, h:mm a') 
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {notOpenedRecipients.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <EyeOff className="h-4 w-4" />
            Not Opened ({notOpenedRecipients.length})
          </h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notOpenedRecipients.map((recipient) => {
                  const statusConfig = STATUS_CONFIG[recipient.status] || STATUS_CONFIG.pending;
                  const StatusIcon = statusConfig.icon;
                  return (
                    <TableRow key={recipient.id}>
                      <TableCell className="font-medium">{recipient.name || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{recipient.email}</TableCell>
                      <TableCell>
                        <Badge className={statusConfig.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function SmsRecipientTable({ recipients }: { recipients: Recipient[] }) {
  if (recipients.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <EyeOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No SMS recipients for this notification</p>
      </div>
    );
  }

  const deliveredRecipients = recipients.filter(r => r.status === 'sent' || r.status === 'delivered');
  const failedRecipients = recipients.filter(r => r.status === 'failed');
  const pendingRecipients = recipients.filter(r => r.status !== 'sent' && r.status !== 'delivered' && r.status !== 'failed');

  return (
    <div className="space-y-4">
      {deliveredRecipients.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-blue-700 mb-2 flex items-center gap-1">
            <CheckCircle className="h-4 w-4" />
            Delivered ({deliveredRecipients.length})
          </h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Sent At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveredRecipients.map((recipient) => (
                  <TableRow key={recipient.id}>
                    <TableCell className="font-medium">{recipient.name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{recipient.email}</TableCell>
                    <TableCell>
                      {recipient.sentAt
                        ? format(new Date(recipient.sentAt), 'MMM d, h:mm a')
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {failedRecipients.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            Failed ({failedRecipients.length})
          </h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedRecipients.map((recipient) => (
                  <TableRow key={recipient.id}>
                    <TableCell className="font-medium">{recipient.name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{recipient.email}</TableCell>
                    <TableCell className="text-red-600 text-sm">
                      {recipient.errorMessage || 'Unknown error'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {pendingRecipients.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-yellow-700 mb-2 flex items-center gap-1">
            <Clock className="h-4 w-4" />
            Pending ({pendingRecipients.length})
          </h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRecipients.map((recipient) => (
                  <TableRow key={recipient.id}>
                    <TableCell className="font-medium">{recipient.name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{recipient.email}</TableCell>
                    <TableCell>
                      <Badge className="bg-yellow-100 text-yellow-800">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
