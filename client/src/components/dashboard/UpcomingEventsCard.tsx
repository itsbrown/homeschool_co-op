import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { fetchUpcomingEvents } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

export default function UpcomingEventsCard() {
  const { data: events, isLoading } = useQuery({
    queryKey: ["/api/events/upcoming"],
    queryFn: fetchUpcomingEvents,
  });

  // Format date function
  const formatEventDate = (date: Date) => {
    return {
      month: date.toLocaleDateString('en-US', { month: 'short' }),
      day: date.getDate(),
      time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    };
  };

  const viewCalendar = () => {
    console.log("View calendar");
  };

  return (
    <Card>
      <CardHeader className="bg-muted/50 border-b px-6 py-5 flex flex-row items-center justify-between">
        <CardTitle>Upcoming Events</CardTitle>
        <Button variant="link" onClick={viewCalendar}>
          View Calendar
        </Button>
      </CardHeader>
      <CardContent className="p-0 divide-y divide-border">
        {isLoading ? (
          // Loading skeleton
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 flex">
                <div className="flex-shrink-0 flex flex-col items-center mr-4">
                  <Skeleton className="h-4 w-8 mb-1" />
                  <Skeleton className="h-8 w-8" />
                </div>
                <div className="flex-1">
                  <Skeleton className="h-5 w-40 mb-1" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
            ))}
          </>
        ) : events && events.length > 0 ? (
          // Event list
          events.map((event) => {
            const formattedDate = formatEventDate(new Date(event.startDate));
            const formattedEndDate = formatEventDate(new Date(event.endDate));
            
            return (
              <div key={event.id} className="p-4 flex">
                <div className="flex-shrink-0 flex flex-col items-center mr-4">
                  <span className="text-sm font-semibold text-muted-foreground">{formattedDate.month}</span>
                  <span className="text-2xl font-bold">{formattedDate.day}</span>
                </div>
                <div>
                  <h4 className="text-base font-medium">{event.title}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formattedDate.time} - {formattedEndDate.time}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          // Empty state
          <div className="p-6 text-center">
            <p className="text-muted-foreground">No upcoming events</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
