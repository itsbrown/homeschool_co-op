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
import { Plus, CalendarDays, ChevronLeft, ChevronRight, Edit, Trash2, Clock, Download, FileText } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isSameDay, addMonths, subMonths } from 'date-fns';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

interface CalendarEvent {
  id: number;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  eventType: string;
  color: string;
  isAllDay: boolean;
  location: string | null;
  schoolId: number;
}

const eventFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  eventType: z.string().min(1, 'Event type is required'),
  color: z.string().optional(),
  isAllDay: z.boolean().default(false),
  location: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

const EVENT_TYPES = [
  { value: 'class', label: 'Class', color: '#3B82F6' },
  { value: 'meeting', label: 'Meeting', color: '#10B981' },
  { value: 'holiday', label: 'Holiday', color: '#EF4444' },
  { value: 'deadline', label: 'Deadline', color: '#F97316' },
  { value: 'special', label: 'Special Event', color: '#8B5CF6' },
  { value: 'workshop', label: 'Workshop', color: '#06B6D4' },
  { value: 'camp', label: 'Camp', color: '#EC4899' },
  { value: 'other', label: 'Other', color: '#6B7280' },
];

const EVENT_TEMPLATES = [
  { 
    id: 'holiday',
    name: 'School Holiday',
    eventType: 'holiday',
    title: 'School Closed - ',
    description: 'The school will be closed for this holiday. No classes will be held.',
    isAllDay: true,
  },
  {
    id: 'parent-meeting',
    name: 'Parent Meeting',
    eventType: 'meeting',
    title: 'Parent-Teacher Conference',
    description: 'Scheduled parent-teacher meeting to discuss student progress.',
    isAllDay: false,
  },
  {
    id: 'registration-deadline',
    name: 'Registration Deadline',
    eventType: 'deadline',
    title: 'Registration Deadline - ',
    description: 'Final deadline for class registration. Please ensure all enrollments are completed.',
    isAllDay: true,
  },
  {
    id: 'payment-deadline',
    name: 'Payment Deadline',
    eventType: 'deadline',
    title: 'Payment Due Date',
    description: 'All outstanding payments are due by this date.',
    isAllDay: true,
  },
  {
    id: 'open-house',
    name: 'Open House',
    eventType: 'special',
    title: 'Open House Event',
    description: 'Join us for an open house to learn about our programs and meet our educators.',
    isAllDay: false,
  },
  {
    id: 'class-session',
    name: 'Class Session',
    eventType: 'class',
    title: '',
    description: 'Regular class session.',
    isAllDay: false,
  },
  {
    id: 'workshop',
    name: 'Workshop',
    eventType: 'workshop',
    title: 'Workshop: ',
    description: 'Interactive workshop for students and families.',
    isAllDay: false,
  },
  {
    id: 'camp',
    name: 'Camp/Program',
    eventType: 'camp',
    title: '',
    description: 'Special camp or extended program.',
    isAllDay: false,
  },
];

const generateICSFile = (event: CalendarEvent) => {
  const formatICSDate = (dateStr: string, isAllDay: boolean) => {
    const date = new Date(dateStr);
    if (isAllDay) {
      return date.toISOString().split('T')[0].replace(/-/g, '');
    }
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const escapeICS = (str: string) => {
    return str.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
  };

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ASA Learning Platform//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:event-${event.id}@asa-learning`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    event.isAllDay
      ? `DTSTART;VALUE=DATE:${formatICSDate(event.startDate, true)}`
      : `DTSTART:${formatICSDate(event.startDate, false)}`,
    event.isAllDay
      ? `DTEND;VALUE=DATE:${formatICSDate(event.endDate, true)}`
      : `DTEND:${formatICSDate(event.endDate, false)}`,
    `SUMMARY:${escapeICS(event.title)}`,
    event.description ? `DESCRIPTION:${escapeICS(event.description)}` : '',
    event.location ? `LOCATION:${escapeICS(event.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${event.title.replace(/[^a-z0-9]/gi, '_')}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

export default function CalendarPage() {
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const startDate = startOfMonth(currentMonth);
  const endDate = endOfMonth(currentMonth);

  const { data: events, isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ['/api/calendar-events/range', startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      const response = await fetch(`/api/calendar-events/range?start=${startDate.toISOString()}&end=${endDate.toISOString()}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('supabase_token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch events');
      return response.json();
    },
  });

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: '',
      description: '',
      startDate: '',
      endDate: '',
      eventType: 'meeting',
      isAllDay: false,
      location: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: EventFormValues) => {
      return apiRequest('POST', '/api/calendar-events', values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar-events/range'] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: 'Event created' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create event', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: EventFormValues & { id: number }) => {
      return apiRequest('PATCH', `/api/calendar-events/${id}`, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar-events/range'] });
      setIsDialogOpen(false);
      setSelectedEvent(null);
      form.reset();
      toast({ title: 'Event updated' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update event', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/calendar-events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar-events/range'] });
      setIsViewDialogOpen(false);
      setSelectedEvent(null);
      toast({ title: 'Event deleted' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete event', variant: 'destructive' });
    },
  });

  const onSubmit = (values: EventFormValues) => {
    const eventData = {
      ...values,
      color: EVENT_TYPES.find(t => t.value === values.eventType)?.color || '#6B7280',
    };
    
    if (selectedEvent) {
      updateMutation.mutate({ ...eventData, id: selectedEvent.id });
    } else {
      createMutation.mutate(eventData);
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsViewDialogOpen(true);
  };

  const handleEditEvent = () => {
    if (!selectedEvent) return;
    setIsViewDialogOpen(false);
    form.reset({
      title: selectedEvent.title,
      description: selectedEvent.description || '',
      startDate: format(new Date(selectedEvent.startDate), "yyyy-MM-dd'T'HH:mm"),
      endDate: format(new Date(selectedEvent.endDate), "yyyy-MM-dd'T'HH:mm"),
      eventType: selectedEvent.eventType,
      isAllDay: selectedEvent.isAllDay,
      location: selectedEvent.location || '',
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedEvent(null);
    form.reset();
  };

  const daysInMonth = eachDayOfInterval({ start: startDate, end: endDate });
  const firstDayOfWeek = startDate.getDay();

  const getEventsForDay = (day: Date) => {
    if (!events) return [];
    return events.filter(event => {
      const eventStart = new Date(event.startDate);
      const eventEnd = new Date(event.endDate);
      return isSameDay(eventStart, day) || (eventStart <= day && eventEnd >= day);
    });
  };

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Calendar">
        <Skeleton className="h-[600px] w-full" />
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle="Calendar">
      <div className="flex justify-between items-center mb-6">
        <div>
          <p className="text-muted-foreground">Manage school events and schedules</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-event">
              <Plus className="h-4 w-4 mr-2" />
              New Event
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedEvent ? 'Edit Event' : 'Create Event'}</DialogTitle>
              <DialogDescription>
                {selectedEvent ? 'Update event details' : 'Add a new event to the calendar'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {!selectedEvent && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Start from Template</label>
                    <div className="grid grid-cols-2 gap-2">
                      {EVENT_TEMPLATES.map((template) => (
                        <Button
                          key={template.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="justify-start h-auto py-2 px-3"
                          onClick={() => {
                            form.setValue('title', template.title);
                            form.setValue('description', template.description);
                            form.setValue('eventType', template.eventType);
                            form.setValue('isAllDay', template.isAllDay);
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
                        <Input {...field} placeholder="Event title" data-testid="input-event-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Event description" rows={3} data-testid="input-event-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="eventType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-event-type">
                            <SelectValue placeholder="Select event type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {EVENT_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: type.color }} />
                                {type.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} data-testid="input-start-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} data-testid="input-end-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Event location" data-testid="input-event-location" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isAllDay"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel>All Day Event</FormLabel>
                        <FormDescription>Event lasts the entire day</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-all-day" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-event">
                    {selectedEvent ? 'Update' : 'Create'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} data-testid="button-prev-month">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <CardTitle className="text-xl" data-testid="text-current-month">
              {format(currentMonth, 'MMMM yyyy')}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} data-testid="button-next-month">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px bg-muted" data-testid="calendar-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="bg-background p-2 text-center text-sm font-medium text-muted-foreground">
                {day}
              </div>
            ))}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-background min-h-[100px]" />
            ))}
            {daysInMonth.map((day) => {
              const dayEvents = getEventsForDay(day);
              return (
                <div
                  key={day.toISOString()}
                  className={`bg-background min-h-[100px] p-1 border-t ${
                    isToday(day) ? 'bg-primary/5' : ''
                  } ${!isSameMonth(day, currentMonth) ? 'text-muted-foreground' : ''}`}
                  data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
                >
                  <div className={`text-right text-sm mb-1 ${isToday(day) ? 'font-bold text-primary' : ''}`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button
                        key={event.id}
                        onClick={() => handleEventClick(event)}
                        className="w-full text-left text-xs p-1 rounded truncate text-white hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: event.color }}
                        data-testid={`event-${event.id}`}
                      >
                        {event.title}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-xs text-muted-foreground text-center">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedEvent?.color }} />
              <DialogTitle>{selectedEvent?.title}</DialogTitle>
            </div>
            <DialogDescription>
              <Badge variant="outline" className="mt-2">
                {EVENT_TYPES.find(t => t.value === selectedEvent?.eventType)?.label || selectedEvent?.eventType}
              </Badge>
            </DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              {selectedEvent.description && (
                <p className="text-sm">{selectedEvent.description}</p>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {selectedEvent.isAllDay ? (
                  <span>All day on {format(new Date(selectedEvent.startDate), 'MMMM d, yyyy')}</span>
                ) : (
                  <span>
                    {format(new Date(selectedEvent.startDate), 'MMM d, yyyy h:mm a')} - {format(new Date(selectedEvent.endDate), 'MMM d, yyyy h:mm a')}
                  </span>
                )}
              </div>
              {selectedEvent.location && (
                <div className="text-sm text-muted-foreground">
                  Location: {selectedEvent.location}
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    generateICSFile(selectedEvent);
                    toast({ title: 'Calendar file downloaded', description: 'Open the .ics file to add to your calendar' });
                  }} 
                  data-testid="button-add-to-calendar"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Add to Calendar
                </Button>
                <Button variant="outline" size="sm" onClick={handleEditEvent} data-testid="button-edit-event">
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(selectedEvent.id)} data-testid="button-delete-event">
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SchoolAdminLayout>
  );
}
