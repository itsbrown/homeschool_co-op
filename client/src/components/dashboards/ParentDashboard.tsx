import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { PlusCircle, User, Calendar, BookOpen, Clock, DollarSign, Users, UserPlus, CreditCard, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/SupabaseProvider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/contexts/CartContext";


export default function ParentDashboard() {
  const { user, session } = useAuth();
  const [, setLocation] = useLocation();
  const [userSchool, setUserSchool] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();
  const { loadUnpaidEnrollments } = useCart();

  // Load unpaid enrollments when component mounts or user changes
  useEffect(() => {
    if (user && session) {
      loadUnpaidEnrollments();
    }
  }, [user, session, loadUnpaidEnrollments]);

  // Check for new parent registration and show welcome guidance
  useEffect(() => {
    const newRegistrationData = sessionStorage.getItem('newParentRegistration');
    if (newRegistrationData) {
      try {
        const registrationInfo = JSON.parse(newRegistrationData);
        if (registrationInfo.registrationCompleted) {
          toast({
            title: "Welcome to American Seekers Academy!",
            description: `Registration successful for ${registrationInfo.schoolName || 'your school'}. Next step: Register your children to start enrolling in classes.`,
          });
          
          // Clear the registration flag
          sessionStorage.removeItem('newParentRegistration');
          
          // Optionally show the children tab after a delay
          setTimeout(() => {
            setActiveTab("children");
          }, 3000);
        }
      } catch (error) {
        console.error('Error parsing registration data:', error);
        sessionStorage.removeItem('newParentRegistration');
      }
    }
  }, [toast]);

  // Fetch children data from authenticated parent endpoint
  const { data: childrenData, isLoading: childrenLoading } = useQuery({
    queryKey: ["/api/parent/children"],
    queryFn: async () => {
      try {
        const token = localStorage.getItem('supabase_token');
        if (!token) {
          throw new Error('No authentication token found');
        }

        const response = await fetch("/api/parent/children", {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const children = await response.json();
        return children;
      } catch (error) {
        console.error("Error fetching children:", error);
        return [];
      }
    },
    enabled: true,
  });

  // Fetch enrollments data
  const { data: enrollmentsData, isLoading: enrollmentsLoading } = useQuery({
    queryKey: ["/api/enrollments"],
    enabled: !!user && !!session,
    onSuccess: () => {
      // Refresh cart when enrollments change
      loadUnpaidEnrollments();
    },
  });

  // Fetch upcoming events
  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ["/api/events/upcoming"],
    enabled: !!user && !!session,
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
      console.log('📡 Making sync request...');
      const response = await apiRequest("POST", "/api/sync-children");
      console.log('📨 Response received:', response.status);

      const result = await response.json();
      console.log('📊 Sync result:', result);

      toast({
        title: "Sync Complete",
        description: `Successfully synced ${result.syncedChildren || 0} children with your account`,
      });

      // Refresh children data
      queryClient.invalidateQueries({ queryKey: ["/api/parent/children"] });
    } catch (error) {
      console.error('❌ Sync error:', error);
      toast({
        title: "Sync Failed",
        description: `Unable to sync children accounts: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

    // Fetch user's associated school
    useEffect(() => {
      if (user?.email) {
        const fetchUserSchool = async () => {
          try {
            const response = await apiRequest("GET", `/api/school-parents/school/${user.email}`);
            if (response.ok) {
              const result = await response.json();
              if (result.success && result.school) {
                setUserSchool(result.school);
              }
            }
          } catch (error) {
            console.log('No school association found for user');
          }
        };
        fetchUserSchool();
      }
    }, [user?.email]);

  return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">{userSchool ? `${userSchool.name} - Parent Dashboard` : 'Parent Dashboard'}</h1>
          <p className="text-muted-foreground mt-1">
            {userSchool
              ? `Welcome back, ${user?.displayName || "Parent"}! Manage your children's education at ${userSchool.name}.`
              : `Welcome back, ${user?.displayName || "Parent"}! Manage your children's education journey.`
            }
          </p>
        </div>
        <div className="flex space-x-2">
          <Button asChild>
            <Link href="/children/register">
              <PlusCircle className="mr-2 h-4 w-4" />
              Register Child
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/programs">
              <BookOpen className="mr-2 h-4 w-4" />
              Browse Classes & Programs
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
                    {eventsData?.map((event: any, index: number) => (
                      <div key={event.id || `event-${index}`} className="flex items-center gap-3 p-3 rounded-lg border">
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
                  {childrenData.map((child: any, index: number) => {
                    // Calculate age from birthdate
                    const calculateAge = (birthdate: string) => {
                      if (!birthdate) return 'Unknown';
                      const today = new Date();
                      const birth = new Date(birthdate);
                      let age = today.getFullYear() - birth.getFullYear();
                      const monthDiff = today.getMonth() - birth.getMonth();
                      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
                        age--;
                      }
                      return age;
                    };

                    const fullName = `${child.firstName || ''} ${child.lastName || ''}`.trim();
                    const age = calculateAge(child.birthdate);

                    // Get enrollments for this child
                    const childEnrollments = enrollmentsData?.filter((e: any) => e.childId === child.id) || [];

                    return (
                      <div key={child.id || `child-${index}`} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <User className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium">{fullName}</p>
                              <p className="text-sm text-muted-foreground">Age: {age} • Grade: {child.gradeLevel || 'Not specified'}</p>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/children/${child.id}`}>View Profile</Link>
                          </Button>
                        </div>
                        
                        {/* Child's Enrollments */}
                        {childEnrollments.length > 0 && (
                          <div className="ml-14 space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">Enrollments ({childEnrollments.length})</p>
                            <div className="space-y-2">
                              {childEnrollments.map((enrollment: any) => (
                                <div key={enrollment.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                  <div className="flex items-center gap-2">
                                    <BookOpen className="h-4 w-4 text-blue-600" />
                                    <span className="text-sm">{enrollment.className}</span>
                                  </div>
                                  <Badge 
                                    variant={enrollment.status === 'enrolled' ? 'default' : 'secondary'}
                                    className={enrollment.status === 'enrolled' ? 'bg-green-100 text-green-800' : ''}
                                  >
                                    {enrollment.status}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
              ) : !enrollmentsData || enrollmentsData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-2" />
                  <p>No active enrollments</p>
                  <Button className="mt-4" asChild>
                    <Link href="/programs">Browse Programs</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {enrollmentsData.map((enrollment: any, index: number) => (
                    <div key={enrollment.id || `enrollment-${index}`} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">{enrollment.className}</h4>
                          <p className="text-sm text-muted-foreground">
                            {enrollment.childName} • Enrolled on {new Date(enrollment.enrollmentDate).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge 
                          variant={enrollment.status === 'enrolled' ? 'default' : 'secondary'}
                          className={enrollment.status === 'enrolled' ? 'bg-green-100 text-green-800' : ''}
                        >
                          {enrollment.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
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
      </div>
  );
}