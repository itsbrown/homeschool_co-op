import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Megaphone, Pin, Send, Edit, Trash2, Users, Calendar, FileText, Sparkles, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

interface Announcement {
  id: number;
  title: string;
  message: string;
  targetType: string;
  targetData?: Record<string, any>;
  status: string;
  isPinned: boolean;
  expiresAt: string | null;
  createdAt: string;
  sentAt: string | null;
  schoolId: number;
}

const announcementFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  message: z.string().min(1, 'Message is required'),
  targetType: z.string().min(1, 'Audience is required'),
  targetClassId: z.number().optional(),
  isPinned: z.boolean().default(false),
  expiresAt: z.string().optional(),
});

type AnnouncementFormValues = z.infer<typeof announcementFormSchema>;

const TARGET_TYPE_LABELS: Record<string, string> = {
  all_parents: 'All Parents',
  enrolled_parents: 'Parents with Enrolled Students',
  unenrolled_parents: 'Parents with Non-Enrolled Students',
  class_specific: 'Specific Class',
  missed_payments: 'Parents with Missed Payments',
  all: 'Everyone',
};

const ANNOUNCEMENT_TEMPLATES = [
  {
    id: 'payment-reminder',
    name: 'Payment Reminder',
    title: 'Payment Reminder',
    message: 'This is a friendly reminder that your payment is due. Please ensure all outstanding balances are paid to maintain your enrollment status. If you have any questions about your account, please contact our office.',
    targetType: 'missed_payments',
    isPinned: false,
  },
  {
    id: 'class-update',
    name: 'Class Update',
    title: 'Important Class Update',
    message: 'We have an important update regarding your class. Please read the details below and let us know if you have any questions.',
    targetType: 'class_specific',
    isPinned: false,
  },
  {
    id: 'holiday-notice',
    name: 'Holiday Notice',
    title: 'Holiday Schedule Notice',
    message: 'Please note that our school will be closed for the upcoming holiday. Regular classes will resume after the break. We wish you and your family a wonderful holiday!',
    targetType: 'all_parents',
    isPinned: true,
  },
  {
    id: 'enrollment-open',
    name: 'Enrollment Open',
    title: 'Enrollment Now Open!',
    message: 'We are excited to announce that enrollment is now open for the upcoming session! Spaces are limited, so we encourage you to register early. Visit our enrollment page to secure your spot.',
    targetType: 'unenrolled_parents',
    isPinned: true,
  },
  {
    id: 'general-update',
    name: 'General Update',
    title: 'School Update',
    message: 'We wanted to share an important update with our school community. Please read the information below.',
    targetType: 'all_parents',
    isPinned: false,
  },
  {
    id: 'event-invite',
    name: 'Event Invitation',
    title: 'You\'re Invited!',
    message: 'We would like to invite you to our upcoming school event. We hope to see you there! Please RSVP if required.',
    targetType: 'enrolled_parents',
    isPinned: false,
  },
];

export default function AnnouncementsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResult, setAiResult] = useState<{targetType: string, targetClassId: number | null, interpretation: string, confidence: number} | null>(null);
  const [savedAudienceName, setSavedAudienceName] = useState('');

  const { data: announcements, isLoading } = useQuery<Announcement[]>({
    queryKey: ['/api/announcements'],
  });

  const { data: classes } = useQuery<any[]>({
    queryKey: ['/api/admin/classes'],
  });

  const { data: savedAudiences, refetch: refetchSavedAudiences } = useQuery<any[]>({
    queryKey: ['/api/announcements/saved-audiences'],
  });

  const aiResolveMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await apiRequest('POST', '/api/announcements/ai/resolve-audience', { query });
      if (!response.ok) {
        throw new Error('Failed to resolve audience');
      }
      return response.json();
    },
    onSuccess: (result) => {
      setAiResult(result);
      form.setValue('targetType', result.targetType);
      if (result.targetClassId) {
        form.setValue('targetClassId', result.targetClassId);
      }
      toast({
        title: 'Audience identified',
        description: result.interpretation,
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to resolve audience. Please select manually.',
        variant: 'destructive',
      });
    },
  });

  const handleAiResolve = () => {
    if (!aiQuery.trim()) return;
    setAiResult(null);
    aiResolveMutation.mutate(aiQuery);
  };

  const isAiLoading = aiResolveMutation.isPending;

  const saveAudienceMutation = useMutation({
    mutationFn: async (data: {name: string, targetType: string, targetClassId: number | null}) => {
      const response = await apiRequest('POST', '/api/announcements/saved-audiences', data);
      if (!response.ok) throw new Error('Failed to save audience');
      return response.json();
    },
    onSuccess: () => {
      setSavedAudienceName('');
      queryClient.invalidateQueries({ queryKey: ['/api/announcements/saved-audiences'] });
      toast({ title: 'Audience saved' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save audience', variant: 'destructive' });
    },
  });

  const handleSaveAudience = () => {
    if (!savedAudienceName.trim()) return;
    saveAudienceMutation.mutate({
      name: savedAudienceName,
      targetType: form.getValues('targetType'),
      targetClassId: form.getValues('targetClassId') || null,
    });
  };

  const handleApplySavedAudience = (audience: any) => {
    form.setValue('targetType', audience.targetType);
    if (audience.targetClassId) {
      form.setValue('targetClassId', audience.targetClassId);
    }
    toast({ title: `Applied: ${audience.name}` });
  };

  const form = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementFormSchema),
    defaultValues: {
      title: '',
      message: '',
      targetType: 'all_parents',
      isPinned: false,
      expiresAt: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: AnnouncementFormValues) => {
      return apiRequest('POST', '/api/announcements', {
        title: values.title,
        message: values.message,
        targetType: values.targetType,
        targetClassId: values.targetType === 'class_specific' ? values.targetClassId : null,
        isPinned: values.isPinned,
        expiresAt: values.expiresAt || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: 'Announcement created', description: 'Your announcement has been saved as a draft.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create announcement', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: AnnouncementFormValues & { id: number }) => {
      return apiRequest('PATCH', `/api/announcements/${id}`, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      setIsDialogOpen(false);
      setEditingAnnouncement(null);
      form.reset();
      toast({ title: 'Announcement updated' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update announcement', variant: 'destructive' });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('POST', `/api/announcements/${id}/publish`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      toast({ title: 'Announcement published', description: 'Your announcement is now visible to the selected audience.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to publish announcement', variant: 'destructive' });
    },
  });

  const pinMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('POST', `/api/announcements/${id}/pin`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      toast({ title: 'Pin status updated' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update pin status', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/announcements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      toast({ title: 'Announcement deleted' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete announcement', variant: 'destructive' });
    },
  });

  const onSubmit = (values: AnnouncementFormValues) => {
    if (editingAnnouncement) {
      updateMutation.mutate({ ...values, id: editingAnnouncement.id });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    form.reset({
      title: announcement.title,
      message: announcement.message,
      targetType: announcement.targetType,
      isPinned: announcement.isPinned,
      expiresAt: announcement.expiresAt ? format(new Date(announcement.expiresAt), "yyyy-MM-dd'T'HH:mm") : '',
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingAnnouncement(null);
    form.reset();
  };

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Announcements">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </div>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle="Announcements">
      <div className="flex justify-between items-center mb-6">
        <div>
          <p className="text-muted-foreground">Create and manage announcements for parents</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-announcement">
              <Plus className="h-4 w-4 mr-2" />
              New Announcement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingAnnouncement ? 'Edit Announcement' : 'Create Announcement'}</DialogTitle>
              <DialogDescription>
                {editingAnnouncement ? 'Update your announcement' : 'Create a new announcement to share with parents'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {!editingAnnouncement && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Start from Template</label>
                    <div className="grid grid-cols-2 gap-2">
                      {ANNOUNCEMENT_TEMPLATES.map((template) => (
                        <Button
                          key={template.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="justify-start h-auto py-2 px-3"
                          onClick={() => {
                            form.setValue('title', template.title);
                            form.setValue('message', template.message);
                            form.setValue('targetType', template.targetType);
                            form.setValue('isPinned', template.isPinned);
                            toast({ title: `${template.name} template applied` });
                          }}
                          data-testid={`template-${template.id}`}
                        >
                          <FileText className="h-3 w-3 mr-2" />
                          <span className="text-xs">{template.name}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Announcement title" data-testid="input-announcement-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Message</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Write your announcement..." rows={4} data-testid="input-announcement-message" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">AI Audience Targeting</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Describe your audience (e.g., 'parents who haven't enrolled anyone')"
                      value={aiQuery}
                      onChange={(e) => setAiQuery(e.target.value)}
                      className="flex-1"
                      data-testid="input-ai-audience"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleAiResolve}
                      disabled={isAiLoading || !aiQuery.trim()}
                      data-testid="button-ai-resolve"
                    >
                      {isAiLoading ? (
                        <span className="flex items-center gap-2">
                          <span className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                          Finding...
                        </span>
                      ) : (
                        <>
                          <MessageSquare className="h-3 w-3 mr-1" />
                          Find
                        </>
                      )}
                    </Button>
                  </div>
                  {aiResult && (
                    <div className="text-sm p-2 bg-green-50 dark:bg-green-950/30 rounded border border-green-200 dark:border-green-800">
                      <span className="font-medium">Found: </span>
                      {aiResult.interpretation}
                      <span className="ml-2 text-muted-foreground">
                        ({Math.round(aiResult.confidence * 100)}% confidence)
                      </span>
                    </div>
                  )}
                  
                  {savedAudiences && savedAudiences.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs text-muted-foreground">Saved audiences:</span>
                      <div className="flex flex-wrap gap-1">
                        {savedAudiences.map((audience: any) => (
                          <Button
                            key={audience.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleApplySavedAudience(audience)}
                            data-testid={`saved-audience-${audience.id}`}
                          >
                            {audience.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="targetType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Audience</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-target-type">
                            <SelectValue placeholder="Select audience" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(TARGET_TYPE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2 mt-2">
                        <Input
                          placeholder="Save as..."
                          value={savedAudienceName}
                          onChange={(e) => setSavedAudienceName(e.target.value)}
                          className="flex-1 h-8 text-xs"
                          data-testid="input-save-audience-name"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleSaveAudience}
                          disabled={!savedAudienceName.trim()}
                          className="h-8 text-xs"
                          data-testid="button-save-audience"
                        >
                          Save
                        </Button>
                      </div>
                      <FormDescription>Choose who will see this announcement</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.watch('targetType') === 'class_specific' && classes && (
                  <FormField
                    control={form.control}
                    name="targetClassId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Select Class</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} defaultValue={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger data-testid="select-target-class">
                              <SelectValue placeholder="Select a class" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {classes.map((cls: any) => (
                              <SelectItem key={cls.id} value={cls.id.toString()}>{cls.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="isPinned"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel>Pin Announcement</FormLabel>
                        <FormDescription>Pinned announcements appear at the top</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-pin-announcement" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expiresAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expiration Date (Optional)</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} data-testid="input-expires-at" />
                      </FormControl>
                      <FormDescription>Leave empty for no expiration</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-announcement">
                    {editingAnnouncement ? 'Update' : 'Save Draft'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4" data-testid="list-announcements">
        {!announcements || announcements.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No announcements yet. Create your first announcement!</p>
            </CardContent>
          </Card>
        ) : (
          announcements.map((announcement) => (
            <Card key={announcement.id} className={announcement.isPinned ? 'border-primary' : ''} data-testid={`card-announcement-${announcement.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {announcement.isPinned && <Pin className="h-4 w-4 text-primary" />}
                    <CardTitle className="text-lg">{announcement.title}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={announcement.status === 'sent' ? 'default' : 'secondary'}>
                      {announcement.status === 'sent' ? 'Published' : 'Draft'}
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {TARGET_TYPE_LABELS[announcement.targetType] || announcement.targetType}
                    </Badge>
                  </div>
                </div>
                <CardDescription className="flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  Created {format(new Date(announcement.createdAt), 'MMM d, yyyy')}
                  {announcement.sentAt && ` • Published ${format(new Date(announcement.sentAt), 'MMM d, yyyy')}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm mb-4">{announcement.message}</p>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(announcement)} data-testid={`button-edit-${announcement.id}`}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => pinMutation.mutate(announcement.id)} data-testid={`button-pin-${announcement.id}`}>
                    <Pin className="h-4 w-4 mr-1" />
                    {announcement.isPinned ? 'Unpin' : 'Pin'}
                  </Button>
                  {announcement.status !== 'sent' && (
                    <Button variant="ghost" size="sm" onClick={() => publishMutation.mutate(announcement.id)} data-testid={`button-publish-${announcement.id}`}>
                      <Send className="h-4 w-4 mr-1" />
                      Publish
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteMutation.mutate(announcement.id)} data-testid={`button-delete-${announcement.id}`}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </SchoolAdminLayout>
  );
}
