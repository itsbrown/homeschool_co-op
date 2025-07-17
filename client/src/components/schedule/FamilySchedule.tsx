import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight,
  List,
  Grid3X3,
  User,
  Clock,
  Calendar,
  MapPin,
  Users
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay, parseISO } from "date-fns";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ScheduleEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  type: 'class' | 'program' | 'field-trip' | 'event';
  childId: string;
  childName: string;
  color: string;
  description?: string;
  programName?: string;
  instructorName?: string;
}

interface FamilyScheduleProps {
  childId?: string; // Optional child ID to filter events for a specific child
}

export default function FamilySchedule({ childId }: FamilyScheduleProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [childFilter, setChildFilter] = useState<string>(childId || "all");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  
  // Get event data from API
  const { data: events, isLoading } = useQuery({
    queryKey: ["/api/schedule", childFilter, eventTypeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (childFilter !== "all") params.append("childId", childFilter);
      if (eventTypeFilter !== "all") params.append("type", eventTypeFilter);
      
      const url = `/api/schedule?${params.toString()}`;
      return fetch(url)
        .then(res => {
          if (!res.ok) {
            throw new Error(`Failed to fetch schedule: ${res.status}`);
          }
          return res.json();
        })
        .catch(() => {
          // Return empty array when API fails
          return [];
        });
    },
  });
  
  // Get children data for the filter
  const { data: children } = useQuery({
    queryKey: ["/api/children"],
    queryFn: () => fetch("/api/children").then(res => res.json()).catch(() => []),
  });
  
  // Calendar navigation functions
  const goToPreviousMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };
  
  // Generate days for the current month view
  const daysInMonth = React.useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);
  
  // Filter events for a specific day
  const getEventsForDay = (day: Date) => {
    if (!events) return [];
    return events.filter((event: ScheduleEvent) => isSameDay(parseISO(event.date), day));
  };
  
  // Get all events for the selected date
  const selectedDateEvents = React.useMemo(() => {
    if (!selectedDate || !events) return [];
    
    return events.filter((event: ScheduleEvent) => 
      isSameDay(parseISO(event.date), selectedDate)
    );
  }, [selectedDate, events]);
  
  // Get color for event type
  const getEventColor = (type: string) => {
    switch (type) {
      case 'class':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'program':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'field-trip':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'event':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };
  
  // Format time (e.g., "9:00 AM")
  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
  };
  
  // Group events by date for list view
  const groupedEvents = React.useMemo(() => {
    if (!events) return {};
    
    return events.reduce((acc: Record<string, ScheduleEvent[]>, event: ScheduleEvent) => {
      const dateKey = event.date;
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(event);
      return acc;
    }, {});
  }, [events]);
  
  // Sort dates for list view
  const sortedDates = React.useMemo(() => {
    if (!groupedEvents) return [];
    return Object.keys(groupedEvents).sort((a, b) => 
      new Date(a).getTime() - new Date(b).getTime()
    );
  }, [groupedEvents]);
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Family Schedule</h2>
          <p className="text-muted-foreground">
            Track your children's classes, programs, and events
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn(viewMode === 'calendar' && "bg-muted")}
            onClick={() => setViewMode('calendar')}
          >
            <Grid3X3 className="mr-2 h-4 w-4" />
            Calendar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(viewMode === 'list' && "bg-muted")}
            onClick={() => setViewMode('list')}
          >
            <List className="mr-2 h-4 w-4" />
            List
          </Button>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <div className="w-full md:w-auto flex-1">
          <Select
            value={childFilter}
            onValueChange={setChildFilter}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Filter by child" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Children</SelectItem>
              {Array.isArray(children) && children.map((child: any) => (
                <SelectItem key={child.id} value={child.id.toString()}>
                  {child.firstName} {child.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="w-full md:w-auto flex-1">
          <Select
            value={eventTypeFilter}
            onValueChange={setEventTypeFilter}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Filter by event type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Event Types</SelectItem>
              <SelectItem value="class">Classes</SelectItem>
              <SelectItem value="program">Programs</SelectItem>
              <SelectItem value="field-trip">Field Trips</SelectItem>
              <SelectItem value="event">Special Events</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {viewMode === 'calendar' ? (
        <Card className="border">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{format(currentDate, 'MMMM yyyy')}</CardTitle>
                <CardDescription>
                  {isLoading ? "Loading events..." : events?.length || 0} scheduled activities
                </CardDescription>
              </div>
              
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToToday}>
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={goToNextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-center text-sm font-medium py-1">
                  {day}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for days before the first day of the month */}
              {Array.from({ length: daysInMonth[0].getDay() }).map((_, i) => (
                <div
                  key={`empty-start-${i}`}
                  className="aspect-square p-1 rounded-md text-muted-foreground"
                />
              ))}
              
              {/* Days of the month */}
              {daysInMonth.map((day) => {
                const dayEvents = getEventsForDay(day);
                const isToday = isSameDay(day, new Date());
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isCurrentMonth = isSameMonth(day, currentDate);
                
                return (
                  <div
                    key={day.toString()}
                    className={cn(
                      "aspect-square p-1 rounded-md border border-transparent hover:border-border cursor-pointer",
                      !isCurrentMonth && "opacity-50",
                      isSelected && "border-primary",
                      isToday && "bg-muted"
                    )}
                    onClick={() => setSelectedDate(day)}
                  >
                    <div className="w-full h-full flex flex-col">
                      <div className={cn(
                        "text-right text-sm p-1",
                        isToday && "font-bold text-primary"
                      )}>
                        {format(day, 'd')}
                      </div>
                      
                      <div className="flex-grow overflow-hidden">
                        {dayEvents.slice(0, 3).map((event: ScheduleEvent, i) => (
                          <TooltipProvider key={event.id}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className={cn(
                                    "h-1.5 w-full mb-1 rounded-sm",
                                    event.type === 'class' ? 'bg-blue-400' : 
                                    event.type === 'program' ? 'bg-green-400' : 
                                    event.type === 'field-trip' ? 'bg-purple-400' : 
                                    'bg-amber-400'
                                  )}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-xs">
                                  <p className="font-bold">{event.title}</p>
                                  <p>{formatTime(event.startTime)} - {formatTime(event.endTime)}</p>
                                  <p>{event.childName}</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ))}
                        
                        {dayEvents.length > 3 && (
                          <div className="text-xs text-center text-muted-foreground">
                            +{dayEvents.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Empty cells for days after the last day of the month */}
              {Array.from({ length: 6 - daysInMonth[daysInMonth.length - 1].getDay() }).map((_, i) => (
                <div
                  key={`empty-end-${i}`}
                  className="aspect-square p-1 rounded-md text-muted-foreground"
                />
              ))}
            </div>
          </CardContent>
          
          {selectedDate && (
            <CardFooter className="flex-col items-start pt-0">
              <div className="w-full border-t pt-4">
                <h3 className="font-medium mb-2">
                  Events for {format(selectedDate, 'MMMM d, yyyy')}
                </h3>
                
                {selectedDateEvents.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <Calendar className="h-10 w-10 mx-auto mb-2" />
                    <p>No events scheduled for this day</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDateEvents.map((event: ScheduleEvent) => (
                      <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg border">
                        <div className={cn(
                          "w-1.5 self-stretch rounded-full",
                          event.type === 'class' ? 'bg-blue-400' : 
                          event.type === 'program' ? 'bg-green-400' : 
                          event.type === 'field-trip' ? 'bg-purple-400' : 
                          'bg-amber-400'
                        )} />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium truncate">{event.title}</h4>
                          <div className="flex flex-col gap-1 mt-1">
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              <span>{formatTime(event.startTime)} - {formatTime(event.endTime)}</span>
                            </div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5" />
                              <span>{event.location}</span>
                            </div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <User className="h-3.5 w-3.5" />
                              <span>{event.childName}</span>
                            </div>
                          </div>
                        </div>
                        <Badge className={getEventColor(event.type)}>
                          {event.type === 'class' ? 'Class' : 
                           event.type === 'program' ? 'Program' : 
                           event.type === 'field-trip' ? 'Field Trip' : 
                           'Event'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardFooter>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Events</CardTitle>
            <CardDescription>
              All scheduled activities for your family
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                <p>Loading events...</p>
              </div>
            ) : Object.keys(groupedEvents).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p>No events scheduled</p>
                <p className="text-sm mt-1">Browse programs to find activities for your children</p>
              </div>
            ) : (
              <div className="space-y-8">
                {sortedDates.map((dateKey) => (
                  <div key={dateKey} className="border-b pb-6 last:border-0 last:pb-0">
                    <h3 className="font-medium text-lg mb-4">
                      {format(parseISO(dateKey), 'EEEE, MMMM d, yyyy')}
                    </h3>
                    <div className="space-y-3">
                      {groupedEvents[dateKey]
                        .sort((a, b) => a.startTime.localeCompare(b.startTime))
                        .map((event: ScheduleEvent) => (
                          <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg border">
                            <div className={cn(
                              "w-1.5 self-stretch rounded-full",
                              event.type === 'class' ? 'bg-blue-400' : 
                              event.type === 'program' ? 'bg-green-400' : 
                              event.type === 'field-trip' ? 'bg-purple-400' : 
                              'bg-amber-400'
                            )} />
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium">{event.title}</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 mt-2">
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                                  <span>{formatTime(event.startTime)} - {formatTime(event.endTime)}</span>
                                </div>
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                                  <span className="truncate">{event.location}</span>
                                </div>
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <User className="h-3.5 w-3.5 flex-shrink-0" />
                                  <span>{event.childName}</span>
                                </div>
                                {event.instructorName && (
                                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                    <Users className="h-3.5 w-3.5 flex-shrink-0" />
                                    <span>{event.instructorName}</span>
                                  </div>
                                )}
                              </div>
                              {event.description && (
                                <p className="text-sm text-muted-foreground mt-2">
                                  {event.description}
                                </p>
                              )}
                            </div>
                            <Badge className={getEventColor(event.type)}>
                              {event.type === 'class' ? 'Class' : 
                               event.type === 'program' ? 'Program' : 
                               event.type === 'field-trip' ? 'Field Trip' : 
                               'Event'}
                            </Badge>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
