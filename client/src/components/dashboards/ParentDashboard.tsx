import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { PlusCircle, User, Calendar, BookOpen, Clock, DollarSign, Users, UserPlus, CreditCard, RefreshCw, FileText, FolderOpen, Loader2, Award, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/SupabaseProvider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/contexts/CartContext";
import OnboardingTour from "@/components/onboarding/OnboardingTour";


export default function ParentDashboard() {
  const { user, session } = useAuth();
  const [, setLocation] = useLocation();
  const [userSchool, setUserSchool] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [isSyncing, setIsSyncing] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const { toast } = useToast();

  // Fetch onboarding status
  const { data: onboardingStatus } = useQuery({
    queryKey: ["/api/onboarding/status"],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      if (!token) return null;
      
      const response = await fetch("/api/onboarding/status", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!session,
  });

  // Complete onboarding tour mutation
  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch("/api/onboarding/complete", {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      toast({
        title: "Tour Complete!",
        description: "You're all set to start enrolling your children.",
      });
    }
  });

  // Show tour if user hasn't completed it and tour is enabled
  useEffect(() => {
    if (onboardingStatus?.shouldShowTour && !showTour) {
      const timer = setTimeout(() => {
        setShowTour(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [onboardingStatus?.shouldShowTour]);

  const handleTourClose = () => {
    setShowTour(false);
    completeOnboardingMutation.mutate();
  };

  const handleTourComplete = () => {
    setShowTour(false);
    completeOnboardingMutation.mutate();
  };

  // Note: Cart loading is handled by CartContext useEffect - no need to duplicate here

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
    queryKey: ["/api/parent/enrollments"],
    enabled: !!user && !!session,
  });

  // Fetch upcoming events
  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ["/api/events/upcoming"],
    enabled: !!user && !!session,
  });

  // Fetch parent documents (signed agreements)
  interface ParentDocument {
    id: number;
    type: string;
    title: string;
    schoolName: string;
    signedAt: string;
    signatoryName: string;
    agreementVersion: string;
  }
  
  const { data: documentsData, isLoading: documentsLoading, isError: documentsError } = useQuery<{ documents: ParentDocument[] }>({
    queryKey: ["/api/parent/documents"],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      const response = await fetch("/api/parent/documents", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!user && !!session,
    retry: 1,
  });

  // Fetch parent membership enrollments
  interface MembershipEnrollment {
    id: number;
    schoolId: number;
    schoolName: string;
    schoolLogo: string | null;
    membershipYear: string;
    status: string;
    amount: number;
    amountPaid: number;
    remainingBalance: number;
    dueDate: string | null;
    expirationDate: string | null;
    startDate: string | null;
    renewalDate: string | null;
    membershipDescription: string | null;
  }
  
  const { data: membershipsData, isLoading: membershipsLoading, isError: membershipsError } = useQuery<MembershipEnrollment[]>({
    queryKey: ["/api/parent/memberships"],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      const response = await fetch("/api/parent/memberships", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch memberships: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!user && !!session,
    retry: 1,
  });

  // Helper function to get membership status display info
  const getMembershipStatusInfo = (status: string) => {
    switch (status) {
      case 'active':
        return { label: 'Active', color: 'bg-green-100 text-green-800', icon: CheckCircle };
      case 'pending':
      case 'pending_payment':
        return { label: 'Pending Payment', color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle };
      case 'expired':
        return { label: 'Expired', color: 'bg-red-100 text-red-800', icon: XCircle };
      case 'cancelled':
        return { label: 'Cancelled', color: 'bg-gray-100 text-gray-800', icon: XCircle };
      case 'grace_period':
        return { label: 'Grace Period', color: 'bg-orange-100 text-orange-800', icon: AlertCircle };
      default:
        return { label: status, color: 'bg-gray-100 text-gray-800', icon: AlertCircle };
    }
  };

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
    <>
      <OnboardingTour
        isOpen={showTour}
        onClose={handleTourClose}
        onComplete={handleTourComplete}
      />
      
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div className="flex-1 min-w-0" data-tour="welcome-section">
          <h1 className="text-2xl md:text-3xl font-bold break-words">{userSchool ? `${userSchool.name} - Parent Dashboard` : 'Parent Dashboard'}</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            {userSchool
              ? `Welcome back, ${user?.displayName || "Parent"}! Manage your children's education at ${userSchool.name}.`
              : `Welcome back, ${user?.displayName || "Parent"}! Manage your children's education journey.`
            }
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto" data-tour="children-section">
          <Button asChild className="w-full sm:w-auto" data-testid="btn-register-child">
            <Link href="/children/register">
              <PlusCircle className="mr-2 h-4 w-4" />
              Register Child
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto whitespace-nowrap" data-tour="classes-section" data-testid="btn-browse-classes">
            <Link href="/programs">
              <BookOpen className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Browse Classes & Programs</span>
              <span className="sm:hidden">Browse Classes</span>
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
                <div className="text-2xl font-bold">
                  {enrollmentsData?.filter((e: any) => e.paymentStatus !== 'completed').length || 0}
                </div>
                <p className="text-xs text-muted-foreground">Unpaid enrollments</p>
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
            <Card data-tour="cart-section">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common parent tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild variant="outline" className="w-full justify-start h-auto p-4" data-tour="profile-section" data-testid="btn-my-children">
                  <Link href="/children">
                    <UserPlus className="mr-3 h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">My Children</div>
                      <div className="text-sm text-muted-foreground">Manage profiles</div>
                    </div>
                  </Link>
                </Button>

                <Button asChild variant="outline" className="w-full justify-start h-auto p-4" data-tour="enrollment-info" data-testid="btn-enrollments">
                  <Link href="/enrollments">
                    <BookOpen className="mr-3 h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">Enrollments</div>
                      <div className="text-sm text-muted-foreground">View program status</div>
                    </div>
                  </Link>
                </Button>

                <Button asChild variant="outline" className="w-full justify-start h-auto p-4" data-tour="payments-section" data-testid="btn-payments">
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

          {/* My Membership Card */}
          <Card data-testid="card-my-membership">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  My Membership
                </CardTitle>
                {membershipsData && membershipsData.length > 0 && (
                  <Badge variant="secondary">
                    {membershipsData.length} membership{membershipsData.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              <CardDescription>
                View your membership status and payment details
              </CardDescription>
            </CardHeader>
            <CardContent>
              {membershipsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Loading membership...</span>
                </div>
              ) : membershipsError ? (
                <div className="text-center py-4 text-muted-foreground">
                  <Award className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-red-500">Unable to load membership.</p>
                  <Button 
                    variant="link" 
                    size="sm" 
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/parent/memberships"] })}
                    className="mt-1"
                  >
                    Try again
                  </Button>
                </div>
              ) : !membershipsData || membershipsData.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <Award className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No membership yet.</p>
                  <p className="text-xs">Enroll in a program to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {membershipsData.map((membership) => {
                    const statusInfo = getMembershipStatusInfo(membership.status);
                    const StatusIcon = statusInfo.icon;
                    
                    return (
                      <div 
                        key={membership.id} 
                        className="p-4 rounded-lg border bg-muted/30"
                        data-testid={`membership-item-${membership.id}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            {membership.schoolLogo ? (
                              <img 
                                src={membership.schoolLogo} 
                                alt={membership.schoolName}
                                className="h-10 w-10 object-contain rounded"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <Award className="h-5 w-5 text-primary" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium">{membership.schoolName}</p>
                              <p className="text-xs text-muted-foreground">
                                {membership.membershipYear} Membership
                              </p>
                            </div>
                          </div>
                          <Badge className={statusInfo.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusInfo.label}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground">Amount</p>
                            <p className="font-medium">${(membership.amount / 100).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Paid</p>
                            <p className="font-medium">${(membership.amountPaid / 100).toFixed(2)}</p>
                          </div>
                          {membership.remainingBalance > 0 && (
                            <div>
                              <p className="text-muted-foreground">Balance Due</p>
                              <p className="font-medium text-orange-600">${(membership.remainingBalance / 100).toFixed(2)}</p>
                            </div>
                          )}
                          {membership.expirationDate && (
                            <div>
                              <p className="text-muted-foreground">Expires</p>
                              <p className="font-medium">{new Date(membership.expirationDate).toLocaleDateString()}</p>
                            </div>
                          )}
                        </div>
                        
                        {membership.status === 'pending' || membership.status === 'pending_payment' ? (
                          <Button 
                            className="w-full mt-3" 
                            size="sm"
                            asChild
                          >
                            <Link href="/payments">
                              <CreditCard className="mr-2 h-4 w-4" />
                              Pay Now
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* My Documents Card */}
          <Card data-testid="card-my-documents">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5" />
                  My Documents
                </CardTitle>
                {documentsData?.documents && documentsData.documents.length > 0 && (
                  <Badge variant="secondary">
                    {documentsData.documents.length} document{documentsData.documents.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              <CardDescription>
                View and download your signed agreements and important documents
              </CardDescription>
            </CardHeader>
            <CardContent>
              {documentsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Loading documents...</span>
                </div>
              ) : documentsError ? (
                <div className="text-center py-4 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-red-500">Unable to load documents.</p>
                  <Button 
                    variant="link" 
                    size="sm" 
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/parent/documents"] })}
                    className="mt-1"
                  >
                    Try again
                  </Button>
                </div>
              ) : !documentsData?.documents || documentsData.documents.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No documents yet.</p>
                  <p className="text-xs">Signed agreements will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {documentsData.documents.slice(0, 3).map((doc) => (
                    <div 
                      key={doc.id} 
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                      data-testid={`document-item-${doc.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{doc.title}</p>
                          <p className="text-xs text-muted-foreground">
                            Signed on {new Date(doc.signedAt).toLocaleDateString()} • v{doc.agreementVersion}
                          </p>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        asChild
                        data-testid={`button-view-document-${doc.id}`}
                      >
                        <Link href={`/parent/documents/${doc.id}`}>
                          View
                        </Link>
                      </Button>
                    </div>
                  ))}
                  {documentsData.documents.length > 3 && (
                    <Button variant="link" asChild className="w-full">
                      <Link href="/parent/documents">
                        View all {documentsData.documents.length} documents →
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
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
                    <div 
                      key={enrollment.id || `enrollment-${index}`} 
                      className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => {
                        // Navigate to checkout if payment is pending
                        if (enrollment.status === 'pending_payment') {
                          setLocation('/cart/checkout');
                        } else {
                          // For other statuses, could navigate to enrollment details
                          // For now, just show a toast
                          toast({
                            title: "Enrollment Details",
                            description: `${enrollment.className} for ${enrollment.childName}`,
                          });
                        }
                      }}
                      data-testid={`enrollment-card-${enrollment.id}`}
                    >
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
    </>
  );
}