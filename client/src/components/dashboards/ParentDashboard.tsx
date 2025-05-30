import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PlusCircle, User, Calendar, BookOpen, Clock, DollarSign, Users, Bot, UserPlus, CreditCard, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth0";
import EnrollmentAssistantModal from "@/components/enrollment/EnrollmentAssistantModal";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function ParentDashboard() {
  const { user, getAccessTokenSilently } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [isAssistantModalOpen, setIsAssistantModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  // Fetch children data with Auth0 token
  const { data: childrenData, isLoading: childrenLoading } = useQuery({
    queryKey: ["/api/children"],
    queryFn: async () => {
      try {
        const token = await getAccessTokenSilently();
        const response = await fetch("/api/children", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        console.error("Error fetching children:", error);
        return [];
      }
    },
    enabled: !!user,
  });

  // Fetch enrollments data with Auth0 token
  const { data: enrollmentsData, isLoading: enrollmentsLoading } = useQuery({
    queryKey: ["/api/enrollments"],
    queryFn: async () => {
      try {
        const token = await getAccessTokenSilently();
        const response = await fetch("/api/enrollments", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        console.error("Error fetching enrollments:", error);
        return [];
      }
    },
    enabled: !!user,
  });

  // Fetch upcoming events with Auth0 token
  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ["/api/events/upcoming"],
    queryFn: async () => {
      try {
        const token = await getAccessTokenSilently();
        const response = await fetch("/api/events/upcoming", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        console.error("Error fetching events:", error);
        return [];
      }
    },
    enabled: !!user,
  });

  // Fetch payment summary (keeping original since it works)
  const { data: paymentData, isLoading: paymentLoading } = useQuery({
    queryKey: ["/api/payments/summary"],
  });

  // Handle syncing children accounts with parent email
  const handleSyncChildren = async () => {
    console.log('🔄 Starting sync process...');
    setIsSyncing(true);
    try {
      console.log('🔐 Getting Auth0 token...');
      const token = await getAccessTokenSilently();
      console.log('✅ Token received, length:', token?.length);
      
      console.log('📡 Making sync request...');
      const response = await apiRequest("POST", "/api/sync-children", undefined, { token });
      console.log('📨 Response received:', response.status);
      
      const result = await response.json();
      console.log('📊 Sync result:', result);
      console.log('🔍 Debug info:', result.debug);
      
      toast({
        title: "Sync Complete",
        description: `Successfully synced ${result.syncedChildren} children with your account`,
      });
      
      // Refresh children data
      queryClient.invalidateQueries({ queryKey: ["/api/children"] });
    } catch (error) {
      console.error('❌ Sync error:', error);
      toast({
        title: "Sync Failed",
        description: `Unable to sync children accounts: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Parent Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {user?.displayName || "Parent"}! Manage your children's education journey.
          </p>
        </div>
        <div className="flex space-x-2">
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

        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">My Children</CardTitle>
                <User className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{childrenData?.length || 0}</div>
                <p className="text-xs text-muted-foreground">Registered children</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Enrollments</CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{enrollmentsData?.length || 0}</div>
                <p className="text-xs text-muted-foreground">Active program enrollments</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Upcoming Events</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{eventsData?.length || 0}</div>
                <p className="text-xs text-muted-foreground">in the next 7 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Payments</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{paymentData?.pending || 0}</div>
                <p className="text-xs text-muted-foreground">Pending payments</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upcoming Events */}
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Events</CardTitle>
                <CardDescription>Scheduled classes and activities</CardDescription>
              </CardHeader>
              <CardContent>
                {eventsLoading ? (
                  <div className="text-center py-8">Loading events...</div>
                ) : eventsData?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No upcoming events scheduled</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {eventsData?.map((event: any) => (
                      <div key={event.id} className="flex items-center gap-3 p-3 rounded-lg border">
                        <div className="flex-shrink-0">
                          <Calendar className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{event.title}</p>
                          <p className="text-sm text-muted-foreground">{event.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common parent tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  onClick={() => setIsAssistantModalOpen(true)}
                  className="w-full justify-start h-auto p-4"
                >
                  <Bot className="mr-3 h-5 w-5" />
                  <div className="text-left">
                    <div className="font-medium">AI Enrollment Assistant</div>
                    <div className="text-sm opacity-90">Register & find programs</div>
                  </div>
                </Button>

                <Button asChild variant="outline" className="w-full justify-start h-auto p-4">
                  <Link href="/children">
                    <UserPlus className="mr-3 h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">My Children</div>
                      <div className="text-sm text-muted-foreground">Manage profiles</div>
                    </div>
                  </Link>
                </Button>

                <Button asChild variant="outline" className="w-full justify-start h-auto p-4">
                  <Link href="/enrollments">
                    <BookOpen className="mr-3 h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">Enrollments</div>
                      <div className="text-sm text-muted-foreground">View program status</div>
                    </div>
                  </Link>
                </Button>

                <Button asChild variant="outline" className="w-full justify-start h-auto p-4">
                  <Link href="/payments">
                    <CreditCard className="mr-3 h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">Payments</div>
                      <div className="text-sm text-muted-foreground">Manage billing</div>
                    </div>
                  </Link>
                </Button>

                <Button 
                  onClick={handleSyncChildren}
                  disabled={isSyncing}
                  variant="outline" 
                  className="w-full justify-start h-auto p-4"
                >
                  <RefreshCw className={`mr-3 h-5 w-5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <div className="text-left">
                    <div className="font-medium">
                      {isSyncing ? 'Syncing...' : 'Sync Children'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Link children by email
                    </div>
                  </div>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="children" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Children</CardTitle>
              <CardDescription>Manage your children's profiles and information</CardDescription>
            </CardHeader>
            <CardContent>
              {childrenLoading ? (
                <div className="text-center py-8">Loading children information...</div>
              ) : !Array.isArray(childrenData) || childrenData?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-2" />
                  <p>No children registered yet</p>
                  <Button className="mt-4" asChild>
                    <Link href="/children/register">Register Your First Child</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {childrenData.map((child: any) => (
                    <div key={child.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <User className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium">{child.name}</p>
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
              <CardDescription>View your children's class schedules and upcoming events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-2" />
                <p>Schedule view coming soon</p>
                <p className="text-sm">Track all your children's classes and activities in one place</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Floating AI Assistant Button - Fixed Position */}
      <Button
        onClick={() => setIsAssistantModalOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
      >
        <Bot className="h-6 w-6" />
        <span className="sr-only">AI Enrollment Assistant</span>
      </Button>
      
      {/* AI Assistant Modal */}
      <EnrollmentAssistantModal 
        isOpen={isAssistantModalOpen} 
        onClose={() => setIsAssistantModalOpen(false)} 
      />
    </div>
  );
}