import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Clock, MapPin, Download, Calendar as CalendarIcon, ExternalLink } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isSameDay, addMonths, subMonths, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/SupabaseProvider';

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

const EVENT_TYPE_LABELS: Record<string, string> = {
  class: 'Class',
  meeting: 'Meeting',
  holiday: 'Holiday',
  deadline: 'Deadline',
  special: 'Special Event',
  workshop: 'Workshop',
  camp: 'Camp',
  other: 'Other',
};

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

export default function ParentCalendarView() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const startDate = startOfMonth(currentMonth);
  const endDate = endOfMonth(currentMonth);

  const { data: events, isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ['/api/calendar-events/parent/events', startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch(`/api/calendar-events/parent/events?start=${startDate.toISOString()}&end=${endDate.toISOString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch events');
      return response.json();
    },
  });

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

  const upcomingEvents = events?.filter(event => {
    const eventStart = new Date(event.startDate);
    return eventStart >= new Date();
  }).slice(0, 5) || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>School Calendar</CardTitle>
          <CardDescription>Loading events...</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                School Calendar
              </CardTitle>
              <CardDescription>View upcoming school events and add them to your personal calendar</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} data-testid="button-prev-month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium min-w-[140px] text-center" data-testid="text-current-month">
                {format(currentMonth, 'MMMM yyyy')}
              </span>
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} data-testid="button-next-month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px bg-muted rounded-lg overflow-hidden">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="bg-background p-2 text-center text-sm font-medium">
                {day}
              </div>
            ))}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-background min-h-[80px] p-1" />
            ))}
            {daysInMonth.map((day) => {
              const dayEvents = getEventsForDay(day);
              return (
                <div
                  key={day.toISOString()}
                  className={`bg-background min-h-[80px] p-1 ${
                    isToday(day) ? 'ring-2 ring-primary ring-inset' : ''
                  } ${!isSameMonth(day, currentMonth) ? 'opacity-50' : ''}`}
                >
                  <div className={`text-sm mb-1 ${isToday(day) ? 'font-bold text-primary' : ''}`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 2).map((event) => (
                      <button
                        key={event.id}
                        onClick={() => {
                          setSelectedEvent(event);
                          setIsDialogOpen(true);
                        }}
                        className="w-full text-left text-xs p-1 rounded truncate text-white hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: event.color }}
                        data-testid={`event-${event.id}`}
                      >
                        {event.title}
                      </button>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-xs text-muted-foreground text-center">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {upcomingEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upcoming Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    setSelectedEvent(event);
                    setIsDialogOpen(true);
                  }}
                  data-testid={`upcoming-event-${event.id}`}
                >
                  <div
                    className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0"
                    style={{ backgroundColor: event.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{event.title}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {event.isAllDay ? (
                        <span>{format(new Date(event.startDate), 'MMM d, yyyy')}</span>
                      ) : (
                        <span>{format(new Date(event.startDate), 'MMM d, h:mm a')}</span>
                      )}
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{event.location}</span>
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className="flex-shrink-0">
                    {EVENT_TYPE_LABELS[event.eventType] || event.eventType}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedEvent?.color }} />
              <DialogTitle>{selectedEvent?.title}</DialogTitle>
            </div>
            <DialogDescription>
              <Badge variant="outline" className="mt-2">
                {EVENT_TYPE_LABELS[selectedEvent?.eventType || ''] || selectedEvent?.eventType}
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{selectedEvent.location}</span>
                </div>
              )}
              <div className="flex justify-end">
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
                  Add to My Calendar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
