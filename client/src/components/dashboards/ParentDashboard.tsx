import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PlusCircle, User, Calendar, BookOpen, Clock, DollarSign } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function ParentDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: childrenData, isLoading: childrenLoading } = useQuery({
    queryKey: ["/api/children"],
    queryFn: () => fetch("/api/children").then(res => res.json()).catch(() => []),
  });

  const { data: enrollmentsData, isLoading: enrollmentsLoading } = useQuery({
    queryKey: ["/api/enrollments"],
    queryFn: () => {
      if (!childrenData) return Promise.resolve([]);
      const childIds = childrenData.map(child => child.id);
      return fetch(`/api/enrollments?childIds=${childIds.join(',')}`).then(res => res.json()).catch(() => []);
    },
    enabled: !!childrenData,
  });

  const { data: upcomingEventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ["/api/events/upcoming"],
    queryFn: () => fetch("/api/events/upcoming").then(res => res.json()).catch(() => []),
  });

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Parent Dashboard</h1>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/children/register">
              <PlusCircle className="mr-2 h-4 w-4" />
              Register Child
            </Link>
          </Button>
          <Button asChild variant="outline" className="mr-2">
            <Link href="/programs">
              <BookOpen className="mr-2 h-4 w-4" />
              Browse Programs
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/classes">
              <Users className="mr-2 h-4 w-4" />
              Browse Classes
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="children">Children</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">My Children</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{childrenLoading ? "Loading..." : childrenData?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Registered children
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Enrollments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{enrollmentsLoading ? "Loading..." : enrollmentsData?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Active program enrollments
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Upcoming Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{eventsLoading ? "Loading..." : upcomingEventsData?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  In the next 7 days
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">0</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Pending payments
                </p>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Events</CardTitle>
                <CardDescription>Scheduled classes and activities</CardDescription>
              </CardHeader>
              <CardContent>
                {eventsLoading ? (
                  <div className="text-center py-8">Loading upcoming events...</div>
                ) : upcomingEventsData?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-2" />
                    <p>No upcoming events scheduled</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {upcomingEventsData?.slice(0, 3).map((event, index) => (
                      <div key={index} className="flex justify-between items-center p-4 border rounded-lg">
                        <div>
                          <h3 className="font-medium">{event.title}</h3>
                          <p className="text-sm text-muted-foreground">{new Date(event.startDate).toLocaleDateString()}</p>
                        </div>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/events/${event.id}`}>View</Link>
                        </Button>
                      </div>
                    ))}
                    <div className="flex justify-end mt-2">
                      <Button variant="link" asChild>
                        <Link href="/events">View All Events</Link>
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common parent tasks</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/children">
                    <User className="h-5 w-5 mb-1" />
                    <span>My Children</span>
                  </Link>
                </Button>
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/schedule">
                    <Calendar className="h-5 w-5 mb-1" />
                    <span>Calendar</span>
                  </Link>
                </Button>
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/enrollments">
                    <BookOpen className="h-5 w-5 mb-1" />
                    <span>Enrollments</span>
                  </Link>
                </Button>
                <Button variant="outline" asChild className="h-24 flex flex-col gap-2 w-full">
                  <Link href="/payments">
                    <DollarSign className="h-5 w-5 mb-1" />
                    <span>Payments</span>
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="children" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Children</CardTitle>
              <CardDescription>Manage your children's profiles</CardDescription>
            </CardHeader>
            <CardContent>
              {childrenLoading ? (
                <div className="text-center py-8">Loading children profiles...</div>
              ) : childrenData?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-2" />
                  <p>No children registered yet</p>
                  <Button className="mt-4" asChild>
                    <Link href="/children/register">Register a Child</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {childrenData?.map((child, index) => (
                    <div key={index} className="flex justify-between items-center p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium">{child.name}</h3>
                          <p className="text-sm text-muted-foreground">Age: {child.age}</p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/children/${child.id}`}>View Profile</Link>
                      </Button>
                    </div>
                  ))}
                  <div className="flex justify-end mt-2">
                    <Button asChild>
                      <Link href="/children/register">Register New Child</Link>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enrollments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Program Enrollments</CardTitle>
              <CardDescription>Manage your children's program enrollments</CardDescription>
            </CardHeader>
            <CardContent>
              {enrollmentsLoading ? (
                <div className="text-center py-8">Loading enrollment information...</div>
              ) : enrollmentsData?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-2" />
                  <p>No active enrollments</p>
                  <Button className="mt-4" asChild>
                    <Link href="/programs">Browse Programs</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Enrollment cards would go here */}
                  <div className="flex justify-end mt-2">
                    <Button asChild>
                      <Link href="/programs">Browse More Programs</Link>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Family Schedule</CardTitle>
              <CardDescription>View and manage your family's schedule</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72 flex items-center justify-center border rounded-md">
                <div className="text-center">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium">Calendar View</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    View all scheduled activities for your children
                  </p>
                  <Button className="mt-4" asChild>
                    <Link href="/schedule">View Full Schedule</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}