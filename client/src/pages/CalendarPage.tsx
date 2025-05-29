import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from @/hooks/useAuth00";
import { useToast } from "@/hooks/use-toast";
import AppShell from "@/components/layout/AppShell";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, Calendar as CalendarIcon, Plus, List } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO, isToday, isSameMonth, getDay, addMonths, isSameDay } from "date-fns";

// Helper function to get event color based on type
const getEventColor = (eventType: string) => {
  switch(eventType) {
    case "class": return "bg-blue-100 border-blue-500 text-blue-700";
    case "meeting": return "bg-purple-100 border-purple-500 text-purple-700";
    case "workshop": return "bg-amber-100 border-amber-500 text-amber-700";
    case "camp": return "bg-green-100 border-green-500 text-green-700";
    default: return "bg-gray-100 border-gray-500 text-gray-700";
  }
};

type Event = {
  id: number;
  title: string;
  startDate: string | Date;
  endDate: string | Date;
  eventType: "class" | "meeting" | "workshop" | "camp" | "other";
  location?: string | null;
  description?: string | null;
  organizerId?: number;
  createdAt?: Date;
};

export default function CalendarPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [date, setDate] = useState<Date>(new Date());
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [monthOffset, setMonthOffset] = useState(0);
  const [filter, setFilter] = useState<string>("all");

  // Handle authentication checks
  useEffect(() => {
    if (!isLoading && !user) {
      setTimeout(() => {
        setLocation("/login");
      }, 0);
    }
  }, [isLoading, user, setLocation]);

  // Fetch events
  const { data: events = [], isLoading: isLoadingEvents } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  // Fetch program enrollments
  const { data: enrollments = [], isLoading: isLoadingEnrollments } = useQuery({
    queryKey: ["/api/enrollments"],
  });

  // Current displayed month
  const currentMonth = addMonths(new Date(), monthOffset);

  // Format event dates for consistency
  const formatDates = (events: Event[]) => {
    return events.map(event => {
      // Make a copy of the event object
      const formattedEvent = { ...event };
      
      // Handle startDate - convert to string if it's a Date object
      if (formattedEvent.startDate && typeof formattedEvent.startDate !== 'string') {
        formattedEvent.startDate = new Date(formattedEvent.startDate).toISOString();
      }
      
      // Handle endDate - convert to string if it's a Date object
      if (formattedEvent.endDate && typeof formattedEvent.endDate !== 'string') {
        formattedEvent.endDate = new Date(formattedEvent.endDate).toISOString();
      }
      
      return formattedEvent;
    });
  };
  
  // Filter events based on selected filter and current month
  const formattedEvents = Array.isArray(events) ? formatDates(events) : [];
  const filteredEvents = formattedEvents
    .filter((event: Event) => {
      if (filter !== "all" && event.eventType !== filter) {
        return false;
      }
      const eventDate = parseISO(event.startDate);
      return isSameMonth(eventDate, currentMonth);
    })
    .sort((a: Event, b: Event) => {
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });

  // Group events by date for list view
  const eventsByDate = filteredEvents.reduce((acc: Record<string, Event[]>, event: Event) => {
    const dateKey = format(new Date(event.startDate), 'yyyy-MM-dd');
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(event);
    return acc;
  }, {});

  const eventDates = Object.keys(eventsByDate).sort((a, b) => {
    return new Date(a).getTime() - new Date(b).getTime();
  });

  // Check if a date has events
  const hasEvent = (day: Date) => {
    return filteredEvents.some((event: Event) => {
      const eventDate = parseISO(event.startDate);
      return isSameDay(day, eventDate);
    });
  };

  return (
    <AppShell>
      <div className="container mx-auto p-4 space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>Calendar</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <CalendarIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Calendar</h1>
              <p className="text-muted-foreground">
                View upcoming classes, events and activities
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                <SelectItem value="class">Classes</SelectItem>
                <SelectItem value="meeting">Meetings</SelectItem>
                <SelectItem value="workshop">Workshops</SelectItem>
                <SelectItem value="camp">Camps</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex space-x-1 border rounded-md">
              <Button
                variant={view === "calendar" ? "default" : "ghost"}
                size="sm"
                className="rounded-l-md"
                onClick={() => setView("calendar")}
              >
                <CalendarIcon className="h-4 w-4 mr-1" />
                Calendar
              </Button>
              <Button
                variant={view === "list" ? "default" : "ghost"}
                size="sm"
                className="rounded-r-md"
                onClick={() => setView("list")}
              >
                <List className="h-4 w-4 mr-1" />
                List
              </Button>
            </div>
            {user?.role === "admin" || user?.role === "educator" ? (
              <Button onClick={() => setLocation("/events/create")}>
                <Plus className="h-4 w-4 mr-1" />
                Add Event
              </Button>
            ) : null}
          </div>
        </div>

        {isLoadingEvents ? (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Loading"/>
          </div>
        ) : (
          <>
            {view === "calendar" ? (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>{format(currentMonth, 'MMMM yyyy')}</CardTitle>
                    <div className="flex space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setMonthOffset(monthOffset - 1)}
                      >
                        Previous
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setMonthOffset(0);
                          setDate(new Date());
                        }}
                      >
                        Today
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setMonthOffset(monthOffset + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(newDate) => {
                      if (newDate) {
                        setDate(newDate);
                      }
                    }}
                    month={currentMonth}
                    className="rounded-md border"
                    modifiers={{
                      event: (date) => hasEvent(date)
                    }}
                    modifiersClassNames={{
                      event: "bg-primary/10 font-bold"
                    }}
                  />
                  <div className="mt-6">
                    <h3 className="font-semibold text-lg mb-3">
                      Events for {format(date, 'MMM d, yyyy')}
                    </h3>
                    <div className="space-y-3">
                      {filteredEvents
                        .filter((event: Event) => {
                          const eventDate = parseISO(event.startDate);
                          return isSameDay(eventDate, date);
                        })
                        .map((event: Event) => (
                          <div 
                            key={event.id}
                            className={`border-l-4 p-3 rounded-r-md ${getEventColor(event.eventType)}`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-medium">{event.title}</h4>
                                <p className="text-sm">
                                  {format(parseISO(event.startDate), 'h:mm a')} - {format(parseISO(event.endDate), 'h:mm a')}
                                </p>
                                {event.location && (
                                  <p className="text-sm mt-1">
                                    Location: {event.location}
                                  </p>
                                )}
                              </div>
                              <span className="text-xs capitalize px-2 py-1 rounded-full bg-white/50">
                                {event.eventType}
                              </span>
                            </div>
                            {event.description && (
                              <p className="text-sm mt-2 truncate">
                                {event.description}
                              </p>
                            )}
                          </div>
                        ))}
                      {filteredEvents.filter((event: Event) => {
                        const eventDate = parseISO(event.startDate);
                        return isSameDay(eventDate, date);
                      }).length === 0 && (
                        <p className="text-muted-foreground text-center py-4">
                          No events scheduled for this day
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {eventDates.length > 0 ? (
                  eventDates.map(dateKey => (
                    <Card key={dateKey}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xl">
                          {format(new Date(dateKey), 'EEEE, MMMM d, yyyy')}
                          {isToday(new Date(dateKey)) && (
                            <span className="ml-2 text-sm bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                              Today
                            </span>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {eventsByDate[dateKey].map((event: Event) => (
                            <div 
                              key={event.id}
                              className={`border-l-4 p-3 rounded-r-md ${getEventColor(event.eventType)}`}
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-medium">{event.title}</h4>
                                  <p className="text-sm">
                                    {format(parseISO(event.startDate), 'h:mm a')} - {format(parseISO(event.endDate), 'h:mm a')}
                                  </p>
                                  {event.location && (
                                    <p className="text-sm mt-1">
                                      Location: {event.location}
                                    </p>
                                  )}
                                </div>
                                <span className="text-xs capitalize px-2 py-1 rounded-full bg-white/50">
                                  {event.eventType}
                                </span>
                              </div>
                              {event.description && (
                                <p className="text-sm mt-2">
                                  {event.description}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card>
                    <CardContent className="py-10 text-center">
                      <CalendarIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">No Events Found</h3>
                      <p className="text-muted-foreground">
                        There are no events scheduled for the selected month or filter.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}